import { paletteDistance } from './color'
import { getArchetypes } from './stats'
import type { DerivedEntry, PokemonIndex } from './types'

export const deriveEntries = (index: PokemonIndex): DerivedEntry[] =>
  index.entries.map((entry) => ({
    ...entry,
    searchText: [
      entry.name,
      entry.displayName,
      entry.speciesName,
      entry.speciesId,
      entry.id,
      entry.types.join(' '),
      `gen ${entry.generation}`,
      entry.color,
      entry.formTags.join(' '),
    ]
      .join(' ')
      .toLowerCase(),
    shinyDelta: paletteDistance(
      entry.palettes.normal.swatches,
      entry.palettes.shiny.swatches,
    ),
    archetypes: getArchetypes(entry.baseStats),
  }))

export const searchEntries = <T extends { searchText: string }>(entries: T[], query: string) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return entries
  }
  return entries.filter((entry) => entry.searchText.includes(normalized))
}

export const loadPokemonIndex = async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}data/pokemon-studio-index.json`)
  if (!response.ok) {
    throw new Error(`Failed to load Pokémon index: ${response.status}`)
  }
  return response.json() as Promise<PokemonIndex>
}
