import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

const bulbasaur = {
  id: 1,
  name: 'bulbasaur',
  displayName: 'Bulbasaur',
  speciesId: 1,
  speciesName: 'bulbasaur',
  types: ['grass', 'poison'],
  generation: 1,
  color: 'green',
  formTags: ['default'],
  isDefault: true,
  order: 1,
  images: { normal: 'normal.png', shiny: 'shiny.png' },
  palettes: {
    normal: { swatches: [{ hex: '#78A794', rgb: [120, 167, 148], population: 1 }], sourceUrl: '' },
    shiny: { swatches: [{ hex: '#7AB55B', rgb: [122, 181, 91], population: 1 }], sourceUrl: '' },
  },
  baseStats: { hp: 45, attack: 49, defense: 49, specialAttack: 65, specialDefense: 65, speed: 45, total: 318 },
}

describe('App', () => {
  it('renders the studio navigation and loaded Pokémon data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ generatedAt: new Date().toISOString(), count: 1, entries: [bulbasaur] }),
      })),
    )

    render(<App />)

    expect(await screen.findByText('PokéStudio')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText('Team Studio').length).toBeGreaterThan(0))
    expect(screen.getAllByText('Bulbasaur').length).toBeGreaterThan(0)
  })
})
