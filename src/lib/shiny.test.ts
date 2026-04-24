import { describe, expect, it } from 'vitest'

import { rankShinyDelta } from './shiny'
import type { DerivedEntry } from './types'

const row = (name: string, shinyDelta: number) => ({ name, shinyDelta }) as DerivedEntry

describe('shiny rankings', () => {
  it('sorts most and least changed shiny forms', () => {
    const rows = [row('quiet', 4), row('loud', 90)]
    expect(rankShinyDelta(rows, 'most')[0].name).toBe('loud')
    expect(rankShinyDelta(rows, 'least')[0].name).toBe('quiet')
  })
})
