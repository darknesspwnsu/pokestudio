import { averageSwatches } from './color'
import { defensiveProfile, offensiveCoverage, POKEMON_TYPES } from './type-chart'
import type { DerivedEntry, PaletteMode, TeamSlot } from './types'

export const MAX_TEAM_SIZE = 6

export const resolveTeam = (slots: TeamSlot[], entries: DerivedEntry[]) => {
  const map = new Map(entries.map((entry) => [entry.name, entry]))
  return slots
    .map((slot) => {
      const entry = map.get(slot.name)
      return entry ? { entry, mode: slot.mode } : null
    })
    .filter((value): value is { entry: DerivedEntry; mode: PaletteMode } => Boolean(value))
}

export const teamPalette = (team: ReturnType<typeof resolveTeam>) =>
  team
    .flatMap(({ entry, mode }) => entry.palettes[mode].swatches)
    .slice(0, 18)

export const teamAccent = (team: ReturnType<typeof resolveTeam>) => averageSwatches(teamPalette(team))

export const averageStats = (team: ReturnType<typeof resolveTeam>) => {
  if (team.length === 0) {
    return { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, total: 0 }
  }
  const totals = team.reduce(
    (acc, { entry }) => ({
      hp: acc.hp + entry.baseStats.hp,
      attack: acc.attack + entry.baseStats.attack,
      defense: acc.defense + entry.baseStats.defense,
      specialAttack: acc.specialAttack + entry.baseStats.specialAttack,
      specialDefense: acc.specialDefense + entry.baseStats.specialDefense,
      speed: acc.speed + entry.baseStats.speed,
      total: acc.total + entry.baseStats.total,
    }),
    { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, total: 0 },
  )
  return Object.fromEntries(
    Object.entries(totals).map(([key, value]) => [key, Math.round(value / team.length)]),
  ) as typeof totals
}

export const teamDefense = (team: ReturnType<typeof resolveTeam>) =>
  POKEMON_TYPES.map((type) => {
    const multipliers = team.map(({ entry }) =>
      defensiveProfile(entry.types).find((row) => row.type === type)?.multiplier ?? 1,
    )
    return {
      type,
      weak: multipliers.filter((value) => value > 1).length,
      resist: multipliers.filter((value) => value < 1 && value > 0).length,
      immune: multipliers.filter((value) => value === 0).length,
      average:
        multipliers.length === 0
          ? 1
          : multipliers.reduce((sum, value) => sum + value, 0) / multipliers.length,
    }
  })

export const teamOffense = (team: ReturnType<typeof resolveTeam>) =>
  offensiveCoverage(Array.from(new Set(team.flatMap(({ entry }) => entry.types))))

export const suggestTeamPatches = (team: ReturnType<typeof resolveTeam>, entries: DerivedEntry[]) => {
  const existing = new Set(team.map(({ entry }) => entry.name))
  const weakTypes = teamDefense(team)
    .filter((row) => row.weak > row.resist + row.immune)
    .map((row) => row.type)

  return entries
    .filter((entry) => entry.isDefault && !existing.has(entry.name))
    .map((entry) => {
      const profile = defensiveProfile(entry.types)
      const score = weakTypes.reduce((sum, type) => {
        const multiplier = profile.find((row) => row.type === type)?.multiplier ?? 1
        return sum + (multiplier === 0 ? 3 : multiplier < 1 ? 2 : multiplier === 1 ? 0.5 : -1)
      }, 0)
      return { entry, score }
    })
    .sort((a, b) => b.score - a.score || b.entry.baseStats.total - a.entry.baseStats.total)
    .slice(0, 8)
}

export const encodeTeam = (slots: TeamSlot[]) =>
  slots.map((slot) => `${slot.name}${slot.mode === 'shiny' ? ':s' : ''}`).join(',')

export const decodeTeam = (value: string | null): TeamSlot[] =>
  (value ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, MAX_TEAM_SIZE)
    .map((token) => {
      const [name, mode] = token.split(':')
      return { name, mode: mode === 's' ? 'shiny' : 'normal' }
    })
