// 冒烟测试（离线）：假 RedFox 11 平台服务器 + 工具直调全链路 + 面板 API 全路由。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const http = await import('node:http')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-nb-smoke-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY
delete process.env.X_API_KEY

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

const ITEM = (i) => ({
  title: `新闻条目${i}`, content: `正文${i}`, author: `作者${i % 3}`,
  url: `https://example.com/${i}`, publishTime: `2026-11-${String(1 + (i % 10)).padStart(2, '0')} 10:00:00`,
  likes: 100 + i, comments: 10 + i, shares: 5 + i, views: i % 2 ? 1000 : null,
  collects: null, followers: null, coverUrl: i % 2 ? `https://img.example/${i}.jpg` : '', mediaType: 'video',
})

// 假服务器：douyin 3 条 / x_twitter 1 条 / tiktok 模拟网络错误 / 其他平台空
const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.headers['x-api-key'] !== 'ak_smoke') return reply({ code: 3201, msg: '积分不足' })
    const kw = String(JSON.parse(body || '{}').keyword || '')
    if (kw === '无结果词') return reply({ code: 2000, data: { list: [] } })
    if (req.url.includes('/dy/')) return reply({ code: 2000, data: { list: [ITEM(0), ITEM(1), ITEM(4)], total: 3 } })
    if (req.url.includes('/x/')) return reply({ code: 2000, data: { tweets: [{ ...ITEM(2), text: '推文内容', user: { username: 'u2', displayName: '作者2', followers: 50000 }, tweetId: '99', createdAt: '2026-11-12' }] } })
    reply({ code: 2000, data: { list: [] } })
  })
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
mkdirSync(join(tmp, 'news-brief'), { recursive: true })
writeFileSync(join(tmp, 'news-brief', 'settings.json'), JSON.stringify({ api_key: 'ak_smoke', api_base: `http://127.0.0.1:${srv.address().port}` }))

// ── 工具直调 ──
const { newsBriefTool } = await import('../src/host.js')
const call = async (args) => {
  try { return await newsBriefTool.execute(args, {}) } catch (e) { return { ok: false, summary: String(e?.message || e) } }
}
let bid
{
  const r = await call({ action: 'search', keyword: 'AI大模型', platforms: 'douyin,x_twitter' })
  check('search 入库', r.ok && r.summary.includes('briefId='), r.summary.slice(0, 50))
  check('search 平台状态含成功与口径', r.data.includes('抖音: 3 条') && r.data.includes('互动量口径'), '')
  check('search hints 四板块', r.hints.includes('四大板块') && r.hints.includes('analysisJson'), '')
  bid = r.summary.match(/briefId=([\p{L}\p{N}-]+)/u)?.[1]
}
{
  const r = await call({ action: 'items', platform: 'x_twitter' })
  check('items 平台过滤', r.ok && r.data.includes('[X(Twitter)]') && r.data.includes('推文内容') && r.data.includes('x.com/u2/status/99'), '')
}
{
  const analysis = {
    eventSummary: '概述', timeline: [{ time: '2026-11-12', desc: '爆发', sourcePlatform: '抖音', sourceAuthor: '作者0' }],
    topics: [{ name: 'T1', platforms: 2, items: ['a', 'b'] }],
    coreSummary: '摘要内容', keyFindings: ['发现一'], sentiment: { pos: 60, neu: 30, neg: 10, consensus: '共识', controversy: '争议' },
    kols: [{ name: '作者2', platform: 'X(Twitter)', followers: 50000, viewpoint: '大V观点', url: 'https://x.com/u2' }],
    platformInsights: { '抖音': { sentiment: '正面70%', focus: '现场', viewpoint: '代表' } },
    highlights: ['差异亮点'],
  }
  const r = await call({ action: 'report', briefId: bid, analysisJson: JSON.stringify(analysis) })
  check('report 生成+标注', r.ok && r.data.includes('数据时间范围') && r.data.includes('互动量口径') && r.data.includes('报告文件'), `data=${r.data?.slice(0, 150)}`)
  const file = r.summary.match(/：(.+?\.html)/)?.[1]
  const html = file ? readFileSync(file, 'utf8') : ''
  check('HTML 四大板块', ['一、新闻事件', '二、新闻解读', '三、各平台', '四、数据源'].every((s) => html.includes(s)), '')
  check('HTML 分析注入', html.includes('摘要内容') && html.includes('爆发') && html.includes('T1') && html.includes('共识'), '')
  check('HTML 舆情条', html.includes('width:60%') && html.includes('正面 60%'), '')
  check('HTML 大V卡', html.includes('作者2') && html.includes('50,000 粉丝') && html.includes('x.com/u2'), '')
  check('HTML 对比矩阵+柱图', html.includes('正面70%') && html.includes('bar-fill'), '')
  check('HTML Tab 数据卡', html.includes('tab-douyin') && html.includes('tab-x_twitter') && html.includes('正文0') && html.includes('推文内容'), `${html.includes('正文0')}/${html.includes('推文内容')}`)
  check('HTML 无占位符/泄漏', !html.includes('{{KEYWORD}}') && !html.includes('{{TIMELINE_ITEMS}}') && !html.includes('undefined'), '')
}
{
  const r = await call({ action: 'search', keyword: '无结果词' })
  check('全空拦截', !r.ok && r.summary.includes('均无'), r.summary.slice(0, 50))
  const r2 = await call({ action: 'history' })
  check('history 单条', r2.ok && r2.data.split('\n').length === 1, r2.data.split('\n')[0] || '')
}

// ── 面板 API ──
const { registerApi } = await import('../lib/api.js')
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { config: {} })
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/news-brief${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x', origin: 'http://x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => { origEnd(...args); resolve({ status: resObj.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null } })() }) }
  })
  const p = routes['/news-brief'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const cat = await req('GET', '/api/catalog')
  check('catalog：11 平台/key/简报', cat.status === 200 && cat.json.platforms.length === 11 && cat.json.has_key && cat.json.briefs.length >= 1, '')
  const one = await req('GET', `/api/briefs/${bid}`)
  check('brief 详情含 intel+time_range', one.status === 200 && one.json.intel?.results?.douyin?.count === 3 && one.json.time_range?.short, '')
  const created = await req('POST', '/api/briefs', { keyword: '面板直搜', platforms: ['douyin', 'kuaishou'] })
  check('面板直搜', created.status === 200 && created.json.ok && created.json.brief.total_items === 3, `n=${created.json?.brief?.total_items}`)
  const analysisOk = await req('POST', `/api/briefs/${bid}/analysis`, { coreSummary: '面板回写', keyFindings: [] })
  check('analysis 回写', analysisOk.status === 200 && analysisOk.json.ok, '')
  const rawRep = await req('POST', `/api/briefs/${bid}/report`)
  check('面板直出报告', rawRep.status === 200 && rawRep.json.ok, '')
  const del = await req('DELETE', `/api/briefs/${created.json.brief.brief_id}`)
  check('面板删简报', del.status === 200 && del.json.ok, '')
}
{
  const st = await req('GET', '/api/settings')
  check('settings 尾号', st.status === 200 && st.json.settings.key_tail === '_smoke', String(st.json.settings.key_tail))
  const bad = await req('POST', '/api/settings', { api_key: 'no-prefix' })
  check('settings 非 ak_ 拒绝', bad.status === 400, '')
}
{
  const idx = readFileSync(new URL('../lab/index.html', import.meta.url), 'utf8')
  check('lab 引用 scheme/app', idx.includes('app.js') && idx.includes('scheme.js'), '')
  const appjs = readFileSync(new URL('../lab/app.js', import.meta.url), 'utf8')
  check('lab 消息类型与 client 对齐', appjs.includes('news-brief:refresh') && appjs.includes('news-brief:start-ok'), '')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 消息类型一致', client.includes('news-brief:refresh') && client.includes('news-brief:start-ok'), '')
  check('上游模板在 assets/', existsSync(new URL('../assets/report-template.html', import.meta.url)), '')
  check('api-reference 在技能', existsSync(new URL('../skills/global-ai-news-brief/references/api-reference.md', import.meta.url)), '')
}

srv.close()
rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
