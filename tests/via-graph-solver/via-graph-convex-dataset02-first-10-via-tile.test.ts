import { test } from "bun:test"
import viaTile from "assets/ViaGraphSolver/via-tile.json"
import { solveFirstHundredSamples } from "./via-graph-convex-dataset02-first-10.helper"

test("via-graph-convex-dataset02: solve first 100 samples with via-tile.json", () => {
  solveFirstHundredSamples(viaTile, "via-tile.json")
}, 300000)
