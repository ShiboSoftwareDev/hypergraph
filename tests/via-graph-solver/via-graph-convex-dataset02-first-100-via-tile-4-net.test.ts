import { test } from "bun:test"
import viaTile from "assets/ViaGraphSolver/4-net-via-tile.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-first-10.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile.json", () => {
  solveFirstHundredSamples(viaTile, "via-tile.json")
}, 300000)
