import test from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { GET } from '../src/app/api/auth/demo-credentials/route'

const fixture = { NODE_ENV: 'development', ENABLE_DEMO_CREDENTIAL_AUTOFILL: 'true', PROVISION_ADMIN_EMAIL: 'demo@example.test', PROVISION_ADMIN_PASSWORD: 'fixture-password', ADMIN_EMAIL: '', ADMIN_PASSWORD: '' }
async function withConfig(values: Partial<typeof fixture>, run: () => Promise<void>) {
  const before = Object.fromEntries(Object.keys(fixture).map(key => [key, process.env[key]]))
  Object.assign(process.env, fixture, values)
  try { await run() } finally {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('autofill status never contains credentials; explicit local request can fill them', async () => {
  await withConfig({}, async () => {
    const status = await GET(new NextRequest('http://localhost:30940/api/auth/demo-credentials?status=1'))
    assert.deepEqual(await status.json(), { enabled: true })
    const response = await GET(new NextRequest('http://localhost:30940/api/auth/demo-credentials'))
    assert.deepEqual(await response.json(), { enabled: true, email: fixture.PROVISION_ADMIN_EMAIL, password: fixture.PROVISION_ADMIN_PASSWORD })
    assert.match(response.headers.get('cache-control')!, /no-store/)
  })
})

test('production, disabled and nonlocal requests never disclose credentials', async () => {
  for (const [config, host] of [[{ NODE_ENV: 'production' }, 'localhost'], [{ ENABLE_DEMO_CREDENTIAL_AUTOFILL: 'false' }, 'localhost'], [{}, 'public.example']] as const) {
    await withConfig(config, async () => {
      const response = await GET(new NextRequest(`http://${host}/api/auth/demo-credentials`))
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { enabled: false })
    })
  }
})

test('missing configured credentials disable autofill', async () => {
  await withConfig({ PROVISION_ADMIN_PASSWORD: '' }, async () => {
    assert.deepEqual(await (await GET(new NextRequest('http://localhost/api/auth/demo-credentials'))).json(), { enabled: false })
  })
})

test('foreign-origin requests never disclose local credentials', async () => {
 await withConfig({}, async () => {
  const response=await GET(new NextRequest('http://localhost/api/auth/demo-credentials',{headers:{origin:'https://foreign.example'}}))
  assert.deepEqual(await response.json(), {enabled:false})
 })
})
