import type { JumperGraph } from "../jumper-types"
import { calculateGraphBounds } from "./calculateGraphBounds"
import {
  createGraphWithConnectionsFromBaseGraph,
  type JumperGraphWithConnections,
  type XYConnection,
} from "./createGraphWithConnectionsFromBaseGraph"

/**
 * Simple seeded random number generator (Linear Congruential Generator)
 */
const createSeededRandom = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

/**
 * Generates a random point on the perimeter of the given bounds
 */
const getRandomPerimeterPoint = (
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  random: () => number,
): { x: number; y: number } => {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY
  const perimeter = 2 * width + 2 * height

  // Pick a random position along the perimeter
  const pos = random() * perimeter

  if (pos < width) {
    // Top edge
    return { x: bounds.minX + pos, y: bounds.maxY }
  }
  if (pos < width + height) {
    // Right edge
    return { x: bounds.maxX, y: bounds.maxY - (pos - width) }
  }
  if (pos < 2 * width + height) {
    // Bottom edge
    return { x: bounds.maxX - (pos - width - height), y: bounds.minY }
  }
  // Left edge
  return { x: bounds.minX, y: bounds.minY + (pos - 2 * width - height) }
}

/**
 * Generates a connection ID from an index (0 -> "A", 1 -> "B", etc.)
 */
const getConnectionId = (index: number): string => {
  return String.fromCharCode(65 + index) // 65 is ASCII for 'A'
}

export type CreateProblemFromBaseGraphParams = {
  baseGraph: JumperGraph
  numConnections: number
  randomSeed: number
}

/**
 * Creates a problem graph from a base graph by generating random connection
 * positions on the perimeter/bounds of the graph.
 */
export const createProblemFromBaseGraph = ({
  baseGraph,
  numConnections,
  randomSeed,
}: CreateProblemFromBaseGraphParams): JumperGraphWithConnections => {
  const random = createSeededRandom(randomSeed)
  const graphBounds = calculateGraphBounds(baseGraph.regions)

  const xyConnections: XYConnection[] = []

  for (let i = 0; i < numConnections; i++) {
    const start = getRandomPerimeterPoint(graphBounds, random)
    const end = getRandomPerimeterPoint(graphBounds, random)

    xyConnections.push({
      start,
      end,
      connectionId: getConnectionId(i),
    })
  }

  return createGraphWithConnectionsFromBaseGraph(baseGraph, xyConnections)
}
