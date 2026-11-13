// 全球新闻AI简报 · 数据层。
//   $DSH_HOME/news-brief/
//   ├── settings.json        api_key / api_base(测试用)
//   ├── briefs/index.json    简报索引（新→旧；同关键词+日期覆盖）
//   └── briefs/<bid>/
//       ├── intel.json       fetchAll() 完整结果（标准化条目）
//       ├── analysis.json    agent 四大板块分析（事件/解读/平台对比）
//       ├── meta.json        关键词/统计
//       └── report.html      交互式 HTML 报告
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'news-brief')
const BRIEFS_DIR = join(DATA_DIR, 'briefs')
const INDEX_FILE = join(BRIEFS_DIR, 'index.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const nowIso = () => new Date().toISOString()

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(BRIEFS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

export function getSettings() {
  return readJson(SETTINGS_FILE, {}) || {}
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch, updated_at: nowIso() }
  writeJson(SETTINGS_FILE, next)
  return next
}

function briefDir(bid) {
  const safe = String(bid).replace(/[^\p{L}\p{N}_-]+/gu, '')
  if (!safe || safe !== String(bid)) throw new Error('非法简报 id')
  const dir = join(BRIEFS_DIR, safe)
  if (normalize(dir) !== normalize(join(BRIEFS_DIR, safe))) throw new Error('非法简报 id')
  return dir
}

function getBriefIndex() {
  return readJson(INDEX_FILE, []) || []
}

export function saveBrief(intel) {
  const date = new Date().toISOString().slice(0, 10)
  const prev = getBriefIndex().find((i) => i.keyword === intel.keyword && i.date === date)
  const ts = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const bid = prev ? prev.brief_id : `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${String(ts.getMilliseconds()).padStart(3, '0')}-${String(intel.keyword).replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 16) || 'kw'}-${date}`
  const dir = briefDir(bid)
  mkdirSync(dir, { recursive: true })
  writeJson(join(dir, 'intel.json'), { ...intel, brief_id: bid, date })
  const meta = {
    brief_id: bid,
    keyword: intel.keyword,
    date,
    platform_count: intel.platformCount,
    total_items: intel.totalItems,
    total_engagement: intel.totalEngagement,
    failed_count: (intel.failedPlatforms || []).length,
    has_analysis: existsSync(join(dir, 'analysis.json')),
    created_at: nowIso(),
  }
  writeJson(join(dir, 'meta.json'), meta)
  const index = getBriefIndex().filter((i) => i.brief_id !== bid)
  index.unshift({ brief_id: bid, keyword: intel.keyword, date, total_items: meta.total_items, created_at: meta.created_at })
  writeJson(INDEX_FILE, index.slice(0, 100))
  return meta
}

// 面板入口靠 has_report 决定「打开报告 / 生成报告」：报告文件存在即算已生成
function withReport(meta) {
  if (!meta) return meta
  return { ...meta, has_report: existsSync(join(briefDir(meta.brief_id), 'report.html')) }
}

export function getBriefMeta(bid) {
  return withReport(readJson(join(briefDir(bid), 'meta.json')))
}

export function getIntel(bid) {
  return readJson(join(briefDir(bid), 'intel.json'))
}

export function getAnalysis(bid) {
  return readJson(join(briefDir(bid), 'analysis.json'))
}

export function saveAnalysis(bid, analysis) {
  const dir = briefDir(bid)
  writeJson(join(dir, 'analysis.json'), analysis)
  const meta = getBriefMeta(bid)
  if (meta) {
    writeJson(join(dir, 'meta.json'), { ...meta, has_analysis: true, updated_at: nowIso() })
  }
  return analysis
}

export function listBriefs({ limit = 50 } = {}) {
  return getBriefIndex().slice(0, limit).map(withReport)
}

export function saveReportHtml(bid, html) {
  const dir = briefDir(bid)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'report.html')
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, html, 'utf8')
  renameSync(tmp, file)
  return file
}

export function readReportHtml(bid) {
  const file = join(briefDir(bid), 'report.html')
  return existsSync(file) ? file : null
}

export function deleteBrief(bid) {
  const dir = briefDir(bid)
  if (!existsSync(dir)) return { ok: false, error: `简报不存在: ${bid}` }
  rmSync(dir, { recursive: true, force: true })
  writeJson(INDEX_FILE, getBriefIndex().filter((i) => i.brief_id !== bid))
  return { ok: true }
}
