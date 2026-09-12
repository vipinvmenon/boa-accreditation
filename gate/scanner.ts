/**
 * ACC-053 — camera decoding for the offline gate.
 *
 * BarcodeDetector is the fast path on Chromium. iOS Safari does not expose
 * it, so the fallback is zxing-wasm with its binary explicitly served from
 * this app's /gate/ scope. The fallback must never use zxing-wasm's default
 * CDN location: the gate has to keep working with the radio off.
 */

import type { ReadResult } from 'zxing-wasm/reader'

const LOCAL_WASM = '/gate/zxing_reader.wasm'

interface NativeBarcode {
  rawValue?: string
}

interface NativeBarcodeDetector {
  detect(source: ImageBitmap): Promise<NativeBarcode[]>
}

interface NativeBarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector
}

interface BarcodeDetectorGlobal {
  BarcodeDetector?: NativeBarcodeDetectorConstructor
}

function nativeDetector(): NativeBarcodeDetector | undefined {
  const candidate = (globalThis as BarcodeDetectorGlobal).BarcodeDetector
  return candidate === undefined ? undefined : new candidate({ formats: ['qr_code'] })
}

function firstText(results: ReadResult[]): string | undefined {
  return results.find((result) => result.text.length > 0)?.text
}

async function scanWithNative(frame: Blob): Promise<string | undefined> {
  const detector = nativeDetector()
  if (detector === undefined) return undefined

  const bitmap = await createImageBitmap(frame)
  try {
    return (await detector.detect(bitmap)).find((barcode) => barcode.rawValue !== undefined)?.rawValue
  } finally {
    bitmap.close()
  }
}

async function scanWithZxing(frame: Blob): Promise<string | undefined> {
  const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader')
  await prepareZXingModule({
    fireImmediately: true,
    overrides: {
      locateFile: () => LOCAL_WASM,
    },
  })

  const results = await readBarcodes(frame, {
    formats: ['QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 1,
  })
  return firstText(results)
}

/**
 * Decode one camera frame. An undecodable frame is a normal scan miss and
 * returns null; operational failures are thrown so the UI can distinguish a
 * bad frame from a broken camera/WASM setup.
 */
export async function scanFrame(frame: Blob): Promise<string | null> {
  const nativeResult = await scanWithNative(frame)
  if (nativeResult !== undefined) return nativeResult

  const wasmResult = await scanWithZxing(frame)
  return wasmResult ?? null
}
