import { test } from "bun:test"
import viaTile3Net from "assets/ViaGraphSolver/via-tile-3-regions.json"
import { solveFirstHundredSamples } from "../fixtures/via-graph-convex-dataset02-100-samples.helper"

test("via-graph-convex-dataset02: solve first 100 samples with via-tile-2.json", () => {
  solveFirstHundredSamples(viaTile3Net, "via-tile.json", {
    tileHeight: 2.399,
    tileWidth: 2.408,
  })
}, 300000)
