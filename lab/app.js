// 全球 AI 新闻简报 · 面板逻辑：概览（关键词查询+平台勾选+历史）/ 简报页（平台状态+条目+HTML）/ 设置。
// 四大板块分析走 agent 对话；面板直连 API 搜索/看简报/生成纯数据版报告。
(() => {
  const $app = document.getElementById('app')
  const $toast = document.getElementById('toast')
  const EMBEDDED = (() => { try { return window.parent !== window } catch { return false } })()

  const state = { catalog: null }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '0')

  const PLAT_NAMES = {
    douyin: '抖音', xiaohongshu: '小红书', wechat_gzh: '公众号', bilibili: 'B站', kuaishou: '快手',
    shipinhao: '视频号', toutiao: '今日头条', tiktok: 'TikTok', instagram: 'Instagram', x_twitter: 'X(Twitter)', youtube: 'YouTube',
  }

  async function api(path) {
    const res = await fetch(`/news-brief${path}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      throw err
    }
    return body
  }
  async function apiPost(path, payload) {
    const res = await fetch(`/news-brief${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }
  async function apiDelete(path) {
    const res = await fetch(`/news-brief${path}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }

  let toastTimer = null
  function toast(msg, isErr) {
    $toast.textContent = msg
    $toast.className = `toast show${isErr ? ' err' : ''}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { $toast.className = 'toast' }, 2600)
  }
  function copyFallback(prompt, reason) {
    navigator.clipboard?.writeText(prompt).then(
      () => toast(`${reason}，草稿已复制到剪贴板——请粘贴到 dsh 对话`, true),
      () => toast(`${reason}，复制也失败了`, true))
  }

  const ICONS = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    ext: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    back: '<path d="M14 6l-6 6 6 6"/>',
    play: '<path d="M8 5l11 7-11 7V5z"/>',
  }
  const ic = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`

  async function loadCatalog() {
    state.catalog = await api('/api/catalog')
    renderRailFoot()
    return state.catalog
  }
  function renderRailFoot() {
    const c = state.catalog
    if (!c) return
    const latest = (c.briefs || [])[0]
    document.getElementById('rail-foot').innerHTML =
      `<div class="v-head">NEWS BRIEF v${esc(c.version)}</div>` +
      `<div class="v-row"><span>API Key</span><span>${c.has_key ? '已配置' : '未配置'}</span></div>` +
      `<div class="v-row"><span>平台</span><span>${(c.platforms || []).length}</span></div>` +
      `<div class="v-row"><span>最近话题</span><span>${esc(latest ? `「${latest.keyword}」` : '—')}</span></div>`
  }

  function sendAgentPrompt(prompt, okMsg = '已在宿主开新对话——agent 处理中') {
    if (!EMBEDDED) {
      navigator.clipboard?.writeText(prompt).then(
        () => toast('草稿已复制——粘贴到 dsh 对话即可开始'),
        () => copyFallback(prompt, '复制失败'))
      return
    }
    let done = false
    const cleanup = () => { done = true; clearTimeout(timer); removeEventListener('message', onMsg) }
    const onMsg = (e) => {
      if (e.origin !== location.origin) return
      if (e.data?.type === 'news-brief:start-ok') { if (!done) { cleanup(); toast(okMsg) } }
      else if (e.data?.type === 'news-brief:start-failed') { if (!done) { cleanup(); toast(`没能开新对话：${e.data.message || ''}`, true) } }
    }
    const timer = setTimeout(() => { if (!done) { cleanup(); copyFallback(prompt, '未收到宿主确认') } }, 1500)
    addEventListener('message', onMsg)
    parent.postMessage({ type: 'news-brief:refresh', prompt }, location.origin)
  }

  // ---------- 视图：概览 ----------
  function viewHome() {
    const c = state.catalog
    const briefs = c.briefs || []
    const platChecks = (c.platforms || []).map((p) =>
      `<label><input type="checkbox" name="pf" value="${esc(p)}" checked>${esc(PLAT_NAMES[p] || p)}</label>`).join('')
    return `
      <header class="head">
        <span class="eyebrow">GLOBAL NEWS BRIEF</span>
        <div class="head-row">
          <h1>全球 AI 新闻<strong>简报</strong></h1>
        </div>
        <p>一个关键词并行搜索 11 大平台（抖音/小红书/公众号/B站/快手/视频号/头条/TikTok/Instagram/X/YouTube），跨平台聚合后 agent 按四大板块生成情报报告。RedFox API Key ${c.has_key ? '已配置' : '未配置——去「设置」页填写'}。</p>
      </header>
      ${!c.has_key ? `<div class="empty" style="margin-bottom:var(--sp-6);padding:var(--sp-4) var(--sp-5);text-align:left"><div class="e-title">🔑 还没有配置 RedFox API Key</div><p>到<a href="#/settings">「设置」</a>页填写（ak_ 开头，<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">红狐 hub 获取 ↗</a>）。海外平台（TikTok/Instagram/X/YouTube）无代理网络可能失败，失败不影响其余平台。</p></div>` : ''}
      <section class="sec" style="margin-top:0">
        <div class="sec-head"><span class="num">01</span><h2>全网搜索</h2></div>
        <div class="form" style="max-width:860px">
          <div class="field"><label>KEYWORD · 搜索关键词</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="f-kw" placeholder="如：新能源汽车、AI大模型、台风" style="flex:1;min-width:220px">
              <button class="btn accent" id="f-search">${ic('play')}并行搜索</button>
              <button class="btn ghost" data-newflow>${ic('spark')}去对话出情报报告</button>
            </div>
            <div class="hint">同步约 10-30 秒（11 平台并发）。海外平台无代理可能失败，失败自动跳过不影响其他平台。</div>
          </div>
          <div class="field"><label>PLATFORMS · 平台（取消勾选可缩小范围）</label>
            <div class="checks">${platChecks}</div></div>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><span class="num">02</span><h2>简报历史</h2></div>
        ${briefs.length ? `<div class="cards">${briefs.map((r) => `
          <a class="card" href="#/b/${encodeURIComponent(r.brief_id)}">
            <div class="c-top">
              <div class="c-title">「${esc(r.keyword)}」</div>
              <span class="chip done">${r.total_items} 条</span>
            </div>
            <div class="c-sub">数据日期 ${esc(r.date)}</div>
            <div class="c-foot"><span>${esc(String(r.created_at).slice(0, 16).replace('T', ' '))}</span></div>
          </a>`).join('')}</div>`
        : `<div class="empty"><div class="e-title">还没有简报</div><p>输入关键词点「并行搜索」；或「去对话出情报报告」让 agent 按四大板块做完整舆情分析。</p></div>`}
      </section>`
  }

  // ---------- 视图：简报 ----------
  function viewBrief(id) {
    return `<div id="b-view" data-bid="${esc(id)}"><div class="loading">LOADING…</div></div>`
  }

  async function renderBrief(id) {
    const holder = document.getElementById('b-view')
    let data
    try {
      data = await api(`/api/briefs/${encodeURIComponent(id)}`)
    } catch (e) {
      const netDown = !e.status
      holder.innerHTML = `<a class="back" href="#/">${ic('back')} 概览</a><div class="empty"><div class="e-title">${netDown ? '面板服务连接失败' : '简报不存在'}</div><p>${netDown ? '开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs 5184' : esc(e.message)}</p></div>`
      return
    }
    const meta = data.brief
    const intel = data.intel
    const analysis = data.analysis
    const range = data.time_range || {}

    const platformRows = Object.entries(intel.results || {})
      .map(([key, r]) => ({ key, r, eng: r.items.reduce((n, i) => n + (Number(i.likes) || 0) + (Number(i.comments) || 0) + (Number(i.shares) || 0) + (Number(i.views) || 0), 0) }))
      .sort((a, b) => b.eng - a.eng)
    const maxEng = Math.max(...platformRows.map((p) => p.eng), 1)

    const pfLines = platformRows.map(({ r, eng }) => `
      <div class="pf-line">
        <span class="pf-ok">✓</span><span>${esc(r.platform)}</span><span class="pf-eng">${r.count} 条 · 互动 ${fmt(eng)}</span>
      </div>`).join('')
      + (intel.failedPlatforms || []).map((f) => `
      <div class="pf-line"><span class="pf-bad">✗</span><span>${esc(f.platform)}</span><span class="pf-eng" style="color:var(--miss)">${esc(String(f.error).slice(0, 50))}</span></div>`).join('')

    const bars = platformRows.map(({ r, eng }) => `
      <div class="pb"><span class="pb-name">${esc(r.platform)}</span>
        <div class="pb-track"><div class="pb-fill" style="width:${Math.round((eng / maxEng) * 100)}%"></div></div>
        <span class="pb-val">${fmt(eng)}</span></div>`).join('')

    const tl = (analysis?.timeline || []).slice(0, 8).map((t) => `
      <div class="tl-item"><span class="tl-time">${esc(t.time || '—')}</span><span>${esc(t.desc || '')}</span></div>`).join('')

    const sent = analysis?.sentiment || {}
    const pos = Math.max(0, Math.min(100, Number(sent.pos) || 0))
    const neu = Math.max(0, Math.min(100, Number(sent.neu) || 0))
    const neg = Math.max(0, 100 - pos - neu)
    const sentimentBar = (analysis?.sentiment) ? `
      <div style="display:flex;height:20px;border-radius:10px;overflow:hidden;font-size:11px;color:#fff;font-weight:600;margin-top:var(--sp-3)">
        <div style="width:${pos}%;background:#16a34a;display:flex;align-items:center;justify-content:center">正面 ${pos}%</div>
        <div style="width:${neu}%;background:#9ca3af;display:flex;align-items:center;justify-content:center">中性 ${neu}%</div>
        <div style="width:${neg}%;background:#dc2626;display:flex;align-items:center;justify-content:center">负面 ${neg}%</div>
      </div>` : ''

    const findings = (analysis?.keyFindings || []).map((f) => `<div class="sum-item"><span class="d-no">▪</span><span>${esc(f)}</span></div>`).join('')

    const reportBtn = meta.has_report !== false
      ? `<a class="btn accent" href="/news-brief/api/briefs/${encodeURIComponent(id)}/report" target="_blank" rel="noreferrer">${ic('ext')}打开 HTML 报告</a>`
      : `<button class="btn accent" id="b-report">${ic('play')}生成纯数据版报告</button>`

    holder.innerHTML = `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <div class="detail-head">
        <div>
          <h1>「${esc(meta.keyword)}」</h1>
          <div class="c-sub" style="margin-top:4px">${meta.platform_count} 平台 · ${meta.total_items} 条 · 总互动 ${fmt(meta.total_engagement)} · 数据时间 ${esc(range.short || '—')}</div>
        </div>
        <div class="actions">
          ${reportBtn}
          <button class="btn ghost" data-analyze="${esc(id)}">${ic('spark')}去对话写四大板块</button>
          <button class="btn ghost" data-del-brief="${esc(id)}" title="删除简报">${ic('trash')}</button>
        </div>
      </div>
      <div class="block">
        <div class="block-head"><h3>平台采集状态</h3><span class="mono">互动量 = 点赞+评论+分享+播放</span></div>
        <div class="block-body">${pfLines}</div>
      </div>
      <div class="block">
        <div class="block-head"><h3>各平台互动量对比</h3></div>
        <div class="block-body"><div class="plat-bars">${bars}</div></div>
      </div>
      ${analysis ? `
      <div class="block">
        <div class="block-head"><h3>📊 核心摘要（agent 撰写）</h3></div>
        <div class="block-body">
          <p style="font-size:13px;line-height:1.7">${esc(analysis.coreSummary || '—')}</p>
          ${sentimentBar}
          ${findings ? `<div class="sum-list" style="margin-top:var(--sp-4)">${findings}</div>` : ''}
        </div>
      </div>
      ${tl ? `<div class="block"><div class="block-head"><h3>🕐 关键事件时间线</h3></div><div class="block-body"><div class="tl-mini">${tl}</div></div></div>` : ''}`
      : '<div class="empty"><div class="e-title">📝 还没有四大板块分析</div><p>点「去对话写四大板块」——agent 按新闻事件/新闻解读/平台倾向/数据源规范撰写后自动注入 HTML。</p></div>'}`
    bindBrief(id, meta, analysis)
  }

  function bindBrief(id, meta, analysis) {
    const reportBtn = document.getElementById('b-report')
    if (reportBtn) reportBtn.onclick = async () => {
      reportBtn.disabled = true
      try {
        await apiPost(`/api/briefs/${encodeURIComponent(id)}/report`)
        toast('纯数据版报告已生成')
        window.open(`/news-brief/api/briefs/${encodeURIComponent(id)}/report`, '_blank')
      } catch (e) { toast(e.message, true) }
      reportBtn.disabled = false
    }
    const del = document.querySelector('[data-del-brief]')
    if (del) del.onclick = async () => {
      if (!confirm('删除这份简报？')) return
      try { await apiDelete(`/api/briefs/${encodeURIComponent(id)}`); toast('已删除'); location.hash = '#/' } catch (e) { toast(e.message, true) }
    }
    const analyze = document.querySelector('[data-analyze]')
    if (analyze) analyze.onclick = () => {
      sendAgentPrompt([
        `请对「${meta.keyword}」做全网舆情情报分析（简报 ${meta.brief_id}）：`,
        `1. news_brief(action="items", briefId="${meta.brief_id}", limit=200) 分平台补读全部条目`,
        '2. 按 global-ai-news-brief 技能撰写四大板块：①新闻事件（概述/时间线倒序/热点话题 3-8 个）②新闻解读（核心摘要≤200字/关键发现 3-5 条/舆情风向/大V观点）③各平台解读倾向（对比矩阵）④数据源说明',
        '3. 把分析以 JSON 提交：news_brief(action="report", briefId="' + meta.brief_id + '", analysisJson=…)——字段结构 eventSummary/timeline/topics/coreSummary/keyFindings/sentiment/kols/platformInsights/highlights',
        '4. 报告生成后把数据时间范围、互动口径、平台统计同步输出给我。',
      ].join('\n'), '已在宿主开新对话——agent 分析完回来看报告')
    }
  }

  // ---------- 视图：设置 ----------
  function viewSettings() {
    return `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <header class="head">
        <span class="eyebrow">SETTINGS</span>
        <h1>设<strong>置</strong></h1>
        <p>RedFox API Key 是 11 平台搜索的唯一凭证。这里保存的 Key 优先于环境变量，低于插件配置。</p>
      </header>
      <div class="form">
        <div class="field"><label>API KEY · RedFox API Key（ak_ 开头）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-key" placeholder="ak_…" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-key-save">保存 Key</button>
          </div>
          <div class="hint" id="s-key-hint">…</div>
          <div class="hint">获取：<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">redfox.hk/settings/api-keys ↗</a>。保存在本机 dsh 数据目录，不上传。</div>
        </div>
        <div class="field"><label>PROXY · HTTP(S) 代理（海外平台 TikTok/Instagram/X/YouTube 需要代理时填）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-proxy" placeholder="http://127.0.0.1:7890" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-proxy-save">保存代理</button>
          </div>
        </div>
        <div class="field"><label>API BASE · 接口地址（测试用，默认 https://redfox.hk）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-base" placeholder="https://redfox.hk" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-base-save">保存地址</button>
          </div>
        </div>
      </div>`
  }

  async function bindSettings() {
    try {
      const { settings } = await api('/api/settings')
      const keyHint = document.getElementById('s-key-hint')
      if (keyHint) keyHint.textContent = settings.has_key
        ? `已配置（…${settings.key_tail || '******'}${settings.from_env ? '，其中环境变量可用' : ''}）。重新输入会覆盖。`
        : '未配置。'
      const inp = document.getElementById('s-key')
      if (inp && document.activeElement !== inp) inp.placeholder = settings.has_key ? `已配置（…${settings.key_tail}），输入新值覆盖` : 'ak_…'
      const proxy = document.getElementById('s-proxy')
      if (proxy && document.activeElement !== proxy) proxy.value = settings.proxy_url || ''
      const base = document.getElementById('s-base')
      if (base && document.activeElement !== base) base.value = settings.api_base || ''
    } catch { /* 宿主未就绪 */ }
    const bind = (id, payload) => {
      const btn = document.getElementById(id)
      if (!btn) return
      btn.onclick = async () => {
        try {
          const input = btn.parentElement.querySelector('input')
          await apiPost('/api/settings', payload(input.value.trim()))
          toast('设置已保存')
          loadCatalog().catch(() => {})
        } catch (e) { toast(e.message, true) }
      }
    }
    bind('s-key-save', (v) => ({ api_key: v }))
    bind('s-proxy-save', (v) => ({ proxy_url: v }))
    bind('s-base-save', (v) => ({ api_base: v }))
  }

  // ---------- 渲染辅助 ----------
  function bindCommon() {
    document.querySelectorAll('[data-newflow]').forEach((b) => {
      b.onclick = () => sendAgentPrompt([
        '请做一次全网舆情情报分析（全球 AI 新闻简报）：',
        '1. 我会告诉你话题关键词（含"达人/博主/KOL"等后缀时剥离核心语义）',
        '2. news_brief(action="search", keyword=…) 并行搜索 11 平台（约 10-30 秒，可 domestic 只搜国内）',
        '3. 按 global-ai-news-brief 技能撰写四大板块 → news_brief(action="report", analysisJson=…) 生成 HTML',
        '4. 把数据时间范围、互动口径、平台统计同步输出给我。',
        '现在请先问我想查什么话题。',
      ].join('\n'), '已在宿主开新对话——agent 会先问你想查什么')
    })
    const searchBtn = document.getElementById('f-search')
    if (searchBtn) searchBtn.onclick = async () => {
      const kw = document.getElementById('f-kw').value.trim()
      if (!kw) { toast('先填关键词', true); return }
      const platforms = [...document.querySelectorAll('input[name="pf"]:checked')].map((n) => n.value)
      if (!platforms.length) { toast('至少选一个平台', true); return }
      searchBtn.disabled = true; searchBtn.textContent = '搜索中…'
      try {
        const r = await apiPost('/api/briefs', { keyword: kw, platforms })
        toast(`搜索完成：${r.brief.total_items} 条 / ${r.brief.platform_count} 平台`)
        location.hash = `#/b/${encodeURIComponent(r.brief.brief_id)}`
      } catch (e) { toast(e.message, true) }
      searchBtn.disabled = false; searchBtn.innerHTML = `${ic('play')}并行搜索`
    }
  }

  // ---------- 路由 ----------
  async function render() {
    try { await loadCatalog() } catch {}
    const hash = location.hash || '#/'
    const mb = hash.match(/^#\/b\/(.+)$/)
    const bid = mb ? decodeURIComponent(mb[1]) : null
    document.querySelectorAll('.nav a').forEach((a) => {
      const cur = bid ? '' : hash === '#/' ? 'home' : hash.startsWith('#/settings') ? 'settings' : 'home'
      a.classList.toggle('on', a.dataset.view === cur)
    })
    if (bid && /^[\p{L}\p{N}_-]+$/u.test(bid)) {
      $app.innerHTML = viewBrief(bid)
      bindCommon()
      renderBrief(bid)
      return
    }
    if (hash.startsWith('#/settings')) { $app.innerHTML = viewSettings(); bindCommon(); bindSettings(); return }
    $app.innerHTML = viewHome()
    bindCommon()
  }

  async function boot() {
    try { await loadCatalog() } catch {
      state.catalog = { version: '-', has_key: false, key_source: 'none', platforms: [], briefs: [], settings: {} }
    }
    render().catch(() => {})
  }
  addEventListener('hashchange', render)
  boot()
  setTimeout(() => { if (!state.catalog?.version || state.catalog.version === '-') boot() }, 2500)
})()
