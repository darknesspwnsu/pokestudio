import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import pLimit from 'p-limit'
import sharp from 'sharp'

import { extractDominantSwatches } from '../src/lib/palette'
import { deriveFormTags, formatPokemonDisplayName } from '../src/lib/pokemon'
import type { BaseStats, PaletteSet, PokemonEntry, RGB } from '../src/lib/types'

const API_ROOT = 'https://pokeapi.co/api/v2'
const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const OFFICIAL_ART_BASE = `${SPRITE_BASE}/other/official-artwork`
const HOME_BASE = `${SPRITE_BASE}/other/home`
const HOME_SHINY_BASE = `${SPRITE_BASE}/other/home/shiny`
const SHINY_BASE = `${SPRITE_BASE}/shiny`
const OUTPUT_PATH = path.resolve('public/data/pokemon-studio-index.json')
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6)
const LIMIT = Number(process.env.LIMIT ?? 0)
const OFFSET = Number(process.env.OFFSET ?? 0)
const TARGET_SIZE = Number(process.env.SIZE ?? 128)
const SWATCH_COUNT = Number(process.env.SWATCHES ?? 3)

const GENERATION_MAP: Record<string, number> = {
  'generation-i': 1,
  'generation-ii': 2,
  'generation-iii': 3,
  'generation-iv': 4,
  'generation-v': 5,
  'generation-vi': 6,
  'generation-vii': 7,
  'generation-viii': 8,
  'generation-ix': 9,
}

type ListEntry = {
  name: string
  url: string
}

type SpeciesInfo = {
  id: number
  name: string
  color: string
  generation: number
}

type Sprites = {
  front_default: string | null
  front_shiny: string | null
  other?: {
    'official-artwork'?: {
      front_default: string | null
      front_shiny?: string | null
    }
    home?: {
      front_default: string | null
      front_shiny: string | null
    }
  }
}

type StatEntry = {
  base_stat: number
  stat: {
    name: string
  }
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  return response.json() as Promise<T>
}

const loadExistingIndex = async () => {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8')
    const parsed = JSON.parse(raw) as { entries: PokemonEntry[] }
    return parsed.entries ?? []
  } catch {
    return []
  }
}

const buildNormalCandidates = (sprites: Sprites, id: number) => [
  sprites.other?.['official-artwork']?.front_default,
  sprites.other?.home?.front_default,
  sprites.front_default,
  `${OFFICIAL_ART_BASE}/${id}.png`,
  `${HOME_BASE}/${id}.png`,
  `${SPRITE_BASE}/${id}.png`,
].filter(Boolean) as string[]

const buildShinyCandidates = (sprites: Sprites, id: number) => [
  sprites.other?.['official-artwork']?.front_shiny,
  sprites.other?.home?.front_shiny,
  sprites.front_shiny,
  `${HOME_SHINY_BASE}/${id}.png`,
  `${SHINY_BASE}/${id}.png`,
].filter(Boolean) as string[]

const toPixels = (
  data: Buffer,
  channels: number,
  width: number,
  height: number,
): RGB[] => {
  const pixelCount = width * height
  const step = Math.max(1, Math.floor(pixelCount / 12000))
  const pixels: RGB[] = []

  for (let i = 0; i < data.length; i += channels * step) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const alpha = channels === 4 ? data[i + 3] : 255

    if (alpha < 180) {
      continue
    }

    pixels.push([r, g, b])
  }

  return pixels
}

const ensureSwatches = (swatches: PaletteSet['swatches']) => {
  if (swatches.length >= SWATCH_COUNT) {
    return swatches.slice(0, SWATCH_COUNT)
  }

  if (swatches.length === 0) {
    const fallback: RGB = [128, 128, 128]
    return Array.from({ length: SWATCH_COUNT }, () => ({
      rgb: fallback,
      hex: '#808080',
      population: 1,
    }))
  }

  const last = swatches[swatches.length - 1]
  const filled = [...swatches]
  while (filled.length < SWATCH_COUNT) {
    filled.push({ ...last })
  }

  return filled
}

const createFallbackPalette = (): PaletteSet => ({
  swatches: ensureSwatches([]),
  sourceUrl: '',
})

const paletteCache = new Map<string, PaletteSet>()

const extractPalette = async (url: string): Promise<PaletteSet> => {
  const cached = paletteCache.get(url)
  if (cached) {
    return cached
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch image ${url}: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const { data, info } = await sharp(buffer)
    .resize({ width: TARGET_SIZE, height: TARGET_SIZE, fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = toPixels(data, info.channels, info.width, info.height)
  const swatches = ensureSwatches(
    extractDominantSwatches(pixels, SWATCH_COUNT, 16),
  )

  const palette = {
    swatches,
    sourceUrl: url,
  }

  paletteCache.set(url, palette)
  return palette
}

const resolvePaletteFromCandidates = async (
  candidates: string[],
  label: string,
): Promise<{ palette: PaletteSet; url: string }> => {
  let lastError: unknown

  for (const url of candidates) {
    try {
      const palette = await extractPalette(url)
      return { palette, url }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  throw new Error(`No ${label} image candidates available`)
}

const getSpeciesInfo = async (
  url: string,
  cache: Map<string, SpeciesInfo>,
): Promise<SpeciesInfo> => {
  const cached = cache.get(url)
  if (cached) {
    return cached
  }

  const data = await fetchJson<{
    id: number
    name: string
    color: { name: string }
    generation: { name: string }
  }>(url)

  const info = {
    id: data.id,
    name: data.name,
    color: data.color?.name ?? 'unknown',
    generation: GENERATION_MAP[data.generation?.name] ?? 0,
  }

  cache.set(url, info)
  return info
}

const buildBaseStats = (stats: StatEntry[]): BaseStats => {
  const base = {
    hp: 0,
    attack: 0,
    defense: 0,
    specialAttack: 0,
    specialDefense: 0,
    speed: 0,
  }

  for (const stat of stats) {
    switch (stat.stat.name) {
      case 'hp':
        base.hp = stat.base_stat
        break
      case 'attack':
        base.attack = stat.base_stat
        break
      case 'defense':
        base.defense = stat.base_stat
        break
      case 'special-attack':
        base.specialAttack = stat.base_stat
        break
      case 'special-defense':
        base.specialDefense = stat.base_stat
        break
      case 'speed':
        base.speed = stat.base_stat
        break
      default:
        break
    }
  }

  const total =
    base.hp +
    base.attack +
    base.defense +
    base.specialAttack +
    base.specialDefense +
    base.speed

  return {
    ...base,
    total,
  }
}

const buildEntry = async (
  entry: ListEntry,
  existing: Map<string, PokemonEntry>,
  speciesCache: Map<string, SpeciesInfo>,
): Promise<PokemonEntry | null> => {
  const cached = existing.get(entry.name)
  const hasCachedPalettes =
    cached &&
    cached.palettes?.normal?.swatches?.length >= SWATCH_COUNT &&
    cached.palettes?.shiny?.swatches?.length >= SWATCH_COUNT
  const hasCachedStats = Boolean(cached?.baseStats)
  if (
    cached &&
    hasCachedPalettes &&
    hasCachedStats
  ) {
    return cached
  }

  const pokemon = await fetchJson<{
    id: number
    name: string
    order: number
    form_order: number
    is_default: boolean
    species: { name: string; url: string }
    types: { slot: number; type: { name: string } }[]
    sprites: Sprites
    stats: StatEntry[]
  }>(entry.url)

  const speciesInfo = await getSpeciesInfo(pokemon.species.url, speciesCache)
  const displayName = formatPokemonDisplayName(
    pokemon.name,
    pokemon.species.name,
  )
  const baseStats = buildBaseStats(pokemon.stats ?? [])

  const normalCandidates = buildNormalCandidates(pokemon.sprites, pokemon.id)
  const shinyCandidates = buildShinyCandidates(pokemon.sprites, pokemon.id)

  const fallbackPalette = createFallbackPalette()
  const normalResult = hasCachedPalettes
    ? {
        palette: cached!.palettes.normal,
        url: cached!.images.normal,
      }
    : await resolvePaletteFromCandidates(normalCandidates, 'normal').catch(() => ({
        palette: fallbackPalette,
        url: '',
      }))

  let shinyResult = normalResult
  if (hasCachedPalettes && cached?.palettes?.shiny && cached?.images?.shiny) {
    shinyResult = {
      palette: cached.palettes.shiny,
      url: cached.images.shiny,
    }
  } else if (shinyCandidates.length > 0) {
    try {
      shinyResult = await resolvePaletteFromCandidates(shinyCandidates, 'shiny')
    } catch {
      shinyResult = normalResult
    }
  }

  return {
    id: pokemon.id,
    name: pokemon.name,
    displayName,
    speciesId: speciesInfo.id,
    speciesName: speciesInfo.name,
    types: pokemon.types
      .sort((a, b) => a.slot - b.slot)
      .map((item) => item.type.name),
    generation: speciesInfo.generation,
    color: speciesInfo.color,
    formTags: deriveFormTags(pokemon.name, pokemon.is_default),
    isDefault: pokemon.is_default,
    order: pokemon.order,
    formOrder: pokemon.form_order,
    images: {
      normal: normalResult.url,
      shiny: shinyResult.url,
    },
    palettes: {
      normal: normalResult.palette,
      shiny: shinyResult.palette,
    },
    baseStats,
  }
}

const main = async () => {
  const list = await fetchJson<{ results: ListEntry[] }>(
    `${API_ROOT}/pokemon?limit=20000&offset=${OFFSET}`,
  )

  const existingEntries = await loadExistingIndex()
  const existingMap = new Map(
    existingEntries.map((item) => [item.name, item]),
  )
  const speciesCache = new Map<string, SpeciesInfo>()

  const targets = LIMIT > 0 ? list.results.slice(0, LIMIT) : list.results
  const limiter = pLimit(CONCURRENCY)

  let processed = 0
  const startedAt = Date.now()

  const entries = await Promise.all(
    targets.map((entry) =>
      limiter(async () => {
        try {
          const result = await buildEntry(entry, existingMap, speciesCache)
          processed += 1
          if (processed % 25 === 0 || processed === targets.length) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
            console.log(
              `Processed ${processed}/${targets.length} entries in ${elapsed}s`,
            )
          }
          return result
        } catch (error) {
          console.warn(`Failed to process ${entry.name}:`, error)
          processed += 1
          return null
        }
      }),
    ),
  )

  const filtered = entries.filter((item): item is PokemonEntry => Boolean(item))

  const merged = new Map<string, PokemonEntry>()
  for (const entry of [...existingEntries, ...filtered]) {
    merged.set(entry.name, entry)
  }

  const finalEntries = Array.from(merged.values()).sort((a, b) => {
    if (a.speciesId !== b.speciesId) {
      return a.speciesId - b.speciesId
    }
    return a.formOrder - b.formOrder
  })

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await fs.writeFile(
    OUTPUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: finalEntries.length,
        entries: finalEntries,
      },
      null,
      2,
    ),
  )

  console.log(`Saved ${finalEntries.length} entries to ${OUTPUT_PATH}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
