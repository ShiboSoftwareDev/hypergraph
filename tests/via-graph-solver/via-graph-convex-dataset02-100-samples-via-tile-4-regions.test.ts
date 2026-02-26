import { test } from "bun:test"
import viaTile from "assets/ViaGraphSolver/via-tile-4-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-100-samples.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile.json", () => {
  solveFirstHundredSamples(viaTile, "via-tile.json")
}, 300000)
