import { HyperGraphSolver } from "../HyperGraphSolver"
import type {
  Connection,
  HyperGraph,
  Region,
  RegionPort,
  SerializedConnection,
  SerializedHyperGraph,
  SolvedRoute,
} from "../types"
import type { JPort, JRegion } from "./jumper-types"

export class JumperGraphSolver extends HyperGraphSolver<JRegion, JPort> {
  UNIT_OF_COST = "distance"

  constructor(input: {
    inputGraph: HyperGraph | SerializedHyperGraph
    inputConnections: (Connection | SerializedConnection)[]
  }) {
    super({ ...input, greedyMultiplier: 1.2, rippingEnabled: true, ripCost: 1 })
  }

  override estimateCostToEnd(port: RegionPort): number {
    return 0
  }
  override getPortUsagePenalty(port: RegionPort): number {
    return 0
  }
  override computeIncreasedRegionCostIfPortsAreUsed(
    region: JRegion,
    port1: JPort,
    port2: JPort,
  ): number {
    return 0
  }

  override routeSolvedHook(solvedRoute: SolvedRoute) {}
}
