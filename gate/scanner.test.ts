import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanFrame } from './scanner'

const mockedPrepare = vi.fn(async () => undefined)
const mockedRead = vi.fn(async () => [{ text: 'BOA26:wasm-token' }])

vi.mock('zxing-wasm/reader', () => ({
  prepareZXingModule: mockedPrepare,
  readBarcodes: mockedRead,
}))

const originalDetector = (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
const originalCreateImageBitmap = globalThis.createImageBitmap

afterEach(() => {
  vi.restoreAllMocks()
  mockedPrepare.mockClear()
  mockedRead.mockClear()
  if (originalDetector === undefined) {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
  } else {
    ;(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = originalDetector
  }
  globalThis.createImageBitmap = originalCreateImageBitmap
})

describe('scanFrame', () => {
  it('uses BarcodeDetector when the browser provides it', async () => {
    const close = vi.fn()
    const detect = vi.fn(async () => [{ rawValue: 'BOA26:native-token' }])
    const detector = vi.fn(function () {
      return { detect }
    })
    ;(globalThis as { BarcodeDetector?: unknown }).BarcodeDetector = detector
    globalThis.createImageBitmap = vi.fn(async () => ({ close })) as unknown as typeof createImageBitmap

    await expect(scanFrame(new Blob())).resolves.toBe('BOA26:native-token')
    expect(detector).toHaveBeenCalledWith({ formats: ['qr_code'] })
    expect(detect).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    expect(mockedRead).not.toHaveBeenCalled()
  })

  it('uses the locally served WASM fallback when native detection is absent', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    const frame = new Blob()

    await expect(scanFrame(frame)).resolves.toBe('BOA26:wasm-token')
    expect(mockedPrepare).toHaveBeenCalledWith({
      fireImmediately: true,
      overrides: { locateFile: expect.any(Function) },
    })
    expect(mockedRead).toHaveBeenCalledWith(frame, {
      formats: ['QRCode'],
      tryHarder: true,
      maxNumberOfSymbols: 1,
    })
  })

  it('returns null when the fallback finds no barcode', async () => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
    mockedRead.mockResolvedValueOnce([])

    await expect(scanFrame(new Blob())).resolves.toBeNull()
  })
})
