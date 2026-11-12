// 全球 AI 新闻简报 HTML 生成：复用上游 assets/report-template.html，占位符填充。
// 板块一/二的分析字段（事件概述/时间线/话题/摘要/舆情/大V/平台对比）由 agent 按技能撰写后传入，
// 板块三柱状图与板块四 Tab/数据卡由数据自动生成（Tab 按平台互动量降序，条目保持原始顺序）。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLATFORMS } from './platforms.js'

const TEMPLATE_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'report-template.html')

const esc = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmtInt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '0')

// 数据时间范围（上游口径：30 天主体窗口 + 历史旧闻标注）
export function computeDataTimeRange(items, now = new Date()) {
  const times = []
  const relativeRe = /(\d+)\s+(day|week|month)s?\s+ago/i
  for (const it of items || []) {
    let t = String(it.publishTime || '')
    if (!t) continue
    const rel = t.match(relativeRe)
    if (rel) {
      const n = Number(rel[1])
      const unitMs = { day: 86400e3, week: 7 * 86400e3, month: 30 * 86400e3 }[rel[2].toLowerCase()]
      t = new Date(now.getTime() - n * unitMs).toISOString().slice(0, 10)
    } else {
      // X 的 "Wed Oct 23 12:00:00 +0000 2024" 兜底 Date 解析
      const d = new Date(t.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(t) ? t : t.replace(/(\+\d{4})\s+(\d{4})$/, '$2 $1').replace(/\+/g, ' '))
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) t = d.toISOString().slice(0, 10)
      else continue
    }
    times.push(t.slice(0, 10))
  }
  if (!times.length) return { short: '—', long: '数据未标注时间' }
  const sorted = [...times].sort()
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  const windowStart = new Date(now.getTime() - 30 * 86400e3).toISOString().slice(0, 10)
  const inWindow = times.filter((t) => t >= windowStart).length
  const pct = Math.round((inWindow / times.length) * 100)
  let long
  if (pct >= 90) long = `主体近30天数据（${windowStart} ~ ${max}），含少量历史旧闻，最早 ${min}`
  else long = `时间跨度较大（${min} ~ ${max}），仅 ${pct}% 条目在近30天窗口内`
  return { short: `${min} ~ ${max}`, long }
}

const platformEngagement = (r) => r.items.reduce((n, i) => n + (Number(i.likes) || 0) + (Number(i.comments) || 0) + (Number(i.shares) || 0) + (Number(i.views) || 0), 0)

// 无封面平台判定：平台内全部条目 coverUrl 为空
const hasCover = (r) => r.items.some((i) => i.coverUrl)

/**
 * 生成完整 HTML。
 * @param intel fetchAll() 结果
 * @param analysis agent 撰写的分析（eventSummary, timeline[], topics[], coreSummary, keyFindings[],
 *                 sentiment {pos,neu,neg,consensus,controversy}, kols[], platformInsights {平台名:{sentiment,focus,viewpoint}, highlights}）
 * @param opts { templateHtml }
 */
export function generateBriefHtml(intel, analysis = {}, opts = {}) {
  let template = opts.templateHtml
  if (!template) {
    try { template = readFileSync(TEMPLATE_PATH, 'utf8') } catch { throw new Error('模板文件缺失：assets/report-template.html') }
  }

  const allItems = Object.values(intel.results || {}).flatMap((r) => r.items)
  const range = computeDataTimeRange(allItems)

  // ── 时间线（倒序，无日期排最后）───────────────────────────────────────
  const timeline = (analysis.timeline || [])
    .map((t) => ({ ...t, _hasDate: Boolean(String(t.time || '').trim()) }))
    .sort((a, b) => (b._hasDate - a._hasDate) || String(b.time || '').localeCompare(String(a.time || '')))
  const timelineHtml = timeline.map((t) => `
    <div class="timeline-item">
      <div class="time">${esc(t.time || '时间待考')}</div>
      <div class="desc">${esc(t.desc)}</div>
      <div class="source">${esc(t.sourcePlatform || '')}${t.sourceAuthor ? ` · ${esc(t.sourceAuthor)}` : ''}</div>
    </div>`).join('') || '<div class="timeline-item"><div class="desc">暂无时间线数据</div></div>'

  // ── 热点话题 ──────────────────────────────────────────────────────────
  const tagsHtml = (analysis.topics || []).map((t) =>
    `<span class="tag">${esc(t.name)} (${t.platforms || '?'}平台)</span>`).join('')
  const topicsHtml = (analysis.topics || []).map((t) => `
    <div class="topic-card">
      <div class="tname">${esc(t.name)} <span class="tcount">${esc(t.platforms || '?')}平台</span></div>
      <ul>${(t.items || []).map((it) => `<li>${esc(it)}</li>`).join('')}</ul>
    </div>`).join('')

  // ── 关键发现 / 舆情 ──────────────────────────────────────────────────
  const findingsHtml = (analysis.keyFindings || []).map((f) => `<div class="insight">${esc(f)}</div>`).join('')
  const sent = analysis.sentiment || {}
  const pos = Math.max(0, Math.min(100, Number(sent.pos) || 0))
  const neu = Math.max(0, Math.min(100, Number(sent.neu) || 0))
  const neg = Math.max(0, 100 - pos - neu)

  // ── 大V观点 ──────────────────────────────────────────────────────────
  const kolHtml = (analysis.kols || []).map((k) => `
    <div class="kol-card">
      <div class="kol-avatar-ph">${esc((k.name || '?').slice(0, 1))}</div>
      <div>
        <div class="name">${k.url ? `<a href="${esc(k.url)}" target="_blank" rel="noreferrer">${esc(k.name)}</a>` : esc(k.name)}</div>
        <div class="meta">${esc(k.platform || '')}${k.followers ? ` · ${fmtInt(k.followers)} 粉丝` : ''}</div>
        <div class="meta">${esc(k.viewpoint || '')}</div>
      </div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:13px">暂无符合条件的 KOL 数据</p>'

  // ── 板块三：对比矩阵 + 柱状图（按互动量降序）─────────────────────────
  const platformRows = Object.entries(intel.results || {})
    .map(([key, r]) => ({ key, r, eng: platformEngagement(r) }))
    .sort((a, b) => b.eng - a.eng)
  const insightOf = (name) => (analysis.platformInsights || {})[name] || {}
  const matrixHtml = platformRows.map(({ key, r, eng }) => {
    const ins = insightOf(r.platform)
    return `
      <tr>
        <td>${esc(r.platform)}</td><td>${r.count}</td><td>${fmtInt(eng)}</td>
        <td>${esc(ins.sentiment || '—')}</td><td>${esc(ins.focus || '—')}</td><td>${esc(ins.viewpoint || '—')}</td>
      </tr>`
  }).join('') || '<tr><td colspan="6">暂无数据</td></tr>'

  const maxEng = Math.max(...platformRows.map((p) => p.eng), 1)
  const barHtml = platformRows.map(({ key, r, eng }) => `
    <div class="bar-row">
      <span class="bar-label">${esc(r.platform)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((eng / maxEng) * 100)}%">${((eng / maxEng) * 100).toFixed(0)}%</div></div>
      <span class="bar-value">${fmtInt(eng)}</span>
    </div>`).join('')

  const highlightsHtml = (analysis.highlights || []).map((h) => `<div class="insight">${esc(h)}</div>`).join('')

  // ── 板块四：Tab（按平台互动降序）+ 内容卡 ────────────────────────────
  const tabButtons = platformRows.map(({ key, r }, i) =>
    `<div class="tab${i === 0 ? ' active' : ''}" onclick="switchTab(this, 'tab-${esc(key)}')">${esc(r.platform)} (${r.count})</div>`).join('')
  const tabContents = platformRows.map(({ key, r }, i) => {
    const withCover = hasCover(r)
    const cards = r.items.map((item) => {
      const cover = withCover
        ? (item.coverUrl
          ? `<img src="${esc(item.coverUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.removeAttribute('src')">`
          : '<div style="height:180px;background:#fff"></div>')
        : ''
      const metric = (v, icon) => `<span>${icon} ${v === null || v === undefined ? '—' : fmtInt(v)}</span>`
      return `
        <div class="content-card">
          ${cover}
          <div class="body">
            <div class="title">${esc(item.title || item.content || '无标题').slice(0, 120)}</div>
            <div class="author">${esc(item.author || '—')} · ${esc(item.publishTime || '—')}</div>
            <div class="metrics">
              ${metric(item.likes, '&#128077;')}${metric(item.comments, '&#128172;')}${metric(item.shares, '&#128257;')}${metric(item.views, '&#128065;')}
            </div>
            ${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noreferrer">查看原文 &rarr;</a>` : ''}
          </div>
        </div>`
    }).join('')
    return `
    <div class="tab-content${i === 0 ? ' active' : ''}" id="tab-${esc(key)}">
      <div class="content-grid">${cards}</div>
    </div>`
  }).join('')

  const mostActive = platformRows[0]?.r.platform || '—'

  // 模板示例行处理：每个占位符注释后面的示例 DOM 一次替换到位
  // （用「注释起点 → 下一个 HTML 结构边界」的整体替换，失败即保留注释便于排查）
  let t = template
    // 时间线：注释起到 timeline div 收口前
    .replace(/<!-- \{\{TIMELINE_ITEMS\}\} -->[\s\S]*?\n  <\/div>/, timelineHtml)
    // 热点话题标签云
    .replace(/<!-- \{\{TOPIC_TAGS\}\} -->[\s\S]*?\n  <\/div>/, tagsHtml || '<span class="tag">暂无话题</span>')
    // 热点话题详情卡（示例卡片到 topic-list 收口前）
    .replace(/<!-- \{\{TOPIC_DETAILS\}\}[\s\S]*?\n  <\/div>/, topicsHtml || '<div class="topic-card"><div class="tname">暂无话题数据</div></div>')
    // 关键发现
    .replace(/<!-- \{\{KEY_FINDINGS\}\} -->[\s\S]*?<div class="insight">\{\{FINDING_TEXT\}\}<\/div>/, findingsHtml || '<div class="insight">暂无关键发现</div>')
    // 大V观点（示例 kol-card 到 kol-grid 收口前）
    .replace(/<!-- \{\{KOL_ITEMS\}\} -->[\s\S]*?\n  <\/div>/, kolHtml)
    // 对比矩阵（示例 tr 到 tbody 收口前）
    .replace(/<!-- \{\{PLATFORM_COMPARISON_ROWS\}\} -->[\s\S]*?\n    <\/tbody>/, matrixHtml)
    // 柱状图（示例 bar-row 到 bar-chart 收口前）
    .replace(/<!-- \{\{BAR_CHART_ROWS\}\} -->[\s\S]*?\n  <\/div>/, barHtml)
    // Tab 按钮
    .replace(/<!-- \{\{TAB_BUTTONS\}\} -->[\s\S]*?(?=\n  <\/div>)/, tabButtons)
    // Tab 内容（示例 tab-content 到 section 收口前）
    .replace(/<!-- \{\{TAB_CONTENTS\}\}[\s\S]*?\n  <\/div>\n<\/div>/, tabContents)
    // 差异亮点
    .replace(/<!-- \{\{PLATFORM_DIFF_HIGHLIGHTS\}\}[^>]*-->/g, highlightsHtml)
    // 兜底清理可能残留的示例占位符
    .replace(/\{\{TIME\}\}|\{\{DESCRIPTION\}\}|\{\{SOURCE_PLATFORM\}\}|\{\{SOURCE_AUTHOR\}\}/g, '')
    .replace(/<div class="timeline-item">[\s\S]*?<\/div>\s*(?=<\/div>\s*<\/div>\s*<\/section>)/, '')

  return t
    .replace(/\{\{KEYWORD\}\}/g, esc(intel.keyword || ''))
    .replace(/\{\{PLATFORM_COUNT\}\}/g, String(intel.platformCount ?? 0))
    .replace(/\{\{TOTAL_ITEMS\}\}/g, String(intel.totalItems ?? 0))
    .replace(/\{\{TOTAL_ENGAGEMENT\}\}/g, fmtInt(intel.totalEngagement ?? 0))
    .replace(/\{\{MOST_ACTIVE_PLATFORM\}\}/g, esc(mostActive))
    .replace(/\{\{DATA_TIME_RANGE_SHORT\}\}/g, esc(range.short))
    .replace(/\{\{DATA_TIME_RANGE\}\}/g, esc(range.long))
    .replace(/\{\{EVENT_SUMMARY\}\}/g, esc(analysis.eventSummary || '待分析'))
    .replace(/\{\{CORE_SUMMARY\}\}/g, esc(analysis.coreSummary || '待分析'))
    .replace(/\{\{POSITIVE_PCT\}\}/g, String(pos))
    .replace(/\{\{NEUTRAL_PCT\}\}/g, String(neu))
    .replace(/\{\{NEGATIVE_PCT\}\}/g, String(neg))
    .replace(/\{\{CONSENSUS_POINTS\}\}/g, esc(sent.consensus || '待分析'))
    .replace(/\{\{CONTROVERSY_POINTS\}\}/g, esc(sent.controversy || '待分析'))
    .replace(/\{\{GENERATED_AT\}\}/g, esc(intel.generatedAt || ''))
    // 残留占位符兜底清空
    .replace(/\{\{[A-Z_]+\}\}/g, '')
}

// 终端/对话用平台状态汇总
export function renderPlatformsSummary(intel) {
  const lines = [`关键词「${intel.keyword}」· ${intel.platformCount} 个平台成功 · ${intel.totalItems} 条内容 · 总互动 ${fmtInt(intel.totalEngagement)}`]
  for (const [key, r] of Object.entries(intel.results || {})) {
    const eng = platformEngagement(r)
    lines.push(`  ✓ ${r.platform}: ${r.count} 条 · 互动 ${fmtInt(eng)}`)
  }
  for (const f of intel.failedPlatforms || []) {
    lines.push(`  ✗ ${f.platform}: ${String(f.error).slice(0, 60)}`)
  }
  lines.push('')
  lines.push('互动量口径：点赞 + 评论 + 分享 + 播放（接口不返回播放量的平台按 0 计）')
  return lines.join('\n')
}
