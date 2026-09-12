import { redirect } from 'next/navigation'
import QRCode from 'qrcode'
import { resolvePasses } from '@/app/api/desk/passes/route'
import { PassesScreen, type RenderedPass } from './passes-screen'
import { QR_DARK, QR_LIGHT, QR_SCHEME } from '@/lib/design'
import { DeskChrome } from '../desk-chrome'

export const dynamic = 'force-dynamic'

export default async function PassesPage() {
  const result = await resolvePasses()
  if (!result.ok && result.status === 401) redirect('/desk/login')
  if (!result.ok) {
    return (
      <DeskChrome>
        <p className="d-pad-sec" style={{ color: 'var(--bad,#FF6B5A)' }}>Unable to load passes.</p>
      </DeskChrome>
    )
  }

  const passes: RenderedPass[] = await Promise.all(result.passes.map(async (pass) => ({
    ...pass,
    qrSvg: await QRCode.toString(`${QR_SCHEME}${pass.passToken}`, {
      type: 'svg',
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: QR_DARK, light: QR_LIGHT },
    }),
  })))

  return (
    <DeskChrome>
      <PassesScreen passes={passes} />
    </DeskChrome>
  )
}
