import viasByNet from "assets/ViaGraphSolver/vias-by-net.json"
import type { ViasByNet } from "./ViaGraphSolver"
import { generateViaTopologyGrid } from "./via-graph-generator/generateViaTopologyGrid"
import { generateViaTopologyRegions } from "./via-graph-generator/generateViaTopologyRegions"

export { viasByNet }

export function generateDefaultViaTopologyRegions(
  opts: Parameters<typeof generateViaTopologyRegions>[1],
) {
  return generateViaTopologyRegions(viasByNet as ViasByNet, opts)
}

export function generateDefaultViaTopologyGrid(
  opts: Omit<Parameters<typeof generateViaTopologyGrid>[0], "viasByNet">,
) {
  return generateViaTopologyGrid({
    ...opts,
    viasByNet: viasByNet as ViasByNet,
  })
}
