import { paletteDistance } from './color'
import type { DerivedEntry } from './types'

export const shinyDelta = (entry: Pick<DerivedEntry, 'palettes'>) =>
  paletteDistance(entry.palettes.normal.swatches, entry.palettes.shiny.swatches)

export const rankShinyDelta = (entries: DerivedEntry[], direction: 'most' | 'least') =>
  [...entries].sort((a, b) =>
    direction === 'most' ? b.shinyDelta - a.shinyDelta : a.shinyDelta - b.shinyDelta,
  )
