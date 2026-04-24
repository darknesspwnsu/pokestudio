import { closestSwatchDistance, hexToRgb, normalizeHex } from './color'
import type { DerivedEntry, PaletteMode } from './types'

export const normalizeHexInputs = (values: string[]) =>
  values.map((value) => normalizeHex(value)).filter((value): value is string => Boolean(value))

export const rankPaletteMatches = (
  entries: DerivedEntry[],
  hexValues: string[],
  mode: PaletteMode,
) => {
  const targets = normalizeHexInputs(hexValues).map((hex) => hexToRgb(hex)!)
  if (targets.length === 0) {
    return []
  }

  return entries
    .map((entry) => {
      const swatches = entry.palettes[mode].swatches
      const distance =
        targets.reduce((sum, target) => sum + closestSwatchDistance(swatches, target), 0) /
        targets.length
      const score = Math.max(0, Math.round(100 - (distance / 441) * 100))
      return { entry, score, distance: Math.round(distance) }
    })
    .sort((a, b) => b.score - a.score || a.distance - b.distance)
}
