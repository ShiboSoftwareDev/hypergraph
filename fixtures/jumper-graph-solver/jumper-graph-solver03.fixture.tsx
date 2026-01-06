import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { generateJumperX4Grid } from "lib/JumperGraphSolver/jumper-graph-generator/generateJumperX4Grid"
import { createProblemFromBaseGraph } from "lib/JumperGraphSolver/jumper-graph-generator/createProblemFromBaseGraph"
import { JumperGraphSolver } from "lib/JumperGraphSolver/JumperGraphSolver"

const baseGraph = generateJumperX4Grid({
  cols: 1,
  rows: 1,
  marginX: 0.5,
  marginY: 0.5,
  outerPaddingX: 0.8,
  outerPaddingY: 0.8,
  regionsBetweenPads: true,
})

const graphWithConnections = createProblemFromBaseGraph({
  baseGraph,
  numConnections: 5,
  randomSeed: 42,
})

export default () => (
  <GenericSolverDebugger
    createSolver={() =>
      new JumperGraphSolver({
        inputGraph: {
          regions: graphWithConnections.regions,
          ports: graphWithConnections.ports,
        },
        inputConnections: graphWithConnections.connections,
      })
    }
  />
)
