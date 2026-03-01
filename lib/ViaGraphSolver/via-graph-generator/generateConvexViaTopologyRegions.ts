import { ConvexRegionsSolver } from "@tscircuit/find-convex-regions"
import type {
  JPort,
  JRegion,
  JumperGraph,
} from "../../JumperGraphSolver/jumper-types"
import type { RouteSegment, ViaTile } from "../ViaGraphSolver"
import { createPortsAlongEdge, findSharedEdges } from "./findSharedEdges"

/**
 * Default port pitch (mm) for distributing ports along shared boundaries.
 */
const DEFAULT_PORT_PITCH = 0.4

/**
 * Default clearance (mm) around via regions for convex region computation.
 */
const DEFAULT_CLEARANCE = 0.1

type Point = { x: number; y: number }
type Bounds = { minX: number; maxX: number; minY: number; maxY: number }

/**
 * Unit tile template containing convex regions computed once.
 * This is centered at (0,0) with dimensions tileWidth x tileHeight.
 */
interface UnitTileTemplate {
  /** Via regions within the tile (centered at origin) */
  viaRegions: Array<{
    netName: string
    polygon: Point[]
    bounds: Bounds
    center: Point
  }>
  /** Convex regions computed by ConvexRegionsSolver (centered at origin) */
  convexRegions: Array<{
    polygon: Point[]
    bounds: Bounds
    center: Point
  }>
  /** Tile dimensions */
  tileWidth: number
  tileHeight: number
}

type HorizontalSegment = { xStart: number; xEnd: number; y: number }
type VerticalSegment = { x: number; yStart: number; yEnd: number }

/**
 * Remove consecutive duplicate points from a polygon.
 * Points are considered duplicates if they are within tolerance distance.
 */
function deduplicateConsecutivePoints(
  points: Point[],
  tolerance = 0.001,
): Point[] {
  if (points.length <= 1) return points

  const result: Point[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2)
    if (dist > tolerance) {
      result.push(curr)
    }
  }

  // Also check if last point equals first point (for closed polygons)
  if (result.length > 1) {
    const first = result[0]
    const last = result[result.length - 1]
    const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2)
    if (dist < tolerance) {
      result.pop()
    }
  }

  return result
}

/**
 * Compute bounding box from polygon points.
 */
function boundsFromPolygon(points: Point[]): Bounds {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}

/**
 * Compute centroid of polygon.
 */
function centroid(points: Point[]): Point {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  return { x: cx / points.length, y: cy / points.length }
}

/**
 * Create a JRegion from a polygon.
 */
function createRegionFromPolygon(
  regionId: string,
  polygon: Point[],
  opts?: { isViaRegion?: boolean },
): JRegion {
  const bounds = boundsFromPolygon(polygon)
  return {
    regionId,
    ports: [],
    d: {
      bounds,
      center: centroid(polygon),
      polygon,
      isPad: false,
      isViaRegion: opts?.isViaRegion,
    },
  }
}

/**
 * Generate a via region polygon for a single net's vias.
 * The polygon wraps around all vias for that net.
 */
function generateViaRegionPolygon(
  vias: Array<{ viaId: string; diameter: number; position: Point }>,
): Point[] {
  if (vias.length === 0) return []

  // Find extreme vias
  const topVia = vias.reduce((best, v) =>
    v.position.y > best.position.y ? v : best,
  )
  const bottomVia = vias.reduce((best, v) =>
    v.position.y < best.position.y ? v : best,
  )
  const leftVia = vias.reduce((best, v) =>
    v.position.x < best.position.x ? v : best,
  )
  const rightVia = vias.reduce((best, v) =>
    v.position.x > best.position.x ? v : best,
  )

  // Compute edge segments
  const topSeg: HorizontalSegment = {
    xStart: topVia.position.x - topVia.diameter / 2,
    xEnd: topVia.position.x + topVia.diameter / 2,
    y: topVia.position.y + topVia.diameter / 2,
  }
  const botSeg: HorizontalSegment = {
    xStart: bottomVia.position.x - bottomVia.diameter / 2,
    xEnd: bottomVia.position.x + bottomVia.diameter / 2,
    y: bottomVia.position.y - bottomVia.diameter / 2,
  }
  const leftSeg: VerticalSegment = {
    x: leftVia.position.x - leftVia.diameter / 2,
    yStart: leftVia.position.y - leftVia.diameter / 2,
    yEnd: leftVia.position.y + leftVia.diameter / 2,
  }
  const rightSeg: VerticalSegment = {
    x: rightVia.position.x + rightVia.diameter / 2,
    yStart: rightVia.position.y - rightVia.diameter / 2,
    yEnd: rightVia.position.y + rightVia.diameter / 2,
  }

  // Build polygon (clockwise):
  // top-left -> top-right -> right-top -> right-bottom ->
  // bottom-right -> bottom-left -> left-bottom -> left-top -> close
  const rawPolygon = [
    { x: topSeg.xStart, y: topSeg.y },
    { x: topSeg.xEnd, y: topSeg.y },
    { x: rightSeg.x, y: rightSeg.yEnd },
    { x: rightSeg.x, y: rightSeg.yStart },
    { x: botSeg.xEnd, y: botSeg.y },
    { x: botSeg.xStart, y: botSeg.y },
    { x: leftSeg.x, y: leftSeg.yStart },
    { x: leftSeg.x, y: leftSeg.yEnd },
  ]

  // Remove consecutive duplicate points (happens when same via is extreme in multiple directions)
  return deduplicateConsecutivePoints(rawPolygon)
}

/**
 * Translate via positions by (dx, dy).
 */
function translateVias(
  vias: Array<{ viaId: string; diameter: number; position: Point }>,
  dx: number,
  dy: number,
  prefix: string,
): Array<{ viaId: string; diameter: number; position: Point }> {
  return vias.map((v) => ({
    viaId: `${prefix}:${v.viaId}`,
    diameter: v.diameter,
    position: {
      x: v.position.x + dx,
      y: v.position.y + dy,
    },
  }))
}

function translateRouteSegments(
  routeSegments: RouteSegment[],
  dx: number,
  dy: number,
  prefix: string,
): RouteSegment[] {
  return routeSegments.map((segment) => ({
    routeId: `${prefix}:${segment.routeId}`,
    fromPort: `${prefix}:${segment.fromPort}`,
    toPort: `${prefix}:${segment.toPort}`,
    layer: segment.layer,
    segments: segment.segments.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    })),
  }))
}

/**
 * Translate a polygon by (dx, dy).
 */
function translatePolygon(polygon: Point[], dx: number, dy: number): Point[] {
  return polygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))
}

/**
 * Create rectangular polygon from bounds.
 */
function rectPolygonFromBounds(b: Bounds): Point[] {
  return [
    { x: b.minX, y: b.minY },
    { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY },
    { x: b.minX, y: b.maxY },
  ]
}

/**
 * Extend via region polygon to tile boundary when extremely close (< threshold).
 * Only extends polygon edges that are within threshold of the tile boundary.
 * This prevents thin convex regions from being created in small gaps.
 */
function extendViaRegionToTileEdge(
  polygon: Point[],
  tileBounds: Bounds,
  threshold = 0.1,
): Point[] {
  if (polygon.length === 0) return polygon

  const polyBounds = boundsFromPolygon(polygon)

  // Calculate distance from polygon edges to tile edges
  const distToLeft = polyBounds.minX - tileBounds.minX
  const distToRight = tileBounds.maxX - polyBounds.maxX
  const distToBottom = polyBounds.minY - tileBounds.minY
  const distToTop = tileBounds.maxY - polyBounds.maxY

  // Only extend if extremely close (< threshold)
  const extendLeft = distToLeft > 0 && distToLeft < threshold
  const extendRight = distToRight > 0 && distToRight < threshold
  const extendBottom = distToBottom > 0 && distToBottom < threshold
  const extendTop = distToTop > 0 && distToTop < threshold

  if (!extendLeft && !extendRight && !extendBottom && !extendTop) {
    return polygon
  }

  const result = polygon.map((p) => {
    let x = p.x
    let y = p.y

    // Extend points on polygon's left edge to tile's left boundary
    if (extendLeft && Math.abs(p.x - polyBounds.minX) < 0.001) {
      x = tileBounds.minX
    }
    // Extend points on polygon's right edge to tile's right boundary
    if (extendRight && Math.abs(p.x - polyBounds.maxX) < 0.001) {
      x = tileBounds.maxX
    }
    // Extend points on polygon's bottom edge to tile's bottom boundary
    if (extendBottom && Math.abs(p.y - polyBounds.minY) < 0.001) {
      y = tileBounds.minY
    }
    // Extend points on polygon's top edge to tile's top boundary
    if (extendTop && Math.abs(p.y - polyBounds.maxY) < 0.001) {
      y = tileBounds.maxY
    }

    return { x, y }
  })

  return deduplicateConsecutivePoints(result)
}

/**
 * Check if a point is inside or on the boundary of a polygon.
 */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    // Check if point is on edge
    const onEdge =
      Math.abs((point.y - yi) * (xj - xi) - (point.x - xi) * (yj - yi)) <
        0.001 &&
      point.x >= Math.min(xi, xj) - 0.001 &&
      point.x <= Math.max(xi, xj) + 0.001 &&
      point.y >= Math.min(yi, yj) - 0.001 &&
      point.y <= Math.max(yi, yj) + 0.001

    if (onEdge) return true

    if (yi > point.y !== yj > point.y) {
      const intersectX = ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
      if (point.x < intersectX) {
        inside = !inside
      }
    }
  }
  return inside
}

/**
 * Find the region that contains the given point.
 */
function findRegionContainingPoint(
  point: Point,
  regions: JRegion[],
): JRegion | null {
  for (const region of regions) {
    if (region.d.polygon && pointInPolygon(point, region.d.polygon)) {
      return region
    }
  }
  return null
}

/**
 * Compute the unit tile template by running ConvexRegionsSolver once.
 * The tile is centered at (0, 0).
 */
function computeUnitTileTemplate(
  viaTile: ViaTile,
  tileWidth: number,
  tileHeight: number,
  clearance: number,
  concavityTolerance: number,
): UnitTileTemplate {
  const halfWidth = tileWidth / 2
  const halfHeight = tileHeight / 2

  // Tile bounds centered at origin
  const tileBounds: Bounds = {
    minX: -halfWidth,
    maxX: halfWidth,
    minY: -halfHeight,
    maxY: halfHeight,
  }

  // Generate via region polygons for the unit tile (centered at origin)
  const viaRegions: UnitTileTemplate["viaRegions"] = []

  for (const [netName, vias] of Object.entries(viaTile.viasByNet)) {
    if (vias.length === 0) continue

    const polygon = generateViaRegionPolygon(vias)
    if (polygon.length === 0) continue

    viaRegions.push({
      netName,
      polygon,
      bounds: boundsFromPolygon(polygon),
      center: centroid(polygon),
    })
  }

  // Extend via region polygons to tile edge when extremely close (< 0.1mm)
  // This prevents thin convex regions from being created in small gaps
  const obstaclePolygons = viaRegions.map((r) => ({
    points: extendViaRegionToTileEdge(r.polygon, tileBounds),
  }))

  const solver = new ConvexRegionsSolver({
    bounds: tileBounds,
    polygons: obstaclePolygons,
    clearance,
    concavityTolerance,
  })

  solver.solve()
  const solverOutput = solver.getOutput()

  if (!solverOutput) {
    throw new Error("ConvexRegionsSolver failed to compute unit tile regions")
  }

  // Convert solver output to template format
  const convexRegions: UnitTileTemplate["convexRegions"] =
    solverOutput.regions.map((polygon: Point[]) => ({
      polygon,
      bounds: boundsFromPolygon(polygon),
      center: centroid(polygon),
    }))

  return {
    viaRegions,
    convexRegions,
    tileWidth,
    tileHeight,
  }
}

/**
 * Generates a via topology using convex regions computed by ConvexRegionsSolver.
 *
 * New tiled approach:
 * 1. Compute convex regions for a single unit tile (centered at origin)
 * 2. Replicate the tile's regions across the grid by translation
 * 3. Create rectangular filler regions for outer areas:
 *    - Top/bottom regions extend horizontally across full bounds width
 *    - Left/right regions extend vertically between top/bottom regions
 * 4. Create ports between adjacent tiles and between tiles and filler regions
 */
export function generateConvexViaTopologyRegions(opts: {
  viaTile: ViaTile
  bounds: Bounds
  tileWidth?: number
  tileHeight?: number
  tileSize?: number
  portPitch?: number
  clearance?: number
  concavityTolerance?: number
}): {
  regions: JRegion[]
  ports: JPort[]
  viaTile: ViaTile
  tileCount: { rows: number; cols: number }
} {
  const tileWidth = opts.tileWidth ?? opts.tileSize ?? opts.viaTile.tileWidth
  const tileHeight = opts.tileHeight ?? opts.tileSize ?? opts.viaTile.tileHeight

  if (tileWidth === undefined || tileHeight === undefined) {
    throw new Error(
      "tileWidth and tileHeight must be provided either in opts or in viaTile",
    )
  }
  const portPitch = opts.portPitch ?? DEFAULT_PORT_PITCH
  const clearance = opts.clearance ?? DEFAULT_CLEARANCE
  const concavityTolerance = opts.concavityTolerance ?? 0
  const { bounds, viaTile: inputViaTile } = opts
  const { viasByNet, routeSegments } = inputViaTile

  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  const cols = Math.floor(width / tileWidth)
  const rows = Math.floor(height / tileHeight)

  const allRegions: JRegion[] = []
  const allPorts: JPort[] = []
  const viaTile: ViaTile = { viasByNet: {}, routeSegments: [] }
  const viaRegions: JRegion[] = []
  const convexRegions: JRegion[] = []

  // Calculate tile grid position (centered within bounds)
  const gridWidth = cols * tileWidth
  const gridHeight = rows * tileHeight
  const gridMinX = bounds.minX + (width - gridWidth) / 2
  const gridMinY = bounds.minY + (height - gridHeight) / 2
  const gridMaxX = gridMinX + gridWidth
  const gridMaxY = gridMinY + gridHeight
  const halfWidth = tileWidth / 2
  const halfHeight = tileHeight / 2

  let portIdCounter = 0

  // Track used port positions to prevent duplicates
  // Duplicates can occur when a via region shares edges with multiple convex
  // regions that meet at the same corner point
  const usedPortPositions = new Set<string>()
  const getPortPosKey = (x: number, y: number) =>
    `${x.toFixed(4)},${y.toFixed(4)}`

  // Helper to create a port between two regions (skips if position already used)
  const createPort = (
    portId: string,
    region1: JRegion,
    region2: JRegion,
    pos: { x: number; y: number },
  ): JPort | null => {
    const posKey = getPortPosKey(pos.x, pos.y)
    if (usedPortPositions.has(posKey)) {
      return null
    }
    usedPortPositions.add(posKey)
    const port: JPort = {
      portId,
      region1,
      region2,
      d: { x: pos.x, y: pos.y },
    }
    region1.ports.push(port)
    region2.ports.push(port)
    allPorts.push(port)
    return port
  }

  // Step 1: Compute unit tile template (only once)
  let unitTileTemplate: UnitTileTemplate | null = null
  if (rows > 0 && cols > 0) {
    unitTileTemplate = computeUnitTileTemplate(
      inputViaTile,
      tileWidth,
      tileHeight,
      clearance,
      concavityTolerance,
    )
  }

  // Step 2: Replicate tiles across the grid
  if (rows > 0 && cols > 0 && unitTileTemplate) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileCenterX = gridMinX + col * tileWidth + halfWidth
        const tileCenterY = gridMinY + row * tileHeight + halfHeight
        const prefix = `t${row}_${col}`

        // Create via regions for this tile (translated from template)
        for (const templateViaRegion of unitTileTemplate.viaRegions) {
          const translatedPolygon = translatePolygon(
            templateViaRegion.polygon,
            tileCenterX,
            tileCenterY,
          )

          const viaRegion = createRegionFromPolygon(
            `${prefix}:v:${templateViaRegion.netName}`,
            translatedPolygon,
            { isViaRegion: true },
          )
          viaRegions.push(viaRegion)
          allRegions.push(viaRegion)
        }

        // Create convex regions for this tile (translated from template)
        for (let i = 0; i < unitTileTemplate.convexRegions.length; i++) {
          const templateConvexRegion = unitTileTemplate.convexRegions[i]
          const translatedPolygon = translatePolygon(
            templateConvexRegion.polygon,
            tileCenterX,
            tileCenterY,
          )

          const convexRegion = createRegionFromPolygon(
            `${prefix}:convex:${i}`,
            translatedPolygon,
          )
          convexRegions.push(convexRegion)
          allRegions.push(convexRegion)
        }

        // Add vias to output viaTile
        for (const [netName, vias] of Object.entries(viasByNet)) {
          if (vias.length === 0) continue

          const translatedVias = translateVias(
            vias,
            tileCenterX,
            tileCenterY,
            prefix,
          )

          if (!viaTile.viasByNet[netName]) {
            viaTile.viasByNet[netName] = []
          }
          viaTile.viasByNet[netName].push(...translatedVias)
        }

        viaTile.routeSegments.push(
          ...translateRouteSegments(
            routeSegments,
            tileCenterX,
            tileCenterY,
            prefix,
          ),
        )
      }
    }
  }

  // Step 3: Create rectangular filler regions for outer areas
  // - Top/bottom: height = margin, width = portPitch (trace width)
  // - Left/right: width = margin, height = portPitch (trace width)
  // - Corner assignment: if top/bottom margin >= left/right margin, top/bottom get corners
  const fillerRegions: JRegion[] = []

  const topMargin = bounds.maxY - gridMaxY
  const bottomMargin = gridMinY - bounds.minY
  const leftMargin = gridMinX - bounds.minX
  const rightMargin = bounds.maxX - gridMaxX

  // Determine which direction gets corners based on larger margins
  const verticalMargin = Math.max(topMargin, bottomMargin)
  const horizontalMargin = Math.max(leftMargin, rightMargin)
  const topBottomGetCorners = verticalMargin >= horizontalMargin

  // Filler regions are multiple small rectangles (strips) along each edge:
  // - Top edge: multiple strips (portPitch width x topMargin height)
  // - Bottom edge: multiple strips (portPitch width x bottomMargin height)
  // - Left edge: multiple strips (leftMargin width x portPitch height)
  // - Right edge: multiple strips (rightMargin width x portPitch height)
  //
  // Corner assignment determines which edges extend to include corners:
  // - If topBottomGetCorners: top/bottom strips extend into corner areas
  // - Otherwise: left/right strips extend into corner areas

  // Calculate the extent for each edge (including corners if applicable)
  const topMinX = topBottomGetCorners ? bounds.minX : gridMinX
  const topMaxX = topBottomGetCorners ? bounds.maxX : gridMaxX
  const bottomMinX = topBottomGetCorners ? bounds.minX : gridMinX
  const bottomMaxX = topBottomGetCorners ? bounds.maxX : gridMaxX
  const leftMinY = topBottomGetCorners ? gridMinY : bounds.minY
  const leftMaxY = topBottomGetCorners ? gridMaxY : bounds.maxY
  const rightMinY = topBottomGetCorners ? gridMinY : bounds.minY
  const rightMaxY = topBottomGetCorners ? gridMaxY : bounds.maxY

  // Create top filler strips
  // Strip width = margin (same as height), but at least portPitch (trace width)
  if (topMargin > 0.001) {
    const topWidth = topMaxX - topMinX
    const targetStripWidth = Math.max(topMargin, portPitch)
    const numTopStrips = Math.max(1, Math.floor(topWidth / targetStripWidth))
    const stripWidth = topWidth / numTopStrips

    for (let i = 0; i < numTopStrips; i++) {
      const fillerBounds: Bounds = {
        minX: topMinX + i * stripWidth,
        maxX: topMinX + (i + 1) * stripWidth,
        minY: gridMaxY,
        maxY: bounds.maxY,
      }
      const regionId = `filler:top:${i}`
      const filler = createRegionFromPolygon(
        regionId,
        rectPolygonFromBounds(fillerBounds),
      )
      fillerRegions.push(filler)
      allRegions.push(filler)
    }
  }

  // Create bottom filler strips
  // Strip width = margin (same as height), but at least portPitch (trace width)
  if (bottomMargin > 0.001) {
    const bottomWidth = bottomMaxX - bottomMinX
    const targetStripWidth = Math.max(bottomMargin, portPitch)
    const numBottomStrips = Math.max(
      1,
      Math.floor(bottomWidth / targetStripWidth),
    )
    const stripWidth = bottomWidth / numBottomStrips

    for (let i = 0; i < numBottomStrips; i++) {
      const fillerBounds: Bounds = {
        minX: bottomMinX + i * stripWidth,
        maxX: bottomMinX + (i + 1) * stripWidth,
        minY: bounds.minY,
        maxY: gridMinY,
      }
      const regionId = `filler:bottom:${i}`
      const filler = createRegionFromPolygon(
        regionId,
        rectPolygonFromBounds(fillerBounds),
      )
      fillerRegions.push(filler)
      allRegions.push(filler)
    }
  }

  // Create left filler strips
  // Strip height = margin (same as width), but at least portPitch (trace width)
  if (leftMargin > 0.001) {
    const leftHeight = leftMaxY - leftMinY
    const targetStripHeight = Math.max(leftMargin, portPitch)
    const numLeftStrips = Math.max(
      1,
      Math.floor(leftHeight / targetStripHeight),
    )
    const stripHeight = leftHeight / numLeftStrips

    for (let i = 0; i < numLeftStrips; i++) {
      const fillerBounds: Bounds = {
        minX: bounds.minX,
        maxX: gridMinX,
        minY: leftMinY + i * stripHeight,
        maxY: leftMinY + (i + 1) * stripHeight,
      }
      const regionId = `filler:left:${i}`
      const filler = createRegionFromPolygon(
        regionId,
        rectPolygonFromBounds(fillerBounds),
      )
      fillerRegions.push(filler)
      allRegions.push(filler)
    }
  }

  // Create right filler strips
  // Strip height = margin (same as width), but at least portPitch (trace width)
  if (rightMargin > 0.001) {
    const rightHeight = rightMaxY - rightMinY
    const targetStripHeight = Math.max(rightMargin, portPitch)
    const numRightStrips = Math.max(
      1,
      Math.floor(rightHeight / targetStripHeight),
    )
    const stripHeight = rightHeight / numRightStrips

    for (let i = 0; i < numRightStrips; i++) {
      const fillerBounds: Bounds = {
        minX: gridMaxX,
        maxX: bounds.maxX,
        minY: rightMinY + i * stripHeight,
        maxY: rightMinY + (i + 1) * stripHeight,
      }
      const regionId = `filler:right:${i}`
      const filler = createRegionFromPolygon(
        regionId,
        rectPolygonFromBounds(fillerBounds),
      )
      fillerRegions.push(filler)
      allRegions.push(filler)
    }
  }

  // Step 4: Create ports between convex regions within each tile
  // Since all tiles use the same template, we need to create ports within each tile
  if (unitTileTemplate && rows > 0 && cols > 0) {
    const regionsPerTile = unitTileTemplate.convexRegions.length

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileIndex = row * cols + col
        const tileStartIdx = tileIndex * regionsPerTile

        // Create ports between convex regions within this tile
        for (let i = 0; i < regionsPerTile; i++) {
          for (let j = i + 1; j < regionsPerTile; j++) {
            const region1 = convexRegions[tileStartIdx + i]
            const region2 = convexRegions[tileStartIdx + j]

            const sharedEdges = findSharedEdges(
              region1.d.polygon!,
              region2.d.polygon!,
              clearance * 2,
            )

            for (const edge of sharedEdges) {
              const portPositions = createPortsAlongEdge(edge, portPitch)

              for (const pos of portPositions) {
                createPort(
                  `t${row}_${col}:convex:${i}-${j}:${portIdCounter++}`,
                  region1,
                  region2,
                  pos,
                )
              }
            }
          }
        }
      }
    }
  }

  // Step 5: Create ports between adjacent tiles (horizontal and vertical neighbors)
  // Use fixed port positions along tile boundaries to ensure connectivity even when
  // convex regions don't perfectly align at tile edges
  // Include both convex and via regions since via regions may extend to tile boundaries
  if (unitTileTemplate && rows > 0 && cols > 0) {
    const convexPerTile = unitTileTemplate.convexRegions.length
    const viasPerTile = unitTileTemplate.viaRegions.length

    // Generate port y-positions along vertical tile boundary
    const numVerticalPorts = Math.floor(tileHeight / portPitch)
    const verticalPortYOffsets: number[] = []
    for (let i = 0; i < numVerticalPorts; i++) {
      verticalPortYOffsets.push(-halfHeight + (i + 0.5) * portPitch)
    }

    // Generate port x-positions along horizontal tile boundary
    const numHorizontalPorts = Math.floor(tileWidth / portPitch)
    const horizontalPortXOffsets: number[] = []
    for (let i = 0; i < numHorizontalPorts; i++) {
      horizontalPortXOffsets.push(-halfWidth + (i + 0.5) * portPitch)
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tileIndex = row * cols + col
        const convexStartIdx = tileIndex * convexPerTile
        const viaStartIdx = tileIndex * viasPerTile
        const tileCenterX = gridMinX + col * tileWidth + halfWidth
        const tileCenterY = gridMinY + row * tileHeight + halfHeight

        // Get all regions for this tile (convex + via)
        const tileConvexRegions = convexRegions.slice(
          convexStartIdx,
          convexStartIdx + convexPerTile,
        )
        const tileViaRegions = viaRegions.slice(
          viaStartIdx,
          viaStartIdx + viasPerTile,
        )
        const tileAllRegions = [...tileConvexRegions, ...tileViaRegions]

        // Check right neighbor - create ports along vertical boundary
        if (col + 1 < cols) {
          const rightTileIndex = row * cols + (col + 1)
          const rightConvexStartIdx = rightTileIndex * convexPerTile
          const rightViaStartIdx = rightTileIndex * viasPerTile

          const rightTileConvexRegions = convexRegions.slice(
            rightConvexStartIdx,
            rightConvexStartIdx + convexPerTile,
          )
          const rightTileViaRegions = viaRegions.slice(
            rightViaStartIdx,
            rightViaStartIdx + viasPerTile,
          )
          const rightTileAllRegions = [
            ...rightTileConvexRegions,
            ...rightTileViaRegions,
          ]

          // Boundary x-coordinate (right edge of current tile)
          const boundaryX = tileCenterX + halfWidth

          for (const yOffset of verticalPortYOffsets) {
            const portY = tileCenterY + yOffset
            // Point slightly inside current tile (left of boundary)
            const pointInCurrentTile = { x: boundaryX - 0.01, y: portY }
            // Point slightly inside right tile (right of boundary)
            const pointInRightTile = { x: boundaryX + 0.01, y: portY }

            const region1 = findRegionContainingPoint(
              pointInCurrentTile,
              tileAllRegions,
            )
            const region2 = findRegionContainingPoint(
              pointInRightTile,
              rightTileAllRegions,
            )

            if (region1 && region2) {
              createPort(
                `tile:${row}_${col}-${row}_${col + 1}:${portIdCounter++}`,
                region1,
                region2,
                { x: boundaryX, y: portY },
              )
            }
          }
        }

        // Check top neighbor - create ports along horizontal boundary
        if (row + 1 < rows) {
          const topTileIndex = (row + 1) * cols + col
          const topConvexStartIdx = topTileIndex * convexPerTile
          const topViaStartIdx = topTileIndex * viasPerTile

          const topTileConvexRegions = convexRegions.slice(
            topConvexStartIdx,
            topConvexStartIdx + convexPerTile,
          )
          const topTileViaRegions = viaRegions.slice(
            topViaStartIdx,
            topViaStartIdx + viasPerTile,
          )
          const topTileAllRegions = [
            ...topTileConvexRegions,
            ...topTileViaRegions,
          ]

          // Boundary y-coordinate (top edge of current tile)
          const boundaryY = tileCenterY + halfHeight

          for (const xOffset of horizontalPortXOffsets) {
            const portX = tileCenterX + xOffset
            // Point slightly inside current tile (below boundary)
            const pointInCurrentTile = { x: portX, y: boundaryY - 0.01 }
            // Point slightly inside top tile (above boundary)
            const pointInTopTile = { x: portX, y: boundaryY + 0.01 }

            const region1 = findRegionContainingPoint(
              pointInCurrentTile,
              tileAllRegions,
            )
            const region2 = findRegionContainingPoint(
              pointInTopTile,
              topTileAllRegions,
            )

            if (region1 && region2) {
              createPort(
                `tile:${row}_${col}-${row + 1}_${col}:${portIdCounter++}`,
                region1,
                region2,
                { x: portX, y: boundaryY },
              )
            }
          }
        }
      }
    }
  }

  // Step 6: Create ports between tile edge regions and filler regions
  // Check both convex regions and via regions (via regions may touch tile edge when extended)
  // Ports are placed at the CENTER of each filler strip to prevent diagonal routes
  // Track port positions per filler region to ensure minimum spacing of portPitch
  const fillerPortPositions = new Map<string, Array<{ x: number; y: number }>>()
  for (const fillerRegion of fillerRegions) {
    fillerPortPositions.set(fillerRegion.regionId, [])
    const fillerBounds = fillerRegion.d.bounds
    const stripWidth = fillerBounds.maxX - fillerBounds.minX
    const stripHeight = fillerBounds.maxY - fillerBounds.minY
    const isHorizontalStrip = stripWidth > stripHeight

    // Calculate the number of ports and their positions along the filler strip
    // For horizontal strips (top/bottom): ports at evenly-spaced X positions
    // For vertical strips (left/right): ports at evenly-spaced Y positions
    const stripSize = isHorizontalStrip ? stripWidth : stripHeight
    const numPorts = Math.max(1, Math.floor(stripSize / portPitch))
    const actualPitch = stripSize / numPorts

    // Find which tile regions (convex or via) are adjacent to this filler region
    const tileRegions = [...convexRegions, ...viaRegions]
    for (const tileRegion of tileRegions) {
      const sharedEdges = findSharedEdges(
        tileRegion.d.polygon!,
        fillerRegion.d.polygon!,
        clearance * 2,
      )

      for (const edge of sharedEdges) {
        // Determine which filler boundary this edge is on and snap to it
        // This ensures ports from different tile regions at the same boundary
        // are at exactly the same position
        const edgeMidY = (edge.from.y + edge.to.y) / 2
        const edgeMidX = (edge.from.x + edge.to.x) / 2

        let edgeY: number
        let edgeX: number

        if (isHorizontalStrip) {
          // Snap Y to the nearest filler boundary (top or bottom)
          const distToMinY = Math.abs(edgeMidY - fillerBounds.minY)
          const distToMaxY = Math.abs(edgeMidY - fillerBounds.maxY)
          edgeY =
            distToMinY < distToMaxY ? fillerBounds.minY : fillerBounds.maxY
          edgeX = edgeMidX
        } else {
          // Snap X to the nearest filler boundary (left or right)
          const distToMinX = Math.abs(edgeMidX - fillerBounds.minX)
          const distToMaxX = Math.abs(edgeMidX - fillerBounds.maxX)
          edgeX =
            distToMinX < distToMaxX ? fillerBounds.minX : fillerBounds.maxX
          edgeY = edgeMidY
        }

        // Get the tile region's bounds to filter port positions
        const tileBounds = tileRegion.d.bounds

        // Create ports at aligned positions within the filler strip
        // BUT only at positions that are within the tile region's bounds
        // Use a small epsilon for floating point comparison, not the clearance
        const eps = 0.001
        for (let i = 0; i < numPorts; i++) {
          let pos: { x: number; y: number }

          if (isHorizontalStrip) {
            // Port X is centered within each segment of the filler strip
            let x = fillerBounds.minX + (i + 0.5) * actualPitch

            // Clamp X to be within the overlap of filler and tile bounds
            const overlapMinX = Math.max(fillerBounds.minX, tileBounds.minX)
            const overlapMaxX = Math.min(fillerBounds.maxX, tileBounds.maxX)

            // Skip if no overlap
            if (overlapMaxX < overlapMinX + eps) {
              continue
            }

            // Clamp to overlap region
            x = Math.max(overlapMinX + eps, Math.min(overlapMaxX - eps, x))
            pos = { x, y: edgeY }
          } else {
            // Port Y is centered within each segment of the filler strip
            let y = fillerBounds.minY + (i + 0.5) * actualPitch

            // Clamp Y to be within the overlap of filler and tile bounds
            const overlapMinY = Math.max(fillerBounds.minY, tileBounds.minY)
            const overlapMaxY = Math.min(fillerBounds.maxY, tileBounds.maxY)

            // Skip if no overlap
            if (overlapMaxY < overlapMinY + eps) {
              continue
            }

            // Clamp to overlap region
            y = Math.max(overlapMinY + eps, Math.min(overlapMaxY - eps, y))
            pos = { x: edgeX, y }
          }

          // Check if this position is too close to an existing port in this filler region
          const existingPositions = fillerPortPositions.get(
            fillerRegion.regionId,
          )!
          const tooClose = existingPositions.some((existing) => {
            const dist = Math.sqrt(
              (pos.x - existing.x) ** 2 + (pos.y - existing.y) ** 2,
            )
            return dist < portPitch
          })

          if (tooClose) {
            continue
          }

          // Track this position
          existingPositions.push(pos)

          createPort(
            `filler:${tileRegion.regionId}-${fillerRegion.regionId}:${portIdCounter++}`,
            tileRegion,
            fillerRegion,
            pos,
          )
        }
      }
    }
  }

  // Step 7: Create ports between adjacent filler regions
  // Only create ports if the shared edge is at least portPitch (trace width) long
  // This prevents creating ports at corners where regions are too thin
  for (let i = 0; i < fillerRegions.length; i++) {
    for (let j = i + 1; j < fillerRegions.length; j++) {
      const region1 = fillerRegions[i]
      const region2 = fillerRegions[j]

      const sharedEdges = findSharedEdges(
        region1.d.polygon!,
        region2.d.polygon!,
        0.01,
      )

      for (const edge of sharedEdges) {
        // Calculate edge length
        const edgeLength = Math.sqrt(
          (edge.to.x - edge.from.x) ** 2 + (edge.to.y - edge.from.y) ** 2,
        )

        // Skip if edge is shorter than trace width (portPitch)
        if (edgeLength < portPitch) {
          continue
        }

        const portPositions = createPortsAlongEdge(edge, portPitch)

        for (const pos of portPositions) {
          createPort(
            `filler:${region1.regionId}-${region2.regionId}:${portIdCounter++}`,
            region1,
            region2,
            pos,
          )
        }
      }
    }
  }

  // Step 8: Create ports between via regions and convex regions within each tile
  // (Via ↔ Filler ports are already created in Step 6)
  for (const viaRegion of viaRegions) {
    for (const convexRegion of convexRegions) {
      const sharedEdges = findSharedEdges(
        viaRegion.d.polygon!,
        convexRegion.d.polygon!,
        clearance * 2,
      )

      for (const edge of sharedEdges) {
        const portPositions = createPortsAlongEdge(edge, portPitch)

        for (const pos of portPositions) {
          createPort(
            `via-convex:${viaRegion.regionId}-${convexRegion.regionId}:${portIdCounter++}`,
            viaRegion,
            convexRegion,
            pos,
          )
        }
      }
    }
  }

  return {
    regions: allRegions,
    ports: allPorts,
    viaTile,
    tileCount: { rows, cols },
  }
}
