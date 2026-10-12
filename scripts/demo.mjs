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
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
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
  const proxyArgs = process.env.DEMO_PROXY ? ['--proxy', process.env.DEMO_PROXY] : []
  console.log('① 清空演示库…')
  run('npx', ['wrangler', 'd1', 'execute', 'riley-media-log-demo', '--remote', '--file', 'scripts/demo_wipe.sql'], {
    CLOUDFLARE_ENV: 'demo',
  })
  console.log('② 重灌演示数据…')
  run(PY, ['scripts/seed_demo.py', '--base', DEMO_URL, '--token', token, '--allow-remote', ...proxyArgs])
  console.log('③ 批量补全封面与主创（只填空位）…')
  run(PY, ['scripts/backfill.py', '--base', DEMO_URL, '--token', token, '--missing', 'cover_url', '--auto', ...proxyArgs])
  console.log('✅ 演示站重置完成')
} else {
  console.error('用法：node scripts/demo.mjs <deploy|reset>')
  process.exit(1)
}
