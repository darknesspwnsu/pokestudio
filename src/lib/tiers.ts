import { TIER_DATA, type TierInfo } from './tier-data'
import type { DerivedEntry } from './types'

export type RandomPool = 'any' | 'ou' | 'uu' | 'ru' | 'nu' | 'pu' | 'zu' | 'uber' | 'natdex-ou'

export const RANDOM_POOLS: { id: RandomPool; label: string; description: string }[] = [
  { id: 'ou', label: 'OU', description: 'Current standard OU tier' },
  { id: 'uu', label: 'UU', description: 'Current standard UU tier' },
  { id: 'ru', label: 'RU', description: 'Current standard RU tier' },
  { id: 'nu', label: 'NU', description: 'Current standard NU tier' },
  { id: 'pu', label: 'PU', description: 'Current standard PU tier' },
  { id: 'zu', label: 'ZU', description: 'Current standard ZU tier' },
  { id: 'uber', label: 'Uber', description: 'Current standard Uber tier' },
  { id: 'natdex-ou', label: 'NatDex OU', description: 'National Dex OU, including past forms' },
  { id: 'any', label: 'Any', description: 'Any default species with available data' },
]

const toShowdownId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

const candidateIds = (entry: DerivedEntry) => {
  const ids = new Set<string>()
  ids.add(toShowdownId(entry.name))
  ids.add(toShowdownId(entry.speciesName))

  if (entry.name.includes('-mega-')) {
    const [species, , suffix] = entry.name.split('-')
    ids.add(toShowdownId(`${species}mega${suffix ?? ''}`))
  }

  if (entry.name.endsWith('-mega')) {
    ids.add(toShowdownId(entry.name.replace('-mega', 'mega')))
  }

  if (entry.name.endsWith('-gmax')) {
    ids.add(toShowdownId(entry.name.replace('-gmax', 'gmax')))
  }

  return Array.from(ids)
}

export const getTierInfo = (entry: DerivedEntry): TierInfo | null => {
  for (const id of candidateIds(entry)) {
    const info = TIER_DATA[id]
    if (info) {
      return info
    }
  }
  return null
}

export const getTierLabel = (entry: DerivedEntry) => {
  const info = getTierInfo(entry)
  return info?.tier ?? info?.natDexTier ?? 'Unlisted'
}

export const matchesRandomPool = (entry: DerivedEntry, pool: RandomPool) => {
  if (!entry.isDefault) {
    return false
  }

  if (pool === 'any') {
    return true
  }

  const info = getTierInfo(entry)
  if (!info) {
    return false
  }

  if (pool === 'natdex-ou') {
    return info.natDexTier === 'OU'
  }

  const target = pool === 'uber' ? 'Uber' : pool.toUpperCase()
  return info.tier === target
}

export const filterRandomPool = (entries: DerivedEntry[], pool: RandomPool) =>
  entries.filter((entry) => matchesRandomPool(entry, pool))
