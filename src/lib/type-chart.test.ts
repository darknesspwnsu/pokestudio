import { describe, expect, it } from 'vitest'

import { attackMultiplier, defensiveProfile, offensiveCoverage } from './type-chart'

describe('type chart', () => {
  it('handles immunities and double weaknesses', () => {
    expect(attackMultiplier('electric', ['ground'])).toBe(0)
    expect(attackMultiplier('rock', ['fire', 'flying'])).toBe(4)
  })

  it('builds defensive and offensive matrix rows', () => {
    expect(defensiveProfile(['water']).find((row) => row.type === 'grass')?.multiplier).toBe(2)
    expect(offensiveCoverage(['fire']).find((row) => row.type === 'grass')?.best).toBe(2)
  })
})
