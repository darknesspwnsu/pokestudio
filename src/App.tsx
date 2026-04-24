import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toPng } from 'html-to-image'

import { contrastColor, normalizeHex } from './lib/color'
import { deriveEntries, loadPokemonIndex, searchEntries } from './lib/data'
import { toCssVariables, toShareableTeam, toTeamJson, toTeamSummary } from './lib/exports'
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
    }
  }
  const params = new URLSearchParams(window.location.search)
  const tab = TABS.some((item) => item.id === params.get('tool'))
    ? (params.get('tool') as StudioTab)
    : 'team'
  return {
    tab,
    team: decodeTeam(params.get('team')),
    paletteMode: params.get('mode') === 'shiny' ? ('shiny' as const) : ('normal' as const),
    hexes: (params.get('hex')?.split(',') ?? DEFAULT_HEXES).slice(0, 5),
    selected: params.get('pokemon') ?? 'pikachu',
  }
}

const copyText = async (value: string) => {
  await navigator.clipboard?.writeText(value)
}

const SearchBox = ({
  entries,
  value,
  onChange,
  label,
}: {
  entries: DerivedEntry[]
  value: string
  onChange: (name: string) => void
  label: string
}) => (
  <label className="field">
    <span>{label}</span>
    <input
      list="pokemon-options"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search name, dex, type, form..."
    />
    <datalist id="pokemon-options">
      {entries.slice(0, 900).map((entry) => (
        <option key={entry.name} value={entry.name}>
          {entry.displayName}
        </option>
      ))}
    </datalist>
  </label>
)

const TypeChip = ({ type }: { type: string }) => (
  <span
    className="type-chip"
    style={{ backgroundColor: TYPE_COLORS[type] ?? '#64748B', color: contrastColor(TYPE_COLORS[type] ?? '#64748B') }}
  >
    {type}
  </span>
)

const Swatches = ({ colors }: { colors: { hex: string }[] }) => (
  <div className="swatches">
    {colors.map((swatch, index) => (
      <span key={`${swatch.hex}-${index}`} style={{ backgroundColor: swatch.hex }} title={swatch.hex} />
    ))}
  </div>
)

const PokemonCard = ({
  entry,
  mode,
  action,
}: {
  entry: DerivedEntry
  mode: PaletteMode
  action?: React.ReactNode
}) => (
  <article className="pokemon-card">
    <div className="card-art">
      <img src={entry.images[mode]} alt={entry.displayName} loading="lazy" />
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
  const [teamSlots, setTeamSlots] = useState<TeamSlot[]>(
    initial.team.length > 0 ? initial.team : DEFAULT_TEAM,
  )
  const [selectedName, setSelectedName] = useState(initial.selected)
  const [hexValues, setHexValues] = useState(initial.hexes)
  const [shinyDirection, setShinyDirection] = useState<'most' | 'least'>('most')
  const [archetype, setArchetype] = useState('fast attacker')
  const [toast, setToast] = useState<string | null>(null)
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
  const visibleEntries = useMemo(() => searchEntries(entries, query).slice(0, 80), [entries, query])
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.name, entry])), [entries])
  const selectedEntry = entryMap.get(selectedName) ?? entries[0]
  const team = useMemo(() => resolveTeam(teamSlots, entries), [teamSlots, entries])
  const accent = team.length > 0 ? teamAccent(team) : selectedEntry?.palettes[paletteMode].swatches[0]?.hex ?? '#38BDF8'

  useEffect(() => {
    if (entries.length === 0) return
    const params = new URLSearchParams()
    params.set('tool', tab)
    params.set('mode', paletteMode)
    params.set('team', encodeTeam(teamSlots))
    params.set('pokemon', selectedName)
    params.set('hex', hexValues.join(','))
    const next = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', next)
  }, [entries.length, hexValues, paletteMode, selectedName, tab, teamSlots])

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(null), 1800)
  }, [])

  const addToTeam = (name: string, mode = paletteMode) => {
    if (teamSlots.some((slot) => slot.name === name)) return
    setTeamSlots((slots) => [...slots, { name, mode }].slice(0, MAX_TEAM_SIZE))
  }

  const exportPoster = async () => {
    if (!posterRef.current) return
    const dataUrl = await toPng(posterRef.current, { cacheBust: true, pixelRatio: 2 })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'pokestudio-team.png'
    link.click()
  }

  const randomizeTeam = () => {
    const defaults = entries.filter((entry) => entry.isDefault)
    const shuffled = [...defaults].sort(() => Math.random() - 0.5)
    setTeamSlots(shuffled.slice(0, 6).map((entry) => ({ name: entry.name, mode: Math.random() > 0.82 ? 'shiny' : 'normal' })))
    setTab('team')
  }

  if (error) {
    return <main className="center-state">PokéStudio could not load: {error}</main>
  }

  if (!index || entries.length === 0) {
    return <main className="center-state">Booting PokéStudio data core...</main>
  }

  const stats = averageStats(team)
  const defense = teamDefense(team)
  const offense = teamOffense(team)
  const suggestions = suggestTeamPatches(team, entries)
  const paletteMatches = rankPaletteMatches(entries, hexValues, paletteMode).slice(0, 18)
  const shinyRows = rankShinyDelta(visibleEntries, shinyDirection).slice(0, 24)
  const statRows = visibleEntries
    .filter((entry) => entry.archetypes.includes(archetype))
    .sort((a, b) => b.baseStats.total - a.baseStats.total)
    .slice(0, 18)
  const similarRows = selectedEntry ? rankSimilar(entries, selectedEntry).slice(0, 8) : []

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
              onClick={() => setTab(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <button type="button" onClick={randomizeTeam}>Random</button>
          <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>

      <section className="layout">
        <aside className="rail panel">
          <SearchBox entries={entries} value={query} onChange={setQuery} label="Command search" />
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
                <img src={entry.images[paletteMode]} alt="" />
                <span>{entry.displayName}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="workspace">
          {tab === 'team' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="tool-grid">
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
                      <button type="button" onClick={() => setTeamSlots((slots) => slots.filter((slot) => slot.name !== entry.name))}>Remove</button>
                      <img src={entry.images[mode]} alt={entry.displayName} />
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
                  {suggestions.map(({ entry, score }) => (
                    <PokemonCard
                      key={entry.name}
                      entry={entry}
                      mode="normal"
                      action={<button type="button" onClick={() => addToTeam(entry.name)}>Add · {score.toFixed(1)}</button>}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'palette' && (
            <div className="tool-grid">
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
            <div className="tool-grid">
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
                    <img src={entry.images.normal} alt={`${entry.displayName} normal`} />
                    <img src={entry.images.shiny} alt={`${entry.displayName} shiny`} />
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
            <div className="tool-grid">
              <CoveragePanel defense={defense} offense={offense} />
              <div className="panel span-2">
                <p className="kicker">Selected Pokémon</p>
                {selectedEntry && (
                  <>
                    <PokemonCard entry={selectedEntry} mode={paletteMode} />
                    <TypeMatrix rows={defensiveProfile(selectedEntry.types)} valueKey="multiplier" />
                  </>
                )}
              </div>
            </div>
          )}

          {tab === 'stats' && (
            <div className="tool-grid">
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
          <pre>{toShareableTeam(teamSlots)}</pre>
          <h2>Selected roles</h2>
          <div className="chip-row">{selectedEntry?.archetypes.map((item) => <span className="soft-chip" key={item}>{item}</span>)}</div>
        </aside>
      </section>
      {toast && <div className="toast">{toast}</div>}
    </main>
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
}) => (
  <div className="panel span-2">
    <p className="kicker">Type Matrix</p>
    <h2>Team pressure map</h2>
    <div className="matrix-columns">
      <div>
        <h3>Incoming threats</h3>
        <div className="type-matrix">
          {defense.map((row) => (
            <div key={row.type} className={row.weak > row.resist + row.immune ? 'weak' : row.immune > 0 ? 'immune' : row.resist > row.weak ? 'resist' : 'neutral'}>
              <span>{row.type}</span>
              <b>{row.weak}W/{row.resist}R/{row.immune}I</b>
            </div>
          ))}
        </div>
      </div>
      <div>
        <h3>Offensive coverage</h3>
        <div className="type-matrix">
          {offense.map((row) => (
            <div key={row.type} className={row.best > 1 ? 'resist' : row.best === 0 ? 'weak' : 'neutral'}>
              <span>{row.type}</span>
              <b>{row.best}x</b>
            </div>
          ))}
        </div>
      </div>
    </div>
    <p className="microcopy">Types: {POKEMON_TYPES.join(' / ')}</p>
  </div>
)

export default App
