import QRCode from 'qrcode'
import { QR_DARK, QR_LIGHT, QR_SCHEME } from './design'

/**
 * The pass QR as an SVG string: the one set of options for the holder's page
 * (server) and the desk's pass sheet (browser). The browser build of qrcode
 * uses the same SVG renderer, so both draw the identical code.
 *
 * The desk imports this with `import()` when a pass sheet opens, so the
 * library and the drawing cost one pass, not the whole roster (7 Oct: the
 * Passes list used to draw a QR for every approved person on every load).
 */
export function passQrSvg(passToken: string): Promise<string> {
  return QRCode.toString(`${QR_SCHEME}${passToken}`, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: QR_DARK, light: QR_LIGHT },
  })
}
