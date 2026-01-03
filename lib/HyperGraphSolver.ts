import { BaseSolver } from "@tscircuit/solver-utils"
import { convertSerializedHyperGraphToHyperGraph } from "./convertSerializedHyperGraphToHyperGraph"
import type {
  Candidate,
  Connection,
  GraphPoint,
  HyperGraph,
  SerializedConnection,
  SerializedHyperGraph,
} from "./types"
import { convertSerializedConnectionsToConnections } from "./convertSerializedConnectionsToConnections"
import { PriorityQueue } from "./PriorityQueue"

export class HyperGraphSolver extends BaseSolver {
  graph: HyperGraph
  connections: Connection[]

  candidateQueue: PriorityQueue<Candidate>
  unprocessedConnections: Connection[]

  currentConnection: Connection | null = null
  currentEndPoint: GraphPoint | null = null

  greedyMultiplier = 1.0

  constructor(
    public input: {
      inputGraph: HyperGraph | SerializedHyperGraph
      inputConnections: (Connection | SerializedConnection)[]
      greedyMultiplier?: number
    },
  ) {
    super()
    this.graph = convertSerializedHyperGraphToHyperGraph(input.inputGraph)
    this.connections = convertSerializedConnectionsToConnections(
      input.inputConnections,
      this.graph,
    )
    if (input.greedyMultiplier) this.greedyMultiplier = input.greedyMultiplier
    this.unprocessedConnections = [...this.connections]
    this.candidateQueue = new PriorityQueue<Candidate>()
    this.candidateQueue.enqueue({
      point: this.connections[0].startPoint,
      g: 0,
      h: 0,
      f: 0,
      hops: 0,
    })
    this.currentEndPoint = this.connections[0].endPoint
  }

  computeH(candidate: Candidate): number {
    return 0
  }

  computeG(candidate: Candidate): number {
    return 0
  }
}
