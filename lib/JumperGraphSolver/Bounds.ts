import type { JRegion } from "./jumper-types"

export type Bounds = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export const getBoundsFromRegions = (regions: JRegion[]): Bounds => {
  return {
    minX: Math.min(...regions.map((region) => region.d.bounds.minX)),
    minY: Math.min(...regions.map((region) => region.d.bounds.minY)),
    maxX: Math.max(...regions.map((region) => region.d.bounds.maxX)),
    maxY: Math.max(...regions.map((region) => region.d.bounds.maxY)),
  }
}
