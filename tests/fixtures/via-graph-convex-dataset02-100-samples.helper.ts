import { expect } from "bun:test"
import type { XYConnection } from "lib/JumperGraphSolver/jumper-graph-generator/createGraphWithConnectionsFromBaseGraph"
import { ViaGraphSolver } from "lib/ViaGraphSolver/ViaGraphSolver"
import { createConvexViaGraphFromXYConnections } from "lib/ViaGraphSolver/via-graph-generator/createConvexViaGraphFromXYConnections"
import dataset02 from "../../datasets/jumper-graph-solver/dataset02.json"

interface DatasetSample {
  config: {
    numCrossings: number
    seed: number
    rows: number
    cols: number
    orientation: "vertical" | "horizontal"
  }
  connections: {
    connectionId: string
    startRegionId: string
    endRegionId: string
  }[]
  connectionRegions: {
    regionId: string
    pointIds: string[]
    d: {
      bounds: { minX: number; maxX: number; minY: number; maxY: number }
      center: { x: number; y: number }
      isPad: boolean
      isConnectionRegion: boolean
    }
  }[]
}

const typedDataset = dataset02 as DatasetSample[]

const extractXYConnections = (sample: DatasetSample): XYConnection[] => {
  const regionMap = new Map(
    sample.connectionRegions.map((region) => [
      region.regionId,
      region.d.center,
    ]),
  )

  return sample.connections.map((conn) => {
    const start = regionMap.get(conn.startRegionId)
    const end = regionMap.get(conn.endRegionId)

    if (!start || !end) {
      throw new Error(
        `Missing region for connection ${conn.connectionId}: start=${conn.startRegionId}, end=${conn.endRegionId}`,
      )
    }

    return {
      connectionId: conn.connectionId,
      start,
      end,
    }
  })
}

export const solveFirstHundredSamples = (
  tile: Parameters<typeof createConvexViaGraphFromXYConnections>[1],
  label: string,
  opts?: Parameters<typeof createConvexViaGraphFromXYConnections>[2],
): void => {
  const firstHundredSamples = typedDataset.slice(0, 100)
  expect(firstHundredSamples.length).toBe(100)
  let processedSampleCount = 0
  let solvedCount = 0
  let failedCount = 0
  let totalScore = 0

  for (const [index, sample] of firstHundredSamples.entries()) {
    const xyConnections = extractXYConnections(sample)
    const graph = createConvexViaGraphFromXYConnections(
      xyConnections,
      tile,
      opts,
    )

    const solver = new ViaGraphSolver({
      inputGraph: {
        regions: graph.regions,
        ports: graph.ports,
      },
      inputConnections: graph.connections,
      viaTile: graph.viaTile,
    })

    expect(
      () => solver.solve(),
      `solver threw for sample ${index} with seed ${sample.config.seed}`,
    ).not.toThrow()

    if (solver.solved) {
      solvedCount += 1
      totalScore += 1
      console.log(
        `[${label}] sample-${String(index).padStart(3, "0")} (seed ${sample.config.seed}): SUCCESS`,
      )
    } else {
      failedCount += 1
      console.log(
        `[${label}] sample-${String(index).padStart(3, "0")} (seed ${sample.config.seed}): FAILED`,
      )
    }

    processedSampleCount += 1
  }

  expect(processedSampleCount).toBe(100)
  expect(solvedCount + failedCount).toBe(100)

  const avgScore = totalScore / processedSampleCount
  const successRate = avgScore * 100

  console.log(
    `[${label}] Summary: avg score=${avgScore.toFixed(2)}, success rate=${successRate.toFixed(1)}% (${solvedCount}/${processedSampleCount})`,
  )
}
