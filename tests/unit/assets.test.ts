import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, statSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

type DecodedPng = { width: number; height: number; data: Buffer }
const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(input: Buffer): DecodedPng } }
}

const root = new URL('../../', import.meta.url)
const bundlePath = new URL('design/source/boa_design_bundle.html', root)
const outputPath = new URL('public/assets/boa-logo.png', root)

function bundleLogo() {
  const html = readFileSync(bundlePath, 'utf8')
  const startTag = '<script type="__bundler/manifest">'
  const start = html.indexOf(startTag)
  expect(start, 'design manifest is present').toBeGreaterThanOrEqual(0)
  const jsonStart = html.indexOf('>', start) + 1
  const jsonEnd = html.indexOf('</script>', jsonStart)
  const manifest = JSON.parse(html.slice(jsonStart, jsonEnd).trim()) as Record<
    string,
    { compressed: boolean; data: string; mime: string }
  >
  const entry = manifest['07e53085-c5b9-4695-acf2-acce2a7ec1b7']
  if (!entry || entry.mime !== 'image/png') throw new Error('logo is missing from design manifest')
  const bytes = Buffer.from(entry.data, 'base64')
  return entry.compressed ? gunzipSync(bytes) : bytes
}

describe('extracted logo asset', () => {
  it('is smaller while preserving the design source pixels exactly', () => {
    execFileSync(process.execPath, ['scripts/extract-assets.mjs'], {
      cwd: new URL('../..', import.meta.url),
      stdio: 'ignore',
    })

    const sourceBytes = bundleLogo()
    const source = PNG.sync.read(sourceBytes)
    const output = PNG.sync.read(readFileSync(outputPath))

    expect(output.width).toBe(source.width)
    expect(output.height).toBe(source.height)
    expect(output.data).toEqual(source.data)
    expect(statSync(outputPath).size).toBeLessThan(sourceBytes.length)
  }, 30_000) // re-extracts the bundle: ~7 s on a slow CI/cloud box, over vitest's 5 s default
})
