import { rgbToHex } from './color'
import type { PaletteSwatch, RGB } from './types'

type Bucket = {
  key: string
  rgb: RGB
  population: number
}

export const extractDominantSwatches = (
  pixels: RGB[],
  count = 3,
  bucketSize = 16,
): PaletteSwatch[] => {
  const buckets = new Map<string, Bucket>()

  for (const pixel of pixels) {
    const bucketRgb = pixel.map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel / bucketSize) * bucketSize)),
    ) as RGB
    const key = bucketRgb.join(',')
    const existing = buckets.get(key)
    if (existing) {
      existing.population += 1
    } else {
      buckets.set(key, { key, rgb: bucketRgb, population: 1 })
    }
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.population - a.population)
    .slice(0, count)
    .map((bucket) => ({
      rgb: bucket.rgb,
      hex: rgbToHex(bucket.rgb),
      population: bucket.population,
    }))
}
