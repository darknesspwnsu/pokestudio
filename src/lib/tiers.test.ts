import { describe, expect, it } from 'vitest'

import { filterRandomPool, getTierLabel } from './tiers'
import type { DerivedEntry } from './types'

const entry = (name: string): DerivedEntry =>
  ({
    id: 1,
    name,
    displayName: name,
    speciesId: 1,
    speciesName: name,
    types: ['normal'],
    generation: 1,
    color: 'white',
    formTags: ['default'],
    isDefault: true,
    order: 1,
    images: { normal: '', shiny: '' },
    palettes: {
      normal: { swatches: [], sourceUrl: '' },
      shiny: { swatches: [], sourceUrl: '' },
    },
    baseStats: {
      hp: 1,
      attack: 1,
      defense: 1,
      specialAttack: 1,
      specialDefense: 1,
      speed: 1,
      total: 6,
    },
    searchText: name,
    shinyDelta: 0,
    archetypes: [],
  }) satisfies DerivedEntry

describe('tier helpers', () => {
  it('maps Pokémon entries to Showdown tier labels', () => {
    expect(getTierLabel(entry('great-tusk'))).toBe('OU')
  })

  it('filters random pools to default entries in the requested tier', () => {
    const rows = [entry('great-tusk'), entry('pikachu')]
    expect(filterRandomPool(rows, 'ou').map((row) => row.name)).toContain('great-tusk')
    expect(filterRandomPool(rows, 'ou').map((row) => row.name)).not.toContain('pikachu')
  })
})
