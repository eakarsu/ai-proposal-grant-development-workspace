import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store, private' }
  const provisioned = process.env.PROVISION_ADMIN_EMAIL && process.env.PROVISION_ADMIN_PASSWORD
  const email = provisioned ? process.env.PROVISION_ADMIN_EMAIL : process.env.ADMIN_EMAIL
  const password = provisioned ? process.env.PROVISION_ADMIN_PASSWORD : process.env.ADMIN_PASSWORD
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  const requestOrigin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin
  const enabled = process.env.NODE_ENV !== 'production'
    && process.env.ENABLE_DEMO_CREDENTIAL_AUTOFILL === 'true'
    && ['localhost', '127.0.0.1', '[::1]'].includes(request.nextUrl.hostname)
    && (!origin || origin === requestOrigin)
    && Boolean(email && password)

  if (!enabled || request.nextUrl.searchParams.get('status') === '1') {
    return NextResponse.json({ enabled }, { headers })
  }

  return NextResponse.json(
    { enabled: true, email, password },
    { headers },
  )
}
