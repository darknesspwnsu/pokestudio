import type { PaletteSwatch, RGB } from './types'

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export const hexToRgb = (hex: string): RGB | null => {
  const match = HEX_RE.exec(hex.trim())
  if (!match) {
    return null
  }

  let value = match[1]
  if (value.length === 3) {
    value = value
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
  }

  const parsed = Number.parseInt(value, 16)
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255]
}

export const rgbToHex = (rgb: RGB) =>
  `#${rgb.map((channel) => clampChannel(channel).toString(16).padStart(2, '0')).join('').toUpperCase()}`

export const normalizeHex = (hex: string) => {
  const rgb = hexToRgb(hex)
  return rgb ? rgbToHex(rgb) : null
}

export const colorDistance = (a: RGB, b: RGB) =>
  Math.sqrt(
    Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2) + Math.pow(a[2] - b[2], 2),
  )

export const relativeLuminance = (rgb: RGB) => {
  const toLinear = (value: number) => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastColor = (hex: string) => {
  const rgb = hexToRgb(hex)
  return rgb && relativeLuminance(rgb) > 0.44 ? '#111318' : '#F8F4EA'
}

export const averageSwatches = (swatches: PaletteSwatch[]) => {
  if (swatches.length === 0) {
    return '#6B7280'
  }
  const total = swatches.reduce<RGB>(
    (acc, swatch) => [acc[0] + swatch.rgb[0], acc[1] + swatch.rgb[1], acc[2] + swatch.rgb[2]],
    [0, 0, 0],
  )
  return rgbToHex(total.map((channel) => channel / swatches.length) as RGB)
}

export const paletteDistance = (a: PaletteSwatch[], b: PaletteSwatch[]) => {
  const count = Math.min(a.length, b.length)
  if (count === 0) {
    return 0
  }
  const total = Array.from({ length: count }, (_, index) =>
    colorDistance(a[index].rgb, b[index].rgb),
  ).reduce((sum, value) => sum + value, 0)
  return Math.round(total / count)
}

export const closestSwatchDistance = (swatches: PaletteSwatch[], target: RGB) =>
  Math.min(...swatches.map((swatch) => colorDistance(swatch.rgb, target)))
