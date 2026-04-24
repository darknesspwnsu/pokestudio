import { describe, expect, it } from 'vitest'

import { rankPaletteMatches } from './match'
import type { DerivedEntry } from './types'

const entry = (name: string, hex: string, rgb: [number, number, number]) =>
  ({
    name,
    displayName: name,
    searchText: name,
    images: { normal: '', shiny: '' },
    palettes: {
      normal: { swatches: [{ hex, rgb, population: 1 }], sourceUrl: '' },
      shiny: { swatches: [{ hex, rgb, population: 1 }], sourceUrl: '' },
    },
    baseStats: { hp: 1, attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1, total: 6 },
    id: 1,
    speciesId: 1,
    speciesName: name,
    types: ['normal'],
    generation: 1,
    color: 'white',
    formTags: ['default'],
    isDefault: true,
    order: 1,
    shinyDelta: 0,
    archetypes: [],
  }) as DerivedEntry

describe('palette matching', () => {
  it('ranks exact color matches first', () => {
    const rows = rankPaletteMatches(
      [entry('blue', '#0000FF', [0, 0, 255]), entry('red', '#FF0000', [255, 0, 0])],
      ['#ff0000'],
      'normal',
    )
    expect(rows[0].entry.name).toBe('red')
    expect(rows[0].score).toBe(100)
  })
})
