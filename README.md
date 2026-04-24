# PokéStudio

PokéStudio is a static React + TypeScript Pokémon design and discovery suite. It combines team building, palette matching, shiny comparison, type coverage, and stat archetype search using generated public data from PokeAPI and public sprite assets.

## Features

- Build a 1-6 Pokémon team with type coverage, stat summaries, shared palette, suggestions, and poster export.
- Match HEX colors to Pokémon normal or shiny palettes.
- Rank shiny forms by visual color difference.
- Inspect defensive and offensive type matrices for a single Pokémon or team.
- Find Pokémon by stat archetype or similarity.
- Share views with URL state and deploy as a GitHub Pages static site.

## Commands

```bash
npm ci
npm run dev
npm run lint
npm run test
npm run build
npm run goldens
```

## Data

The app reads `public/data/pokemon-studio-index.json`. Regenerate it with:

```bash
npm run generate:index
```

Optional environment variables: `CONCURRENCY`, `LIMIT`, `OFFSET`, `SIZE`, and `SWATCHES`.

Tier labels for random team pools are generated from Pokémon Showdown formats data:

```bash
npm run generate:tiers
```

Golden screenshots are written to `goldens/` from a production preview server. Run `npm run build`, start `npm run preview -- --host 127.0.0.1`, then run `npm run goldens`. If Playwright has not installed a browser yet, run `npx playwright install chromium` once.

## Attribution

Pokémon data and artwork are sourced from PokeAPI and the public PokeAPI sprite repository. Pokémon names, artwork, and trademarks belong to their respective owners.
