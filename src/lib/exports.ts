import { teamDefense } from './team'
import type { DerivedEntry, TeamSlot } from './types'

export const toTeamJson = (
  team: { entry: DerivedEntry; mode: 'normal' | 'shiny' }[],
) =>
  JSON.stringify(
    team.map(({ entry, mode }) => ({
      name: entry.displayName,
      id: entry.id,
      speciesId: entry.speciesId,
      mode,
      types: entry.types,
      stats: entry.baseStats,
      palette: entry.palettes[mode].swatches.map((swatch) => swatch.hex),
    })),
    null,
    2,
  )

export const toTeamSummary = (
  team: { entry: DerivedEntry; mode: 'normal' | 'shiny' }[],
) => {
  const names = team.map(({ entry, mode }) => `${entry.displayName}${mode === 'shiny' ? ' shiny' : ''}`)
  const weak = teamDefense(team)
    .filter((row) => row.weak > row.resist + row.immune)
    .map((row) => row.type)
    .slice(0, 5)
  return [`Team: ${names.join(', ') || 'None'}`, `Pressure points: ${weak.join(', ') || 'none'}`].join('\n')
}

export const toCssVariables = (entry: DerivedEntry, mode: 'normal' | 'shiny') =>
  [
    ':root {',
    `  --pokemon-name: "${entry.displayName}";`,
    `  --pokemon-mode: "${mode}";`,
    ...entry.palettes[mode].swatches.map(
      (swatch, index) => `  --pokemon-swatch-${index + 1}: ${swatch.hex};`,
    ),
    '}',
  ].join('\n')

export const toShareableTeam = (slots: TeamSlot[]) =>
  slots.map((slot, index) => `${index + 1}. ${slot.name} (${slot.mode})`).join('\n')
