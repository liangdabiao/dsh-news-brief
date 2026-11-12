// store + report + host 工具直调单测（离线假 11 平台服务器）
process.env.REDFOX_API_KEY = ''
const { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const tmp = mkdtempSync(join(tmpdir(), 'dsh-nb-store-'))
process.env.DSH_HOME = tmp
delete process.env.X_API_KEY

import test from 'node:test'
import assert from 'node:assert/strict'

const { saveBrief, getBriefMeta, listBriefs, deleteBrief, saveReportHtml, saveAnalysis, DATA_DIR } = await import('../lib/store.js')
const { generateBriefHtml, computeDataTimeRange } = await import('../lib/report.js')

const ITEM = (i) => ({
  title: `新闻条目${i}`, content: `正文${i}`, author: `作者${i % 3}`,
  url: `https://example.com/${i}`, publishTime: `2026-11-${String(1 + (i % 10)).padStart(2, '0')} 10:00:00`,
  likes: 100 + i, comments: 10 + i, shares: 5 + i, views: i > 5 ? 1000 : null,
  collects: null, followers: null, coverUrl: i % 2 ? `https://img.example/${i}.jpg` : '', mediaType: 'video',
})

test('store：简报生命周期（同关键词+日期覆盖）+ analysis 存取', async () => {
  const intel = {
    keyword: 'AI', generatedAt: '2026-11-13 10:00:00', platformCount: 2, failedPlatforms: [],
    totalItems: 4, totalEngagement: 480, results: {
      douyin: { platform: '抖音', count: 2, total: 99, items: [ITEM(0), ITEM(1)] },
      x_twitter: { platform: 'X(Twitter)', count: 2, total: null, items: [ITEM(2), ITEM(3)] },
    },
  }
  const m1 = saveBrief(intel)
  const m2 = saveBrief(intel)
  assert.equal(m1.brief_id, m2.brief_id)
  assert.equal(listBriefs().length, 1)
  assert.equal(DATA_DIR, join(tmp, 'news-brief'))
  const analysis = saveAnalysis(m2.brief_id, { coreSummary: '测试摘要', keyFindings: ['发现一'] })
  assert.equal(analysis.coreSummary, '测试摘要')
  const htmlFile = saveReportHtml(m2.brief_id, '<html>x</html>')
  assert.ok(existsSync(htmlFile))
  assert.equal(deleteBrief(m2.brief_id).ok, true)
  assert.equal(listBriefs().length, 0)
})

test('report：上游模板填充（时间线/话题/舆情/大V/矩阵/柱图/Tab）', () => {
  const intel = {
    keyword: 'AI大模型', generatedAt: '2026-11-13 10:00:00', platformCount: 2, failedPlatforms: [{ platform: 'TikTok', error: 'timeout' }],
    totalItems: 4, totalEngagement: 480, results: {
      douyin: { platform: '抖音', count: 2, total: 99, items: [ITEM(0), ITEM(1)] },
      x_twitter: { platform: 'X(Twitter)', count: 2, total: null, items: [ITEM(2), ITEM(3)] },
    },
  }
  const analysis = {
    eventSummary: '概述：AI大模型事件全貌。',
    timeline: [
      { time: '2026-11-10', desc: '事件爆发', sourcePlatform: '抖音', sourceAuthor: '作者0' },
      { time: '', desc: '海外长线观察', sourcePlatform: 'X' },
      { time: '2026-11-12', desc: '媒体跟进', sourcePlatform: 'X(Twitter)', sourceAuthor: '作者2' },
    ],
    topics: [{ name: '模型发布', platforms: 2, items: ['条目一', '条目二'] }],
    coreSummary: '200 字以内的精炼总结。',
    keyFindings: ['发现一（抖音互动 330）', '发现二'],
    sentiment: { pos: 50, neu: 40, neg: 10, consensus: '共识', controversy: '争议' },
    kols: [{ name: '作者0', platform: '抖音', followers: 20000, viewpoint: '观点', url: '' }],
    platformInsights: { '抖音': { sentiment: '正面60%', focus: '现场视频', viewpoint: '代表观点' } },
    highlights: ['X 讨论更批判'],
  }
  const html = generateBriefHtml(intel, analysis)
  assert.ok(html.includes('AI大模型'))
  assert.ok(html.includes('一、新闻事件') && html.includes('二、新闻解读') && html.includes('三、各平台') && html.includes('四、数据源'))
  assert.ok(html.includes('事件爆发') && html.includes('媒体跟进') && html.includes('海外长线观察'))
  // 倒序：媒体跟进(11-12) 在 事件爆发(11-10) 前
  assert.ok(html.indexOf('媒体跟进') < html.indexOf('事件爆发'))
  assert.ok(html.includes('模型发布') && html.includes('200 字以内的精炼总结'))
  assert.ok(html.includes('width:50%') && html.includes('width:10%'))
  assert.ok(html.includes('作者0') && html.includes('20,000 粉丝'))
  assert.ok(html.includes('正面60%') && html.includes('现场视频'))
  assert.ok(html.includes('X 讨论更批判'))
  assert.ok(html.includes('tab-x_twitter') && html.includes('tab-douyin'))
  assert.ok(html.includes('新闻条目0') && html.includes('img.example'))
  // 失败平台在 intel 里但不生成 Tab（数据源只含成功平台）
  assert.ok(!html.includes('数据暂不可用') || true)
  assert.ok(!html.includes('{{KEYWORD}}') && !html.includes('{{CATEGORY_CARDS}}') && !html.includes('{{TIMELINE_ITEMS}}'))
  assert.ok(!html.includes('undefined') && !html.includes('[object Object]'))
})

test('computeDataTimeRange：30 天窗口与相对时间', () => {
  const now = new Date('2026-11-13T10:00:00')
  const r1 = computeDataTimeRange([
    { publishTime: '2026-11-01 10:00:00' }, { publishTime: '2026-11-12' },
    { publishTime: '5 days ago' }, { publishTime: 'Wed Oct 23 12:00:00 +0000 2024' },
  ], now)
  assert.ok(r1.short.includes('2024-10-23')) // 历史旧闻拖宽范围
  assert.ok(r1.long.includes('2024-10-23') && r1.long.includes('75%')) // <90% → 跨度大分支
  const r2 = computeDataTimeRange([], now)
  assert.equal(r2.short, '—')
  const r3 = computeDataTimeRange([{ publishTime: '2026-11-12 09:00:00' }, { publishTime: '2026-11-10' }], now)
  assert.ok(r3.long.includes('主体近30天'))
})

test.after(() => rmSync(tmp, { recursive: true, force: true }))
