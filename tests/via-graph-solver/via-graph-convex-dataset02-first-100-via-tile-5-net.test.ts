import { test } from "bun:test"
import viaTile2 from "assets/ViaGraphSolver/via-tile-5-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-first-10.helper"

test.skip("via-graph-convex-dataset02: solve first 100 samples with via-tile-2.json", () => {
  solveFirstHundredSamples(viaTile2, "via-tile-2.json", {
    tileHeight: 5.171,
    tileWidth: 5.428,
  })
}, 300000)
