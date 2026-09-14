import { NextResponse, type NextRequest } from 'next/server'

function contentSecurityPolicy(nonce: string) {
  const developmentEval = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
  return [
    "script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' 'wasm-unsafe-eval'" + developmentEval,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
  ].join('; ')
}

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const policy = contentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', policy)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', policy)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
