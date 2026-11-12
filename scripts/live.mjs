// 真实网络冒烟：默认 11 平台并行搜索（约 10-30 秒），打印平台状态并生成报告。
//   DSH_HOME=<目录> node scripts/live.mjs [keyword] [platforms] [ak_xxx]
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , kwArg, platArg, keyArg] = process.argv
const keyword = kwArg || 'AI大模型'
const platforms = platArg || undefined
const home = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE, '.dsh')

if (keyArg) {
  mkdirSync(join(home, 'news-brief'), { recursive: true })
  writeFileSync(join(home, 'news-brief', 'settings.json'), JSON.stringify({ api_key: keyArg }, null, 2))
  console.log('API key 已写入 settings.json')
}
const { getSettings } = await import('../lib/store.js')
if (!getSettings().api_key && !process.env.REDFOX_API_KEY) {
  console.error('缺少 RedFox API Key：node scripts/live.mjs <keyword> <platforms> ak_xxx')
  process.exit(1)
}

const { newsBriefTool } = await import('../src/host.js')
const call = (args) => newsBriefTool.execute(args, {})

console.log(`真实搜索：「${keyword}」 ${platforms || '全部 11 平台'}`)
const t0 = Date.now()
const r = await call({ action: 'search', keyword, platforms })
console.log(`\n[${Math.round((Date.now() - t0) / 1000)}s] ${r.summary}`)
if (r.data) console.log('\n' + r.data)

if (r.ok) {
  const bid = r.summary.match(/briefId=([\p{L}\p{N}-]+)/u)?.[1]
  const rep = await call({ action: 'report', briefId: bid })
  console.log(`\n${rep.summary}\n${rep.data || ''}`)
}
