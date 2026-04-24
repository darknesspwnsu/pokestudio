import { describe, expect, it } from 'vitest'

import { normalizeHex, paletteDistance } from './color'
import type { PaletteSwatch } from './types'

describe('color helpers', () => {
  it('normalizes short and long HEX values', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('38bdf8')).toBe('#38BDF8')
    expect(normalizeHex('not-a-color')).toBeNull()
  })

  it('scores palette distance across aligned swatches', () => {
    const a: PaletteSwatch[] = [{ hex: '#000000', rgb: [0, 0, 0], population: 1 }]
    const b: PaletteSwatch[] = [{ hex: '#FFFFFF', rgb: [255, 255, 255], population: 1 }]
    expect(paletteDistance(a, b)).toBe(442)
  })
})
