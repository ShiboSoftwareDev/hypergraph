import { test } from "bun:test"
import viaTile3Net from "assets/ViaGraphSolver/via-tile-3-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-100-samples.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile-3-regions.json", () => {
  // tileWidth and tileHeight are now read from the JSON file
  solveFirstHundredSamples(viaTile3Net, "via-tile-3-regions.json", {})
}, 300000)
