import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'

const BASE_URL = process.env.GOLDEN_URL ?? 'http://127.0.0.1:4173/pokestudio/'
const OUTPUT_DIR = path.resolve(process.env.GOLDEN_DIR ?? 'goldens')

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop-sm', width: 1024, height: 768 },
  { name: 'desktop-md', width: 1280, height: 900 },
  { name: 'desktop-lg', width: 1600, height: 1000 },
]

const flows = [
  {
    name: 'team-default',
    query: '?tool=team&mode=normal&team=pikachu,charizard,greninja&pokemon=pikachu&hex=%23FACC15,%2338BDF8,%23F472B6',
  },
  {
    name: 'team-partial',
    query: '?tool=team&mode=normal&team=bulbasaur,squirtle&pokemon=charmander&hex=%2378A794,%236390F0',
  },
  {
    name: 'team-empty',
    query: '?tool=team&mode=normal&team=&pokemon=pikachu&hex=%23FACC15',
  },
  {
    name: 'palette',
    query: '?tool=palette&mode=normal&team=pikachu,charizard,greninja&pokemon=muk-alola&hex=%23FACC15,%2338BDF8,%23F472B6',
  },
  {
    name: 'shiny',
    query: '?tool=shiny&mode=normal&team=pikachu,charizard,greninja&pokemon=charizard&hex=%23FACC15,%2338BDF8,%23F472B6',
  },
  {
    name: 'types',
    query: '?tool=types&mode=normal&team=pikachu,charizard,greninja&pokemon=pikachu&hex=%23FACC15,%2338BDF8,%23F472B6',
  },
  {
    name: 'stats',
    query: '?tool=stats&mode=normal&team=pikachu,charizard,greninja&pokemon=pikachu&hex=%23FACC15,%2338BDF8,%23F472B6',
  },
]

const waitForApp = async (page: Page) => {
  await page.waitForSelector('text=PokéStudio', { timeout: 15_000 })
  await page.waitForSelector('.workspace', { timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => undefined)
}

const warmFullPage = async (page: Page) => {
  await page.evaluate(() => document.documentElement.classList.add('golden-capture'))
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 600) {
    await page.evaluate((scrollY) => window.scrollTo(0, scrollY), y)
    await page.waitForTimeout(40)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(120)
}

const main = async () => {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    for (const flow of flows) {
      const url = new URL(flow.query, BASE_URL).toString()
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await waitForApp(page)
      await warmFullPage(page)
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${viewport.name}-${flow.name}.png`),
        fullPage: true,
      })
      console.log(`${viewport.name}/${flow.name}`)
    }
  }

  await browser.close()
  console.log(`Generated ${viewports.length * flows.length} goldens in ${OUTPUT_DIR}`)
}

void main()
