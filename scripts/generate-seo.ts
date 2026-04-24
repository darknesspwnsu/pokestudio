import { execSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildPokemonSlug } from '../src/lib/pokemon'
import type { PokemonIndex } from '../src/lib/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const INDEX_PATH = path.join(REPO_ROOT, 'public', 'data', 'pokemon-studio-index.json')
const SITEMAP_PATH = path.join(REPO_ROOT, 'public', 'sitemap.xml')
const ROBOTS_PATH = path.join(REPO_ROOT, 'public', 'robots.txt')
const FALLBACK_OWNER = 'shivadeviah'
const FALLBACK_SITE_URL = `https://${FALLBACK_OWNER}.github.io/pokestudio/`

const normalizeUrl = (value: string) => {
  const trimmed = value.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.endsWith('/') ? withProtocol : `${withProtocol}/`
}

const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

const parseGithubOwner = (remoteUrl: string) => {
  const match = remoteUrl.match(/github\.com[:/]([^/]+)\/[^/]+(?:\.git)?$/i)
  return match?.[1] ?? null
}

const inferDefaultSiteUrl = () => {
  if (process.env.GITHUB_REPOSITORY_OWNER) {
    return `https://${process.env.GITHUB_REPOSITORY_OWNER}.github.io/pokestudio/`
  }

  if (process.env.GITHUB_REPOSITORY) {
    const owner = process.env.GITHUB_REPOSITORY.split('/')[0]
    if (owner) {
      return `https://${owner}.github.io/pokestudio/`
    }
  }

  try {
    const remote = execSync('git config --get remote.origin.url', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const owner = parseGithubOwner(remote)
    if (owner) {
      return `https://${owner}.github.io/pokestudio/`
    }
  } catch {
    // Ignore and use fallback below.
  }

  return FALLBACK_SITE_URL
}

const buildUrl = (baseUrl: string, slug?: string) => {
  const url = new URL(baseUrl)
  if (slug) {
    url.searchParams.set('team', slug)
  }
  return url.toString()
}

const main = async () => {
  const siteUrl = normalizeUrl(process.env.SITE_URL ?? inferDefaultSiteUrl())
  const raw = await readFile(INDEX_PATH, 'utf8')
  const index = JSON.parse(raw) as PokemonIndex
  const slugs = Array.from(
    new Set(
      index.entries
        .filter((entry) => entry.isDefault)
        .map((entry) => buildPokemonSlug(entry))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b))

  const lastmod = new Date(index.generatedAt).toISOString()
  const urls = [buildUrl(siteUrl), ...slugs.map((slug) => buildUrl(siteUrl, slug))]
  const xmlLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (loc) =>
        `  <url><loc>${escapeXml(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`,
    ),
    '</urlset>',
    '',
  ]
  const robotsLines = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}sitemap.xml`,
    '',
  ]

  await writeFile(SITEMAP_PATH, xmlLines.join('\n'), 'utf8')
  await writeFile(ROBOTS_PATH, robotsLines.join('\n'), 'utf8')

  console.log(`Generated SEO files for ${urls.length} URLs at ${siteUrl}`)
}

void main()
