import { describe, expect, it } from 'vitest'

import { getArchetypes, statSimilarity } from './stats'

describe('stat helpers', () => {
  it('labels fast attackers', () => {
    expect(
      getArchetypes({
        hp: 70,
        attack: 120,
        defense: 65,
        specialAttack: 90,
        specialDefense: 70,
        speed: 120,
        total: 535,
      }),
    ).toContain('fast attacker')
  })

  it('scores identical stat shapes higher than different shapes', () => {
    const a = { hp: 80, attack: 100, defense: 70, specialAttack: 60, specialDefense: 70, speed: 120, total: 500 }
    const b = { ...a }
    const c = { hp: 150, attack: 30, defense: 140, specialAttack: 30, specialDefense: 140, speed: 10, total: 500 }
    expect(statSimilarity(a, b)).toBeGreaterThan(statSimilarity(a, c))
  })
})
