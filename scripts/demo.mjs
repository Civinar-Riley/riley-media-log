#!/usr/bin/env node
// 演示站运维工具（跨平台：避免 npm 脚本里的 shell 变量语法在 Windows 的 cmd 下失效）
//
//   node scripts/demo.mjs deploy   构建（CLOUDFLARE_ENV=demo）并部署演示站
//   node scripts/demo.mjs reset    清空演示库 → 重灌演示数据 → 批量补全封面
//
// reset 需要的变量（本地放 .env，CI 走 GitHub Secrets）：
//   DEMO_API_TOKEN  演示站 worker 的 API_TOKEN（seed/backfill 脚本要用）
//   DEMO_PROXY      可选，本机直连被墙时填 http://127.0.0.1:<代理端口>
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const DEMO_URL = process.env.DEMO_URL || 'https://logdemo.civinar.eu.cc'
const PY = process.platform === 'win32' ? 'python' : 'python3'

// 本地 .env 补全变量（CI 上没有这个文件，变量直接来自 secrets）
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

function run(command, args, env = {}) {
  const r = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32', // Windows 上 npm/npx 是 .cmd 包装脚本
    env: { ...process.env, ...env },
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const sub = process.argv[2]

if (sub === 'deploy') {
  run('npm', ['run', 'build'], { CLOUDFLARE_ENV: 'demo' })
  run('npx', ['wrangler', 'deploy', '--env', 'demo'], { CLOUDFLARE_ENV: 'demo' })
} else if (sub === 'reset') {
  const token = process.env.DEMO_API_TOKEN
  if (!token) {
    console.error('缺少 DEMO_API_TOKEN：本地请写进 .env，CI 请配 GitHub Secret')
    process.exit(1)
  }
  const account = process.env.CLOUDFLARE_ACCOUNT_ID
  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  const host = new URL(DEMO_URL).hostname
  if (!host.includes('demo')) {
    console.error(`拒绝执行：DEMO_URL=${DEMO_URL} 看起来不是演示站（hostname 需包含 demo）`)
    process.exit(1)
  }

  // 自定义域可能被 Cloudflare 人机验证拦住（CI 数据中心 IP 常见，403「Just a moment…」），
  // 此时自动改走 workers.dev 域名：worker 开着 workers_dev，且该域名不在自己 zone 上，不受盾规则影响
  async function workersDevBase() {
    if (!account || !cfToken) return null
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/subdomain`, {
        headers: { Authorization: `Bearer ${cfToken}` },
      })
      if (!r.ok) return null
      const { result } = await r.json()
      if (!result?.subdomain) return null
      return `https://riley-media-log-demo.${result.subdomain}.workers.dev`
    } catch {
      return null
    }
  }

  async function preflight(base) {
    try {
      const r = await fetch(`${base}/api/items?page_size=1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return { ok: r.ok, status: r.status, body: r.ok ? '' : await r.text().catch(() => '') }
    } catch (e) {
      // DNS / 连接被重置等网络层失败：返回 status 0，让外层走 workers.dev 兜底而不是整个脚本崩掉
      return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) }
    }
  }

  let base = DEMO_URL
  let check = await preflight(base)
  if (!check.ok) {
    console.log(`预检 ${base} 失败（${check.status}），尝试 workers.dev 域名…`)
    const alt = await workersDevBase()
    if (alt) {
      const altCheck = await preflight(alt)
      if (altCheck.ok) {
        base = alt
        check = altCheck
        console.log(`已改走 ${base}`)
      }
    }
  }
  if (!check.ok) {
    console.error(`预检失败：${check.status} ${check.body.slice(0, 300)}`)
    if (check.status === 403 && check.body.includes('_cf_chl_opt')) {
      console.error(
        '提示：请求被 Cloudflare 人机验证拦截（当前出口 IP 被盾）。' +
          '可到 Cloudflare 控制台给该域加「跳过」安全规则，或设置 DEMO_URL 指向演示站的 workers.dev 地址。'
      )
    }
    process.exit(1)
  }
  const proxyArgs = process.env.DEMO_PROXY ? ['--proxy', process.env.DEMO_PROXY] : []
  console.log('① 清空演示库…')
  run('npx', ['wrangler', 'd1', 'execute', 'riley-media-log-demo', '--remote', '--file', 'scripts/demo_wipe.sql'], {
    CLOUDFLARE_ENV: 'demo',
  })
  console.log('② 重灌演示数据…')
  run(PY, ['scripts/seed_demo.py', '--base', base, '--token', token, '--allow-remote', ...proxyArgs])
  console.log('③ 批量补全封面与主创（只填空位）…')
  run(PY, ['scripts/backfill.py', '--base', base, '--token', token, '--missing', 'cover_url', '--auto', '--allow-remote', ...proxyArgs])
  console.log('✅ 演示站重置完成')
} else {
  console.error('用法：node scripts/demo.mjs <deploy|reset>')
  process.exit(1)
}
