// 全球新闻AI简报 · Host 半边（news_brief 原生工具 + 技能提供方 + 四大板块注入 + 面板数据面）。
// 搜索/标准化/模板填充是纯数据操作由工具完成；四大板块分析由会话模型按技能撰写（analysisJson 注入模板）。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { fetchAll, PLATFORM_KEYS, DOMESTIC_KEYS, resolveApiKey, resolveApiBase } from '../lib/platforms.js'
import { generateBriefHtml, renderPlatformsSummary, computeDataTimeRange } from '../lib/report.js'
import { saveBrief, getBriefMeta, getIntel, getAnalysis, saveAnalysis, listBriefs, deleteBrief, saveReportHtml, readReportHtml, getSettings } from '../lib/store.js'

export const name = 'news-brief' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入新闻简报工作流到系统提示'),
  apiKey: Schema.string().default('').description('RedFox API Key（ak_ 开头；留空读面板设置或环境变量 REDFOX_API_KEY）'),
  proxyUrl: Schema.string().default('').description('HTTP(S) 代理（访问 redfox.hk 与海外平台用），留空直连'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：平台状态/条目明细' },
      hints: { type: 'string', description: '可选：四板块撰写要求' },
    },
  },
  render: (_args, value) => text([value.summary, value.data, value.hints].filter(Boolean).join('\n\n')),
}

const result = (ok, summary, data = '', hints = '') => ({ ok, summary, data, hints })

const MAX_TEXT = 56000
const PER_ITEM = 160

function parsePlatforms(input) {
  if (!input) return null
  const lower = String(input).trim().toLowerCase()
  if (lower === 'domestic' || lower === '国内') return DOMESTIC_KEYS
  const keys = lower.split(/[,，\s]+/).filter(Boolean)
  const bad = keys.filter((k) => !PLATFORM_KEYS.includes(k))
  if (bad.length) throw new Error(`未知平台：${bad.join(',')}（可选：${PLATFORM_KEYS.join(',')}，或 domestic=国内 7 平台）`)
  return keys.length ? keys : null
}

function resolveBrief(bid) {
  if (bid) {
    const meta = getBriefMeta(bid)
    if (!meta) throw new Error(`简报不存在：${bid}。用 history 查看。`)
    return meta
  }
  const [latest] = listBriefs({ limit: 1 })
  if (!latest) throw new Error('还没有简报。先 search。')
  return getBriefMeta(latest.brief_id)
}

// 条目 → 模型可读紧凑行
function renderItem(platform, it) {
  const nums = [`👍${it.likes ?? '—'}`, `💬${it.comments ?? '—'}`, `🔄${it.shares ?? '—'}`, `👁${it.views ?? '—'}`].join(' ')
  const title = String(it.title || it.content || '无标题').slice(0, 80)
  return `[${platform}] ${title} ｜ ${it.author || '-'} ｜ ${it.publishTime || '-'} ｜ ${nums}${it.url ? ` ｜ ${it.url}` : ''}`
}

// ---------------------------------------------------------------------------
// 工具：news_brief —— search / items / report / history
// ---------------------------------------------------------------------------
export const newsBriefTool = {
  name: 'news_brief',
  description:
    '全球新闻AI简报：一个关键词并行搜索 11 大平台（抖音/小红书/公众号/B站/快手/视频号/头条/TikTok/Instagram/X/YouTube），' +
    '跨平台聚合标准化后，由你按四大板块撰写情报报告（新闻事件/新闻解读/各平台解读倾向/数据源），工具生成交互式 HTML。' +
    '流程：search 并行采集（同步约 10-30 秒，失败平台自动跳过）→ 按技能撰写分析 → report 注入模板生成 HTML。' +
    '需要 RedFox API Key。海外平台（TikTok/Instagram/X/YouTube）在无代理网络下可能失败，失败不影响其余平台。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('search 并行搜索；items 补读条目；report 生成 HTML；history 历史', {
        enum: ['search', 'items', 'report', 'history'],
      }),
      keyword: str('search：搜索关键词（含"达人/博主/KOL/网红/账号"等后缀会由你剥离核心语义后再搜）'),
      platforms: str('search：平台逗号分隔（默认全部 11 平台；domestic=国内 7 平台）'),
      briefId: str('items/report/history 定位简报；缺省=最新'),
      platform: str('items：只读某平台条目（platform key 如 douyin/x_twitter）'),
      limit: str('items：最多返回条数，默认 40'),
      analysisJson: str('report：四大板块分析 JSON（eventSummary/timeline/topics/coreSummary/keyFindings/sentiment/kols/platformInsights/highlights）'),
    },
  },
  output: OUTPUT,
  async execute(args, ctxConfig) {
    check(args, this.parameters)
    const cfg = ctxConfig || {}

    // ── search ───────────────────────────────────────────────────────────
    if (args.action === 'search') {
      if (!args.keyword || !String(args.keyword).trim()) throw new Error('search 需要 keyword。')
      const keyword = String(args.keyword).trim()
      const platforms = parsePlatforms(args.platforms)
      const settings = getSettings()
      const apiKey = resolveApiKey({ settings, config: cfg })
      if (!apiKey) {
        return result(false, '未配置 RedFox API Key。请用户到面板「全球新闻AI简报 → 设置」填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
      }
      const intel = await fetchAll({
        keyword, platforms, apiKey, apiBase: resolveApiBase({ settings }),
      })
      if (intel.totalItems === 0) {
        const failedNote = intel.failedPlatforms.length ? `；失败 ${intel.failedPlatforms.length} 个平台：${intel.failedPlatforms.map((f) => f.platform).join('、')}` : ''
        return result(false,
          `全部平台均无「${keyword}」的搜索结果${failedNote}。如实告知用户（可能关键词太生僻或平台收录有限），建议换更通用的关键词。`,
          renderPlatformsSummary(intel))
      }
      const meta = saveBrief(intel)
      const summary = renderPlatformsSummary(intel)
      const hints = [
        `下一步：按 global-ai-news-brief 技能撰写四大板块分析（基于全部 ${intel.totalItems} 条），然后 report(action="report", briefId="${meta.brief_id}", analysisJson=…) 生成 HTML。`,
        'analysisJson 字段：eventSummary（3-5 句）/ timeline[{time,desc,sourcePlatform,sourceAuthor}]（倒序，无日期排最后）/ topics[{name,platforms,items[2-3条]}]（3-8 个）/ coreSummary（≤200字）/ keyFindings[3-5条]/ sentiment{pos,neu,neg,consensus,controversy}/ kols[{name,platform,followers,viewpoint,url}]（粉丝>1w 或互动 TOP）/ platformInsights{平台名:{sentiment,focus,viewpoint}}/ highlights[差异亮点]。',
        '每条结论都要有数据支撑（标注平台与互动量）；大V主页链接按平台规则拼；失败平台标注「数据暂不可用」。',
      ].join('\n')
      return result(true,
        `简报已入库（briefId=${meta.brief_id}）。${intel.failedPlatforms.length ? `⚠ ${intel.failedPlatforms.length} 个平台失败（${intel.failedPlatforms.map((f) => f.platform).join('、')}），报告中会标注。` : '全部平台采集成功。'}`,
        summary.slice(0, MAX_TEXT), hints)
    }

    // ── items ────────────────────────────────────────────────────────────
    if (args.action === 'items') {
      const meta = resolveBrief(args.briefId)
      const intel = getIntel(meta.brief_id)
      let pool = []
      const platformLabel = []
      for (const [key, r] of Object.entries(intel.results || {})) {
        if (args.platform && key !== args.platform) continue
        platformLabel.push(r.platform)
        pool.push(...r.items)
      }
      if (!pool.length) return result(false, `没有条目${args.platform ? `（平台 ${args.platform}）` : ''}。`)
      const limit = Math.min(Number(args.limit) || 40, 220)
      const chunks = []
      let size = 0
      for (const it of pool.slice(0, limit)) {
        const line = renderItem(platformLabel[0] || '', it)
        if (size + line.length > MAX_TEXT && chunks.length) break
        chunks.push(line)
        size += line.length
      }
      return result(true,
        `「${meta.keyword}」${meta.date} 简报条目（${args.platform ? platformLabel.join('/') : '全部平台'}，前 ${chunks.length}/${pool.length} 条）。`,
        chunks.join('\n').slice(0, MAX_TEXT))
    }

    // ── report ───────────────────────────────────────────────────────────
    if (args.action === 'report') {
      const meta = resolveBrief(args.briefId)
      const intel = getIntel(meta.brief_id)
      let analysis = {}
      if (args.analysisJson) {
        try {
          analysis = JSON.parse(args.analysisJson)
        } catch {
          throw new Error('analysisJson 不是合法 JSON。字段结构见 search 返回的 hints。')
        }
        saveAnalysis(meta.brief_id, analysis)
      } else {
        analysis = getAnalysis(meta.brief_id) || {}
      }
      const html = generateBriefHtml(intel, analysis)
      const file = saveReportHtml(meta.brief_id, html)
      const allItems = Object.values(intel.results || {}).flatMap((r) => r.items)
      const range = computeDataTimeRange(allItems)
      return result(true,
        `HTML 报告已生成${analysis.eventSummary ? '（四大板块已填充）' : '（纯数据版，板块一/二待分析）'}：${file}。` +
        '桌面端 WebContentsView 会 deny window.open/target=_blank，报告只能在面板内查看——' +
        '告诉用户点侧栏「全球新闻AI简报」→「报告」页（或该简报页）的「打开 HTML 报告」，不要把磁盘路径当成可点开的入口。',
        [
          `数据时间范围: ${range.short}（${range.long}）`,
          `互动量口径: 点赞 + 评论 + 分享 + 播放（无播放数据按 0 计）`,
          `平台统计: ${Object.entries(intel.results || {}).map(([k, r]) => `${r.platform} ${r.count} 条`).join(' / ')}`,
          `报告文件: ${file}`,
          `面板入口: 侧栏「全球新闻AI简报」→「报告」→「打开报告」`,
        ].join('\n'))
    }

    // ── history ──────────────────────────────────────────────────────────
    if (args.action === 'history') {
      const list = listBriefs({ limit: 20 })
      if (!list.length) return result(false, '还没有简报。先 search。')
      const lines = list.map((r) => `${r.brief_id}｜「${r.keyword}」${r.date}｜${r.total_items} 条`)
      return result(true, `共 ${list.length} 份简报（新→旧）。对旧简报补分析/HTML 传 briefId。`, lines.join('\n'))
    }

    throw new Error(`未知 action：${args.action}`)
  },
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  const toolWithConfig = { ...newsBriefTool, execute(args) { return newsBriefTool.execute(args, config) } }

  ctx.effect(() => ctx.tools.register(toolWithConfig), `${name}: tool`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx, { config }), `${name}: routes`)
}
