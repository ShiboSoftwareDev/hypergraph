import { test } from "bun:test"
import viaTile5Regions from "assets/ViaGraphSolver/via-tile-5-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-100-samples.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile-5-regions.json", () => {
  // tileWidth and tileHeight are now read from the JSON file
  solveFirstHundredSamples(viaTile5Regions, "via-tile-5-regions.json", {})
}, 300000)
