import type { BaseStats, DerivedEntry } from './types'

const statVector = (stats: BaseStats) => [
  stats.hp,
  stats.attack,
  stats.defense,
  stats.specialAttack,
  stats.specialDefense,
  stats.speed,
]

export const getArchetypes = (stats: BaseStats) => {
  const tags = new Set<string>()
  const bulk = stats.hp + stats.defense + stats.specialDefense
  const offense = stats.attack + stats.specialAttack

  if (stats.speed >= 100 && offense >= 190) tags.add('fast attacker')
  if (bulk >= 250 && stats.speed < 80) tags.add('bulky wall')
  if (offense >= 210 && bulk < 220) tags.add('glass cannon')
  if (bulk >= 260 && stats.speed <= 60) tags.add('slow tank')
  if (stats.specialAttack >= stats.attack + 20) tags.add('special attacker')
  if (stats.attack >= stats.specialAttack + 20) tags.add('physical attacker')
  if (Math.abs(stats.attack - stats.specialAttack) <= 15 && offense >= 170) tags.add('mixed attacker')
  if (statVector(stats).every((value) => value >= 65) && stats.total >= 470) tags.add('balanced')
  if (tags.size === 0) tags.add('specialist')

  return Array.from(tags)
}

export const statSimilarity = (a: BaseStats, b: BaseStats) => {
  const av = statVector(a).map((value) => value / Math.max(1, a.total))
  const bv = statVector(b).map((value) => value / Math.max(1, b.total))
  const distance = Math.sqrt(
    av.reduce((sum, value, index) => sum + Math.pow(value - bv[index], 2), 0),
  )
  return Number((1 / (1 + distance * 8)).toFixed(3))
}

export const rankSimilar = (entries: DerivedEntry[], source: DerivedEntry) =>
  entries
    .filter((entry) => entry.name !== source.name)
    .map((entry) => ({ entry, score: statSimilarity(source.baseStats, entry.baseStats) }))
    .sort((a, b) => b.score - a.score)
