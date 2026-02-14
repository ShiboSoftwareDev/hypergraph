import type { JPort, JRegion } from "../JumperGraphSolver/jumper-types"
import { chordsCross } from "../JumperGraphSolver/perimeterChordUtils"
import type { RegionPortAssignment } from "../types"

/**
 * Maps a point to a 1D coordinate along a polygon's perimeter.
 *
 * Finds the closest edge of the polygon to the point, projects the point
 * onto that edge, then returns the cumulative distance along the polygon
 * perimeter up to that projection.
 *
 * This is the polygon-aware equivalent of `perimeterT` which only works
 * with axis-aligned bounding boxes.
 */
export function polygonPerimeterT(
  p: { x: number; y: number },
  polygon: { x: number; y: number }[],
): number {
  const n = polygon.length
  let bestDist = Infinity
  let bestEdgeIndex = 0
  let bestT = 0

  // Find the closest edge and the projection parameter t on that edge
  for (let i = 0; i < n; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const lenSq = dx * dx + dy * dy
    if (lenSq < 1e-10) continue

    const t = Math.max(
      0,
      Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq),
    )
    const projX = a.x + t * dx
    const projY = a.y + t * dy
    const dist = Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2)

    if (dist < bestDist) {
      bestDist = dist
      bestEdgeIndex = i
      bestT = t
    }
  }

  // Compute cumulative perimeter distance up to the projection point
  let cumulative = 0
  for (let i = 0; i < bestEdgeIndex; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % n]
    cumulative += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
  }

  // Add the partial distance along the best edge
  const a = polygon[bestEdgeIndex]
  const b = polygon[(bestEdgeIndex + 1) % n]
  const edgeLen = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2)
  cumulative += bestT * edgeLen

  return cumulative
}

/**
 * Compute the number of crossings between a new port pair and existing
 * assignments in a polygon region.
 *
 * Uses polygon perimeter mapping instead of bounding-box mapping.
 */
export function computeDifferentNetCrossingsForPolygon(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): number {
  const polygon = region.d.polygon
  if (!polygon || polygon.length < 3) {
    // Fallback: no polygon, use 0 crossings (shouldn't happen for via regions)
    return 0
  }

  const t1 = polygonPerimeterT(port1.d, polygon)
  const t2 = polygonPerimeterT(port2.d, polygon)
  const newChord: [number, number] = [t1, t2]

  let crossings = 0
  const assignments = region.assignments ?? []

  for (const assignment of assignments) {
    const existingT1 = polygonPerimeterT(
      (assignment.regionPort1 as JPort).d,
      polygon,
    )
    const existingT2 = polygonPerimeterT(
      (assignment.regionPort2 as JPort).d,
      polygon,
    )
    const existingChord: [number, number] = [existingT1, existingT2]

    if (chordsCross(newChord, existingChord)) {
      crossings++
    }
  }

  return crossings
}

/**
 * Compute the assignments that would cross with a new port pair in a
 * polygon region.
 *
 * Uses polygon perimeter mapping instead of bounding-box mapping.
 */
export function computeCrossingAssignmentsForPolygon(
  region: JRegion,
  port1: JPort,
  port2: JPort,
): RegionPortAssignment[] {
  const polygon = region.d.polygon
  if (!polygon || polygon.length < 3) {
    return []
  }

  const t1 = polygonPerimeterT(port1.d, polygon)
  const t2 = polygonPerimeterT(port2.d, polygon)
  const newChord: [number, number] = [t1, t2]

  const crossingAssignments: RegionPortAssignment[] = []
  const assignments = region.assignments ?? []

  for (const assignment of assignments) {
    const existingT1 = polygonPerimeterT(
      (assignment.regionPort1 as JPort).d,
      polygon,
    )
    const existingT2 = polygonPerimeterT(
      (assignment.regionPort2 as JPort).d,
      polygon,
    )
    const existingChord: [number, number] = [existingT1, existingT2]

    if (chordsCross(newChord, existingChord)) {
      crossingAssignments.push(assignment)
    }
  }

  return crossingAssignments
}
