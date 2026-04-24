import type { FormTag, PokemonEntry } from './types'

const SPECIAL_NAME_MAP: Record<string, string> = {
  farfetchd: "Farfetch'd",
  sirfetchd: "Sirfetch'd",
  'mr-mime': 'Mr. Mime',
  'mr-rime': 'Mr. Rime',
  'mime-jr': 'Mime Jr.',
  'type-null': 'Type: Null',
  'ho-oh': 'Ho-Oh',
  'porygon-z': 'Porygon-Z',
  'jangmo-o': 'Jangmo-o',
  'hakamo-o': 'Hakamo-o',
  'kommo-o': 'Kommo-o',
  'tapu-koko': 'Tapu Koko',
  'tapu-lele': 'Tapu Lele',
  'tapu-bulu': 'Tapu Bulu',
  'tapu-fini': 'Tapu Fini',
  'chien-pao': 'Chien-Pao',
  'chi-yu': 'Chi-Yu',
  'ting-lu': 'Ting-Lu',
  'wo-chien': 'Wo-Chien',
  'nidoran-f': 'Nidoran F',
  'nidoran-m': 'Nidoran M',
}

const FORM_TOKEN_LABELS: Record<string, string> = {
  mega: 'Mega',
  gmax: 'Gigantamax',
  primal: 'Primal',
  origin: 'Origin',
  totem: 'Totem',
  alola: 'Alolan',
  alolan: 'Alolan',
  galar: 'Galarian',
  galarian: 'Galarian',
  hisui: 'Hisuian',
  hisuian: 'Hisuian',
  paldea: 'Paldean',
  paldean: 'Paldean',
  female: 'Female',
  male: 'Male',
}

const REGION_TOKENS = new Set([
  'alola',
  'alolan',
  'galar',
  'galarian',
  'hisui',
  'hisuian',
  'paldea',
  'paldean',
])

const SLUG_PREFIX_TOKENS = new Set([
  'mega',
  'gmax',
  'primal',
  'origin',
  'totem',
  ...REGION_TOKENS,
])

const titleCase = (value: string) =>
  value ? `${value[0].toUpperCase()}${value.slice(1)}` : value

export const formatPokemonName = (slug: string) =>
  SPECIAL_NAME_MAP[slug.toLowerCase()] ??
  slug
    .toLowerCase()
    .split('-')
    .map((token) => titleCase(token))
    .join(' ')

export const formatFormLabel = (slug: string) =>
  slug
    .toLowerCase()
    .split('-')
    .map((token) => FORM_TOKEN_LABELS[token] ?? titleCase(token))
    .join(' ')

export const formatPokemonDisplayName = (pokemonName: string, speciesName: string) => {
  const baseName = formatPokemonName(speciesName)
  if (pokemonName === speciesName) {
    return baseName
  }
  const prefix = `${speciesName}-`
  const suffix = pokemonName.startsWith(prefix) ? pokemonName.slice(prefix.length) : pokemonName
  return `${baseName} ${formatFormLabel(suffix)}`
}

export const deriveFormTags = (name: string, isDefault: boolean): FormTag[] => {
  const tags = new Set<FormTag>()
  const tokens = name.toLowerCase().split('-')
  if (isDefault) tags.add('default')
  if (tokens.includes('mega')) tags.add('mega')
  if (tokens.includes('gmax')) tags.add('gmax')
  if (tokens.some((token) => REGION_TOKENS.has(token))) tags.add('regional')
  if (tokens.includes('female') || tokens.includes('male')) tags.add('gendered')
  if (tokens.includes('primal')) tags.add('primal')
  if (tokens.includes('origin')) tags.add('origin')
  if (tokens.includes('totem')) tags.add('totem')
  if (!isDefault && tags.size === 0) tags.add('variant')
  return Array.from(tags)
}

export const buildPokemonSlug = (entry: PokemonEntry) => {
  const species = entry.speciesName.toLowerCase()
  if (entry.name === entry.speciesName) {
    return species
  }
  const prefix = `${species}-`
  const suffix = entry.name.startsWith(prefix) ? entry.name.slice(prefix.length) : entry.name
  const tokens = suffix.split('-').filter(Boolean)
  if (tokens.length === 0) {
    return entry.name
  }
  const [first, ...rest] = tokens
  if (first && SLUG_PREFIX_TOKENS.has(first)) {
    return rest.length ? `${first}-${species}-${rest.join('-')}` : `${first}-${species}`
  }
  return entry.name
}

export const formatDex = (id: number) => String(id).padStart(4, '0')
