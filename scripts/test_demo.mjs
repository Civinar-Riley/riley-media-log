// 仅 VM mock：不读取 .env，不启动子进程，不发请求。
// node --experimental-vm-modules scripts/test_demo.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./demo.mjs', import.meta.url), 'utf8')
let cases = 0
async function runCase(mode) {
  const calls = [], requests = []
  let closed = false
  const proxy = 'http://127.0.0.1:9876'
  class ProxyAgent {
    constructor(value) { assert.equal(value, proxy) }
    async close() { closed = true }
  }
  const context = vm.createContext({
    URL, AbortSignal,
    console: { log() {}, error() {} },
    process: {
      platform: 'win32', argv: ['node', 'demo.mjs', 'reset'],
      env: { DEMO_API_TOKEN: 'test-token', CLOUDFLARE_ACCOUNT_ID: 'test-account', CLOUDFLARE_API_TOKEN: 'test-cf-token' },
      exit(code) { throw Object.assign(new Error('exit'), { code }) },
    },
    async fetch(url, options) {
      requests.push(url)
      assert.ok(options.dispatcher instanceof ProxyAgent)
      assert.ok(options.signal)
      if (url.includes('/workers/subdomain')) {
        return { ok: true, json: async () => ({ result: { subdomain: 'test-account' } }) }
      }
      if (url.startsWith('https://custom-demo.example')) {
        if (mode === 'network') throw new Error('network unavailable')
        if (mode === 'shield') return { ok: false, status: 403, text: async () => '_cf_chl_opt' }
      }
      if (mode === 'html') return { ok: true, status: 200, json: async () => { throw new SyntaxError('HTML') } }
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }
    },
  })
  function stub(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context })
  }
  const dependencies = {
    'node:fs': stub({
      existsSync: path => { assert.equal(path, '.env'); return true },
      readFileSync: path => {
        assert.equal(path, '.env')
        return `DEMO_URL=https://custom-demo.example\nDEMO_PROXY=${proxy}\n`
      },
    }),
    'node:child_process': stub({ spawnSync(command, args, options) {
      calls.push({ command, args: Array.from(args), options })
      return { status: 0 }
    } }),
  }
  const entry = new vm.SourceTextModule(source, {
    context,
    async importModuleDynamically(name) {
      assert.equal(name, 'undici')
      const module = stub({ ProxyAgent })
      await module.link(() => { throw new Error('unexpected dependency') })
      await module.evaluate()
      return module
    },
  })
  await entry.link(name => {
    assert.ok(dependencies[name], `unexpected import ${name}`)
    return dependencies[name]
  })
  if (mode === 'html') {
    await assert.rejects(entry.evaluate(), error => error.code === 1)
    assert.equal(calls.length, 0, 'invalid preflight must not wipe')
  } else {
    await entry.evaluate()
    assert.equal(calls.length, 3)
    assert.equal(calls[0].options.env.CLOUDFLARE_ENV, 'demo')
    assert.ok(closed)
    const base = mode === 'success' ? 'https://custom-demo.example' : 'https://riley-media-log-demo.test-account.workers.dev'
    for (const { args } of calls.slice(1)) {
      assert.deepEqual(args.slice(0, 2), ['-X', 'utf8'])
      assert.equal(args[args.indexOf('--base') + 1], base)
      assert.equal(args[args.indexOf('--proxy') + 1], proxy)
      assert.ok(args.includes('--allow-remote'))
    }
    assert.equal(requests.length, mode === 'success' ? 1 : 3)
  }
  cases++
}
for (const mode of ['success', 'shield', 'network', 'html']) await runCase(mode)
console.log(`demo mock: ${cases} cases passed`)
