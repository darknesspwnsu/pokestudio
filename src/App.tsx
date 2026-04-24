import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'
import { toPng } from 'html-to-image'

import { contrastColor, normalizeHex } from './lib/color'
import { deriveEntries, loadPokemonIndex, searchEntries } from './lib/data'
import { toCssVariables, toTeamJson, toTeamSummary } from './lib/exports'
import { rankPaletteMatches } from './lib/match'
import { formatDex } from './lib/pokemon'
import { rankShinyDelta } from './lib/shiny'
import { rankSimilar } from './lib/stats'
import {
  averageStats,
  decodeTeam,
  encodeTeam,
  MAX_TEAM_SIZE,
  resolveTeam,
  suggestTeamPatches,
  teamAccent,
  teamDefense,
  teamOffense,
  teamPalette,
} from './lib/team'
import { filterRandomPool, getTierLabel, RANDOM_POOLS, type RandomPool } from './lib/tiers'
import { defensiveProfile, POKEMON_TYPES, TYPE_COLORS } from './lib/type-chart'
import type { DerivedEntry, PaletteMode, PokemonIndex, StudioTab, TeamSlot } from './lib/types'

const TABS: { id: StudioTab; label: string; hint: string }[] = [
  { id: 'team', label: 'Team Studio', hint: 'Poster, coverage, palette' },
  { id: 'palette', label: 'Palette Matcher', hint: 'HEX to Pokémon' },
  { id: 'shiny', label: 'Shiny Delta', hint: 'Normal vs shiny' },
  { id: 'types', label: 'Type Matrix', hint: 'Threats and coverage' },
  { id: 'stats', label: 'Stat Finder', hint: 'Roles and similarity' },
]

const DEFAULT_TEAM: TeamSlot[] = [
  { name: 'pikachu', mode: 'normal' },
  { name: 'charizard', mode: 'normal' },
  { name: 'greninja', mode: 'normal' },
]

const DEFAULT_HEXES = ['#FACC15', '#38BDF8', '#F472B6']
const ARCHETYPES = [
  'fast attacker',
  'bulky wall',
  'balanced',
  'glass cannon',
  'slow tank',
  'special attacker',
  'physical attacker',
  'mixed attacker',
]

const readInitialState = () => {
  if (typeof window === 'undefined') {
    return {
      tab: 'team' as StudioTab,
      team: DEFAULT_TEAM,
      paletteMode: 'normal' as PaletteMode,
      hexes: DEFAULT_HEXES,
      selected: 'pikachu',
      pool: 'ou' as RandomPool,
    }
  }
  const params = new URLSearchParams(window.location.search)
  const teamParam = params.get('team')
  const tab = TABS.some((item) => item.id === params.get('tool'))
    ? (params.get('tool') as StudioTab)
    : 'team'
  return {
    tab,
    team: params.has('team') ? decodeTeam(teamParam) : DEFAULT_TEAM,
    paletteMode: params.get('mode') === 'shiny' ? ('shiny' as const) : ('normal' as const),
    hexes: (params.get('hex')?.split(',') ?? DEFAULT_HEXES).slice(0, 5),
    selected: params.get('pokemon') ?? 'pikachu',
    pool: RANDOM_POOLS.some((pool) => pool.id === params.get('pool'))
      ? (params.get('pool') as RandomPool)
      : 'ou',
  }
}

const copyText = async (value: string) => {
  await navigator.clipboard?.writeText(value)
}

const SearchBox = memo(function SearchBox({
  entries,
  value,
  onChange,
  label,
}: {
  entries: DerivedEntry[]
  value: string
  onChange: (name: string) => void
  label: string
}) {
  return (
  <label className="field">
    <span>{label}</span>
    <input
      list="pokemon-options"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search name, dex, type, form..."
    />
    <datalist id="pokemon-options">
      {entries.slice(0, 120).map((entry) => (
        <option key={entry.name} value={entry.name}>
          {entry.displayName}
        </option>
      ))}
    </datalist>
  </label>
)
})

const TypeChip = memo(function TypeChip({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? '#64748B'
  return (
  <span
    className="type-chip"
    style={{ backgroundColor: color, color: contrastColor(color) }}
  >
    {type}
  </span>
)
})

const Swatches = memo(function Swatches({ colors }: { colors: { hex: string }[] }) {
  return (
  <div className="swatches">
    {colors.map((swatch, index) => (
      <span key={`${swatch.hex}-${index}`} style={{ backgroundColor: swatch.hex }} title={swatch.hex} />
    ))}
  </div>
)
})

const PokemonCard = memo(function PokemonCard({
  entry,
  mode,
  action,
}: {
  entry: DerivedEntry
  mode: PaletteMode
  action?: React.ReactNode
}) {
  return (
  <article className="pokemon-card">
    <div className="card-art">
      <img src={entry.images[mode]} alt={entry.displayName} loading="lazy" decoding="async" />
    </div>
    <div>
      <p className="kicker">#{formatDex(entry.speciesId)} · Gen {entry.generation}</p>
      <h3>{entry.displayName}</h3>
      <div className="chip-row">{entry.types.map((type) => <TypeChip key={type} type={type} />)}</div>
      <Swatches colors={entry.palettes[mode].swatches} />
      {action}
    </div>
  </article>
)
})

function App() {
  const initial = useMemo(() => readInitialState(), [])
  const [index, setIndex] = useState<PokemonIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('pokestudio-theme')
    return stored === 'light' ? 'light' : 'dark'
  })
  const [tab, setTab] = useState<StudioTab>(initial.tab)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>(initial.paletteMode)
  const [query, setQuery] = useState('')
  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>(initial.team)
  const [selectedName, setSelectedName] = useState(initial.selected)
  const [hexValues, setHexValues] = useState(initial.hexes)
  const [shinyDirection, setShinyDirection] = useState<'most' | 'least'>('most')
  const [archetype, setArchetype] = useState('fast attacker')
  const [randomPool, setRandomPool] = useState<RandomPool>(initial.pool)
  const [toast, setToast] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const posterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('pokestudio-theme', theme)
  }, [theme])

  useEffect(() => {
    let mounted = true
    loadPokemonIndex()
      .then((data) => {
        if (mounted) setIndex(data)
      })
      .catch((loadError: unknown) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Failed to load data')
      })
    return () => {
      mounted = false
    }
  }, [])

  const entries = useMemo(() => (index ? deriveEntries(index) : []), [index])
  const deferredQuery = useDeferredValue(query)
  const visibleEntries = useMemo(
    () => searchEntries(entries, deferredQuery).slice(0, 80),
    [entries, deferredQuery],
  )
  const defaultEntries = useMemo(() => entries.filter((entry) => entry.isDefault), [entries])
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.name, entry])), [entries])
  const selectedEntry = entryMap.get(selectedName) ?? entries[0]
  const team = useMemo(() => resolveTeam(teamSlots, entries), [teamSlots, entries])
  const accent = useMemo(
    () =>
      team.length > 0
        ? teamAccent(team)
        : selectedEntry?.palettes[paletteMode].swatches[0]?.hex ?? '#38BDF8',
    [paletteMode, selectedEntry, team],
  )

  useEffect(() => {
    if (entries.length === 0) return
    const params = new URLSearchParams()
    params.set('tool', tab)
    params.set('mode', paletteMode)
    params.set('team', encodeTeam(teamSlots))
    params.set('pokemon', selectedName)
    params.set('hex', hexValues.join(','))
    params.set('pool', randomPool)
    const next = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', next)
  }, [entries.length, hexValues, paletteMode, randomPool, selectedName, tab, teamSlots])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  const addToTeam = (name: string, mode = paletteMode) => {
    if (teamSlots.some((slot) => slot.name === name)) return
    setTeamSlots((slots) => [...slots, { name, mode }].slice(0, MAX_TEAM_SIZE))
  }

  const removeFromTeam = (name: string) => {
    setTeamSlots((slots) => slots.filter((slot) => slot.name !== name))
  }

  const exportPoster = async () => {
    if (!posterRef.current) return
    const dataUrl = await toPng(posterRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      filter: (node) =>
        !(node instanceof HTMLElement && node.classList.contains('no-export')),
    })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'pokestudio-team.png'
    link.click()
  }

  const randomizeTeam = () => {
    const pool = filterRandomPool(defaultEntries, randomPool)
    const source = pool.length >= MAX_TEAM_SIZE ? pool : defaultEntries
    const shuffled = [...source].sort(() => Math.random() - 0.5)
    setTeamSlots(
      shuffled.slice(0, MAX_TEAM_SIZE).map((entry) => ({
        name: entry.name,
        mode: Math.random() > 0.88 ? 'shiny' : 'normal',
      })),
    )
    startTransition(() => setTab('team'))
  }

  const stats = useMemo(() => averageStats(team), [team])
  const defense = useMemo(() => teamDefense(team), [team])
  const offense = useMemo(() => teamOffense(team), [team])
  const suggestions = useMemo(
    () => (tab === 'team' ? suggestTeamPatches(team, entries) : []),
    [entries, tab, team],
  )
  const paletteMatches = useMemo(
    () => (tab === 'palette' ? rankPaletteMatches(entries, hexValues, paletteMode).slice(0, 18) : []),
    [entries, hexValues, paletteMode, tab],
  )
  const shinyRows = useMemo(
    () => (tab === 'shiny' ? rankShinyDelta(visibleEntries, shinyDirection).slice(0, 24) : []),
    [shinyDirection, tab, visibleEntries],
  )
  const statRows = useMemo(
    () =>
      tab === 'stats'
        ? visibleEntries
            .filter((entry) => entry.archetypes.includes(archetype))
            .sort((a, b) => b.baseStats.total - a.baseStats.total)
            .slice(0, 18)
        : [],
    [archetype, tab, visibleEntries],
  )
  const similarRows = useMemo(
    () => (tab === 'stats' && selectedEntry ? rankSimilar(entries, selectedEntry).slice(0, 8) : []),
    [entries, selectedEntry, tab],
  )
  const selectedDefense = useMemo(
    () => (selectedEntry ? defensiveProfile(selectedEntry.types) : []),
    [selectedEntry],
  )
  const setActiveTab = (nextTab: StudioTab) => {
    startTransition(() => setTab(nextTab))
  }

  if (error) {
    return <main className="center-state">PokéStudio could not load: {error}</main>
  }

  if (!index || entries.length === 0) {
    return <main className="center-state">Booting PokéStudio data core...</main>
  }

  return (
    <main
      className="studio-shell"
      style={{
        '--accent': accent,
        '--accent-ink': contrastColor(accent),
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div>
          <p className="kicker">Static Pokémon Design Lab</p>
          <h1>PokéStudio</h1>
        </div>
        <nav className="tabs" aria-label="PokéStudio tools">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-busy={isPending}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <select
            className="tier-select"
            value={randomPool}
            onChange={(event) => setRandomPool(event.target.value as RandomPool)}
            aria-label="Random team pool"
          >
            {RANDOM_POOLS.map((pool) => (
              <option key={pool.id} value={pool.id}>
                {pool.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={randomizeTeam}>Random team</button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="rail panel">
          <SearchBox entries={visibleEntries} value={query} onChange={setQuery} label="Command search" />
          <label className="field">
            <span>Palette mode</span>
            <select value={paletteMode} onChange={(event) => setPaletteMode(event.target.value as PaletteMode)}>
              <option value="normal">Normal artwork</option>
              <option value="shiny">Shiny artwork</option>
            </select>
          </label>
          <div className="result-list">
            {visibleEntries.slice(0, 18).map((entry) => (
              <button
                key={entry.name}
                type="button"
                className={selectedName === entry.name ? 'search-row active' : 'search-row'}
                onClick={() => setSelectedName(entry.name)}
              >
                <img src={entry.images[paletteMode]} alt="" loading="lazy" decoding="async" />
                <span>{entry.displayName}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          {tab === 'team' && (
            <div className="tool-grid tool-panel">
              <div className="panel poster" ref={posterRef}>
                <div className="poster-header">
                  <div>
                    <p className="kicker">Team Studio</p>
                    <h2>Battle-ready visual board</h2>
                  </div>
                  <span>{team.length}/{MAX_TEAM_SIZE}</span>
                </div>
                <div className="team-strip">
                  {team.map(({ entry, mode }) => (
                    <article key={entry.name} className="team-member">
                      <button
                        type="button"
                        className="no-export"
                        onClick={() => removeFromTeam(entry.name)}
                      >
                        Remove
                      </button>
                      <img src={entry.images[mode]} alt={entry.displayName} loading="eager" decoding="async" />
                      <h3>{entry.displayName}</h3>
                      <div className="chip-row">{entry.types.map((type) => <TypeChip key={type} type={type} />)}</div>
                    </article>
                  ))}
                  {team.length === 0 && <p className="empty">Add Pokémon from search or suggestions.</p>}
                </div>
                <Swatches colors={teamPalette(team)} />
              </div>

              <div className="panel">
                <h2>Add selected Pokémon</h2>
                {selectedEntry && (
                  <PokemonCard
                    entry={selectedEntry}
                    mode={paletteMode}
                    action={<button type="button" onClick={() => addToTeam(selectedEntry.name)}>Add to team</button>}
                  />
                )}
                <h2>Average stats</h2>
                <StatBars stats={stats} />
              </div>

              <CoveragePanel defense={defense} offense={offense} />

              <div className="panel">
                <h2>Patch suggestions</h2>
                <div className="mini-grid">
                  {suggestions.length === 0 ? (
                    <p className="empty compact">
                      Add team members first; suggestions appear when PokéStudio finds shared pressure points.
                    </p>
                  ) : suggestions.map(({ entry, score }) => (
                    <PokemonCard
                      key={entry.name}
                      entry={entry}
                      mode="normal"
                      action={<button type="button" onClick={() => addToTeam(entry.name)}>Add · {score.toFixed(1)}</button>}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'palette' && (
            <div className="tool-grid tool-panel">
              <div className="panel">
                <p className="kicker">Palette Matcher</p>
                <h2>Find Pokémon for a color system</h2>
                <div className="hex-grid">
                  {hexValues.map((value, index) => (
                    <input
                      key={index}
                      value={value}
                      onChange={(event) =>
                        setHexValues((values) =>
                          values.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                        )
                      }
                      style={{ borderColor: normalizeHex(value) ?? '#EF4444' }}
                    />
                  ))}
                </div>
                <button type="button" disabled={hexValues.length >= 5} onClick={() => setHexValues((values) => [...values, '#FFFFFF'])}>
                  Add HEX
                </button>
              </div>
              <div className="panel span-2">
                <div className="card-grid">
                  {paletteMatches.map(({ entry, score }) => (
                    <PokemonCard
                      key={entry.name}
                      entry={entry}
                      mode={paletteMode}
                      action={<button type="button" onClick={() => addToTeam(entry.name)}>Match {score}% · Add</button>}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'shiny' && (
            <div className="tool-grid tool-panel">
              <div className="panel">
                <p className="kicker">Shiny Delta</p>
                <h2>Rank color shifts</h2>
                <select value={shinyDirection} onChange={(event) => setShinyDirection(event.target.value as 'most' | 'least')}>
                  <option value="most">Most changed</option>
                  <option value="least">Barely changed</option>
                </select>
              </div>
              <div className="panel span-2 shiny-list">
                {shinyRows.map((entry) => (
                  <article key={entry.name} className="shiny-row">
                    <img src={entry.images.normal} alt={`${entry.displayName} normal`} loading="lazy" decoding="async" />
                    <img src={entry.images.shiny} alt={`${entry.displayName} shiny`} loading="lazy" decoding="async" />
                    <div>
                      <h3>{entry.displayName}</h3>
                      <p>Delta score {entry.shinyDelta}</p>
                      <Swatches colors={[...entry.palettes.normal.swatches, ...entry.palettes.shiny.swatches]} />
                    </div>
                    <button type="button" onClick={() => setSelectedName(entry.name)}>Inspect</button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {tab === 'types' && (
            <div className="tool-grid tool-panel">
              <CoveragePanel defense={defense} offense={offense} />
              <div className="panel span-2">
                <p className="kicker">Selected Pokémon</p>
                {selectedEntry && (
                  <>
                    <PokemonCard entry={selectedEntry} mode={paletteMode} />
                    <TypeMatrix rows={selectedDefense} valueKey="multiplier" />
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'stats' && (
            <div className="tool-grid tool-panel">
              <div className="panel">
                <p className="kicker">Stat Finder</p>
                <h2>Search by stat shape</h2>
                <select value={archetype} onChange={(event) => setArchetype(event.target.value)}>
                  {ARCHETYPES.map((item) => <option key={item}>{item}</option>)}
                </select>
                {selectedEntry && (
                  <>
                    <h2>Similar to {selectedEntry.displayName}</h2>
                    <StatBars stats={selectedEntry.baseStats} />
                  </>
                )}
              </div>
              <div className="panel">
                <h2>{archetype}</h2>
                <div className="mini-grid">
                  {statRows.map((entry) => (
                    <PokemonCard
                      key={entry.name}
                      entry={entry}
                      mode={paletteMode}
                      action={<button type="button" onClick={() => addToTeam(entry.name)}>Add · {entry.baseStats.total}</button>}
                    />
                  ))}
                </div>
              </div>
              <div className="panel">
                <h2>Similar stat profiles</h2>
                <div className="mini-grid">
                  {similarRows.map(({ entry, score }) => (
                    <PokemonCard
                      key={entry.name}
                      entry={entry}
                      mode={paletteMode}
                      action={<button type="button" onClick={() => addToTeam(entry.name)}>Similarity {Math.round(score * 100)}%</button>}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <aside className="inspector panel">
          <h2>Output bay</h2>
          <button type="button" onClick={exportPoster}>Export team PNG</button>
          <button type="button" onClick={() => copyText(window.location.href).then(() => showToast('Copied share URL'))}>
            Copy share URL
          </button>
          <button type="button" onClick={() => copyText(toTeamJson(team)).then(() => showToast('Copied team JSON'))}>
            Copy team JSON
          </button>
          <button type="button" onClick={() => copyText(toTeamSummary(team)).then(() => showToast('Copied summary'))}>
            Copy team summary
          </button>
          {selectedEntry && (
            <button type="button" onClick={() => copyText(toCssVariables(selectedEntry, paletteMode)).then(() => showToast('Copied CSS'))}>
              Copy selected CSS
            </button>
          )}
          <h2>Team notes</h2>
          <TeamChips
            team={team}
            selectedEntry={selectedEntry}
            randomPool={randomPool}
            onAddSelected={() => selectedEntry && addToTeam(selectedEntry.name)}
            onRemove={removeFromTeam}
            onRandomize={randomizeTeam}
          />
          <h2>Selected roles</h2>
          <div className="chip-row">{selectedEntry?.archetypes.map((item) => <span className="soft-chip" key={item}>{item}</span>)}</div>
        </aside>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}

const TeamChips = ({
  team,
  selectedEntry,
  randomPool,
  onAddSelected,
  onRemove,
  onRandomize,
}: {
  team: ReturnType<typeof resolveTeam>
  selectedEntry?: DerivedEntry
  randomPool: RandomPool
  onAddSelected: () => void
  onRemove: (name: string) => void
  onRandomize: () => void
}) => {
  const selectedAlreadyAdded = selectedEntry
    ? team.some(({ entry }) => entry.name === selectedEntry.name)
    : true
  const isFull = team.length >= MAX_TEAM_SIZE
  const poolLabel = RANDOM_POOLS.find((pool) => pool.id === randomPool)?.label ?? 'OU'

  return (
    <div className="team-chip-panel">
      <div className="team-chip-actions">
        <button type="button" onClick={onAddSelected} disabled={!selectedEntry || selectedAlreadyAdded || isFull}>
          Add selected
        </button>
        <button type="button" onClick={onRandomize}>Random {poolLabel}</button>
      </div>
      <div className="team-chip-list" aria-label="Current team">
        {team.length === 0 ? (
          <p className="empty compact">No team members yet. Add selected or generate a tier pool.</p>
        ) : (
          team.map(({ entry, mode }) => (
            <div className="team-chip" key={entry.name}>
              <img src={entry.images[mode]} alt="" loading="lazy" decoding="async" />
              <span>
                <b>{entry.displayName}</b>
                <small>{getTierLabel(entry)} · {mode}</small>
              </span>
              <button type="button" aria-label={`Remove ${entry.displayName}`} onClick={() => onRemove(entry.name)}>
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const StatBars = ({ stats }: { stats: Record<string, number> }) => {
  const rows = [
    ['HP', stats.hp ?? 0],
    ['ATK', stats.attack ?? 0],
    ['DEF', stats.defense ?? 0],
    ['SP.ATK', stats.specialAttack ?? 0],
    ['SP.DEF', stats.specialDefense ?? 0],
    ['SPD', stats.speed ?? 0],
    ['TOTAL', stats.total ?? 0],
  ] as const
  return (
    <div className="stat-bars">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <b>{value}</b>
          <i style={{ width: `${Math.min(100, (value / (label === 'TOTAL' ? 720 : 180)) * 100)}%` }} />
        </div>
      ))}
    </div>
  )
}

const TypeMatrix = ({
  rows,
  valueKey,
}: {
  rows: { type: string; [key: string]: number | string }[]
  valueKey: string
}) => (
  <div className="type-matrix">
    {rows.map((row) => {
      const value = Number(row[valueKey])
      const state = value === 0 ? 'immune' : value > 1 ? 'weak' : value < 1 ? 'resist' : 'neutral'
      return (
        <div key={row.type} className={state}>
          <span>{row.type}</span>
          <b>{Number.isInteger(value) ? value : value.toFixed(1)}x</b>
        </div>
      )
    })}
  </div>
)

const CoveragePanel = ({
  defense,
  offense,
}: {
  defense: ReturnType<typeof teamDefense>
  offense: ReturnType<typeof teamOffense>
}) => {
  const pressureTypes = defense
    .filter((row) => row.weak > row.resist + row.immune)
    .map((row) => row.type)
    .slice(0, 5)
  const uncoveredTypes = offense
    .filter((row) => row.best <= 1)
    .map((row) => row.type)
    .slice(0, 5)

  return (
    <div className="panel span-2 coverage-panel">
      <div className="coverage-header">
        <div>
          <p className="kicker">Type Matrix</p>
          <h2>Team pressure map</h2>
        </div>
        <div className="coverage-summary">
          <span>Pressure: {pressureTypes.join(', ') || 'none'}</span>
          <span>Needs hits: {uncoveredTypes.join(', ') || 'covered'}</span>
        </div>
      </div>
      <div className="matrix-columns">
        <div>
          <h3>Incoming threats</h3>
          <div className="pressure-grid">
            {defense.map((row) => {
              const state =
                row.weak > row.resist + row.immune
                  ? 'weak'
                  : row.immune > 0
                    ? 'immune'
                    : row.resist > row.weak
                      ? 'resist'
                      : 'neutral'
              return (
                <div key={row.type} className={`pressure-card ${state}`}>
                  <TypeChip type={row.type} />
                  <strong>{row.weak}</strong>
                  <small>weak</small>
                  <strong>{row.resist + row.immune}</strong>
                  <small>safe</small>
                </div>
              )
            })}
          </div>
        </div>
        <div>
          <h3>Offensive coverage</h3>
          <div className="pressure-grid">
            {offense.map((row) => (
              <div key={row.type} className={`pressure-card ${row.best > 1 ? 'resist' : row.best === 0 ? 'weak' : 'neutral'}`}>
                <TypeChip type={row.type} />
                <strong>{row.best > 0 ? `${row.best}x` : '—'}</strong>
                <small>best hit</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="microcopy">Type order: {POKEMON_TYPES.join(' / ')}</p>
    </div>
  )
}

export default App
