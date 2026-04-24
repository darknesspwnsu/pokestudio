import { describe, expect, it } from 'vitest'

import { decodeTeam, encodeTeam, resolveTeam, teamDefense } from './team'
import type { DerivedEntry, TeamSlot } from './types'

const makeEntry = (name: string, types: string[]): DerivedEntry =>
  ({
    id: 1,
    name,
    displayName: name,
    speciesId: 1,
    speciesName: name,
    types,
    generation: 1,
    color: 'red',
    formTags: ['default'],
    isDefault: true,
    order: 1,
    images: { normal: '', shiny: '' },
    palettes: {
      normal: { swatches: [], sourceUrl: '' },
      shiny: { swatches: [], sourceUrl: '' },
    },
    baseStats: {
      hp: 50,
      attack: 50,
      defense: 50,
      specialAttack: 50,
      specialDefense: 50,
      speed: 50,
      total: 300,
    },
    searchText: name,
    shinyDelta: 0,
    archetypes: [],
  }) satisfies DerivedEntry

describe('team helpers', () => {
  it('round-trips team URL encoding', () => {
    const slots: TeamSlot[] = [
      { name: 'pikachu', mode: 'normal' },
      { name: 'gengar', mode: 'shiny' },
    ]
    expect(decodeTeam(encodeTeam(slots))).toEqual(slots)
  })

  it('computes team weakness counts', () => {
    const team = resolveTeam([{ name: 'charizard', mode: 'normal' }], [
      makeEntry('charizard', ['fire', 'flying']),
    ])
    const rock = teamDefense(team).find((row) => row.type === 'rock')
    expect(rock?.weak).toBe(1)
  })
})
