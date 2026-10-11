import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { eventsRouter } from '../src/routes/events.js'
import { checkoutRouter } from '../src/routes/checkout.js'
import { partnerApiRouter } from '../src/routes/partnerApi.js'
import { staffRouter } from '../src/routes/staff.js'
import { adminRouter } from '../src/routes/admin.js'
import { webhooksRouter } from '../src/routes/webhooks.js'

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'head' | 'trace'
type Operation = { responses?: Record<string, unknown>; security?: Record<string, string[]>[]; parameters?: { name: string; in: string; required?: boolean }[] }
type OpenApiDocument = {
  openapi: string
  servers: { url: string }[]
  paths: Record<string, Partial<Record<HttpMethod, Operation>>>
}

const methods: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']
const documentNames = ['client', 'admin', 'partner', 'ticketing'] as const

async function loadDocument(name: typeof documentNames[number]): Promise<OpenApiDocument> {
  const path = fileURLToPath(new URL(`../../docs/ssot/api/swagger/${name}.json`, import.meta.url))
  return JSON.parse(await readFile(path, 'utf8')) as OpenApiDocument
}

function runtimeOperations(router: { stack: { route?: { path: string | string[]; methods: Record<string, boolean> } }[] }, prefix: string) {
  return router.stack.flatMap(layer => {
    if (!layer.route) return []
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]
    return paths.flatMap(path => Object.keys(layer.route!.methods).map(method => {
      const suffix = path.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '')
      const fullPath = `${prefix}${suffix}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}').replace(/\/$/, '')
        .replace('/partners/{partnerId}/admin/partners/{partnerId}', '/partners/{scopePartnerId}/admin/partners/{partnerId}')
      return [method.toLowerCase() as HttpMethod, fullPath] as const
    }))
  })
}

function liveTicketingOperations() {
  return [
    ['get', '/healthz'], ['get', '/readyz'],
    ...runtimeOperations(eventsRouter, '/api/events'),
    ...runtimeOperations(checkoutRouter, '/api/checkout'),
    ...runtimeOperations(webhooksRouter, '/api/webhooks'),
    ...runtimeOperations(staffRouter, '/api/staff'),
    ...runtimeOperations(adminRouter, '/api/staff/admin'),
    ...runtimeOperations(adminRouter, '/api/staff/partners/{partnerId}/admin'),
    ...runtimeOperations(partnerApiRouter, '/api/v1'),
    ...runtimeOperations(checkoutRouter, '/api/v1/checkout'),
  ] as const
}

test('OpenAPI files use the ticketing API hosts and document responses', async () => {
  for (const name of documentNames) {
    const document = await loadDocument(name)
    assert.equal(document.openapi, '3.1.0', `${name}.json should use OpenAPI 3.1`)
    assert.ok(document.servers.some(server => server.url === 'https://dev-api-eticket.fluxorastudio.id'), `${name}.json should include the development API`)
    assert.ok(document.servers.some(server => server.url === 'https://api-eticket.fluxorastudio.id'), `${name}.json should include the production API`)

    for (const [path, pathItem] of Object.entries(document.paths)) {
      for (const method of methods) {
        const operation = pathItem[method]
        if (!operation) continue
        assert.ok(operation.responses && Object.keys(operation.responses).length > 0, `${name}.json ${method.toUpperCase()} ${path} should document responses`)
      }
    }
  }
})

test('customer, admin, and partner operations appear in the complete ticketing spec', async () => {
  const complete = await loadDocument('ticketing')

  for (const name of ['client', 'admin', 'partner'] as const) {
    const surface = await loadDocument(name)
    for (const [path, pathItem] of Object.entries(surface.paths)) {
      for (const method of methods) {
        if (!pathItem[method]) continue
        assert.ok(complete.paths[path]?.[method], `ticketing.json should include ${name} ${method.toUpperCase()} ${path}`)
      }
    }
  }
})

test('complete ticketing spec documents every live backend route and method', async () => {
  const complete = await loadDocument('ticketing')

  for (const [method, path] of liveTicketingOperations()) {
    const operation = complete.paths[path]?.[method]
    assert.ok(operation, `ticketing.json should document live ${method.toUpperCase()} ${path}`)
    assert.ok(operation.responses && Object.keys(operation.responses).length > 0, `${method.toUpperCase()} ${path} should document responses`)
    const pathParameters = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1])
    for (const name of pathParameters) {
      assert.ok(operation.parameters?.some(parameter => parameter.in === 'path' && parameter.name === name && parameter.required), `${method.toUpperCase()} ${path} should require path parameter ${name}`)
    }
  }
})

test('complete ticketing spec documents authentication for every live route', async () => {
  const complete = await loadDocument('ticketing')

  for (const [method, path] of liveTicketingOperations()) {
    const actual = complete.paths[path]?.[method]?.security ?? []
    const alternatives = actual.map(requirement => Object.keys(requirement).sort().join('+')).sort()
    let expected: string[]

    if (path.startsWith('/api/staff/')) {
      if (/\/auth\/(invitations\/(preview|accept)|login)$/.test(path)) expected = []
      else if (/\/auth\/(session|logout)$/.test(path)) expected = ['', 'staffCookie']
      else expected = ['staffCookie']
    } else if (path.startsWith('/api/v1/')) {
      expected = path.includes('/checkout/orders/{id}') ? ['partnerKey+partnerQuoteToken'] : ['partnerKey']
    } else if (path.startsWith('/api/checkout/')) {
      expected = path.includes('/orders/{id}') ? ['quoteToken'] : []
    } else {
      expected = []
    }

    assert.deepEqual(alternatives, expected, `${method.toUpperCase()} ${path} should document the correct authentication requirements`)
  }
})
