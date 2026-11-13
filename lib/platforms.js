// 11 大平台定义 + 专属归一化函数。逐行对齐 global-ai-news-brief fetch_all.py 的
// PLATFORMS / norm_* / _ts_to_str / _to_int / _deep_get，字段映射差异全部保留（含各平台缺失字段置 null）。
import http from 'node:http'
import https from 'node:https'

export const HOST_DEFAULT = 'https://redfox.hk'
export const SOURCE = '全球新闻AI简报-dsh'
export const TIMEOUT = 30_000

export const PLATFORMS = {
  douyin: { name: '抖音', path: '/story/api/dy/data/searchWork', body: { keyword: '{kw}', pageNum: 1, pageSize: 20 }, list_key: ['data', 'list'] },
  xiaohongshu: { name: '小红书', path: '/story/api/xhsUser/searchArticle', body: { keyword: '{kw}', offset: 0, sortType: '0' }, list_key: ['data', 'list'] },
  wechat_gzh: { name: '公众号', path: '/story/api/gzh/data/searchArticle', body: { keyword: '{kw}', offset: 0, sortType: '0' }, list_key: ['data', 'list'] },
  bilibili: { name: 'B站', path: '/story/api/bili/data/workSearch', body: { keyword: '{kw}', page: '1', pageSize: 20, order: 'time' }, list_key: ['data', 'workList'] },
  kuaishou: { name: '快手', path: '/story/api/ksAllData/searchWork', body: { keyword: '{kw}', page: 1, size: 20, sort: '综合' }, list_key: ['data', 'list'] },
  shipinhao: { name: '视频号', path: '/story/api/sphAllData/searchWork', body: { keyword: '{kw}', page: 1, size: 20, sort: '综合' }, list_key: ['data', 'list'] },
  toutiao: { name: '今日头条', path: '/story/api/toutiao/searchWork', body: { keyword: '{kw}', offset: '0' }, list_key: ['data'] },
  tiktok: { name: 'TikTok', path: '/story/api/tiktok/ability/searchVideo', body: { keyword: '{kw}', offset: '0', count: '20', sortType: '0', publishTime: '0' }, list_key: ['data'] },
  instagram: { name: 'Instagram', path: '/story/api/ins/search', body: { keyword: '{kw}' }, list_key: ['data', 'items'] },
  x_twitter: { name: 'X(Twitter)', path: '/story/api/x/search', body: { keyword: '{kw}', searchType: 'Top' }, list_key: ['data', 'tweets'] },
  youtube: { name: 'YouTube', path: '/story/api/youtube/searchVideo', body: { searchQuery: '{kw}' }, list_key: ['data', 'videos'] },
}

export const PLATFORM_KEYS = Object.keys(PLATFORMS)
// 国内平台子集（工具 --platforms domestic 映射）
export const DOMESTIC_KEYS = ['douyin', 'xiaohongshu', 'wechat_gzh', 'bilibili', 'kuaishou', 'shipinhao', 'toutiao']

// ── 工具函数（对齐上游）─────────────────────────────────────────────────

export function tsToStr(ts) {
  if (!ts) return ''
  try {
    const d = new Date(Number(ts) * 1000)
    if (Number.isNaN(d.getTime())) return ''
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  } catch {
    return ''
  }
}

export function toInt(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function deepGet(obj, keys) {
  let cur = obj
  for (const k of keys) {
    if (cur && typeof cur === 'object' && k in cur) cur = cur[k]
    else return null
  }
  return cur
}

const s = (v) => String(v ?? '')

// ── 各平台专属归一化（逐行对齐 norm_*）──────────────────────────────────

export const NORMALIZERS = {
  douyin(i) {
    const vt = s(i.videoType)
    return {
      title: s(i.content), content: s(i.content), author: s(i.authorName),
      url: s(i.opusUrl), publishTime: s(i.publishTime),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.shareCount || 0,
      views: null, collects: i.collectCount || 0, followers: null,
      coverUrl: s(i.coverUrl), mediaType: vt === '68' ? 'image' : 'video',
    }
  },
  xiaohongshu(i) {
    return {
      title: s(i.workTitle), content: s(i.workDesc), author: s(i.accountNickname),
      url: s(i.workUrl), publishTime: s(i.workPublishTime),
      likes: i.workLikedCount || 0, comments: i.workCommentsCount || 0, shares: i.workSharedCount || 0,
      views: null, collects: i.workCollectedCount || 0, followers: null,
      coverUrl: s(i.coverUrl), mediaType: s(i.workType).includes('video') ? 'video' : 'image',
    }
  },
  wechat_gzh(i) {
    return {
      title: s(i.title), content: s(i.summary), author: s(i.author),
      url: s(i.workUrl), publishTime: s(i.publishTime),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.shareCount || 0,
      views: i.readCount || 0, collects: i.collectCount || 0, followers: null,
      coverUrl: s(i.coverUrl), mediaType: 'text',
    }
  },
  bilibili(i) {
    const bv = s(i.bvId)
    return {
      title: s(i.title), content: s(i.description), author: s(i.author),
      url: bv ? `https://www.bilibili.com/video/${bv}` : '', publishTime: s(i.created),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.shareCount || 0,
      views: i.playCount || 0, collects: i.favoriteCount || 0, followers: null,
      coverUrl: s(i.picUrl), mediaType: 'video',
    }
  },
  kuaishou(i) {
    const pid = s(i.photoId)
    return {
      title: s(i.caption), content: s(i.caption), author: s(i.nickname),
      url: pid ? `https://www.kuaishou.com/short-video/${pid}` : '', publishTime: s(i.publishTime),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.shareCount || 0,
      views: i.viewCount || 0, collects: i.collectCount || 0, followers: i.authorFans || 0,
      coverUrl: s(i.coverUrl), mediaType: 'video',
    }
  },
  shipinhao(i) {
    return {
      title: s(i.description), content: s(i.description), author: s(i.nickname),
      url: s(i.videoUrl), publishTime: s(i.publishTime),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.forwardCount || 0,
      views: null, collects: i.favCount || 0, followers: null,
      coverUrl: s(i.coverUrl) || s(i.thumbUrl), mediaType: 'video',
    }
  },
  toutiao(i) {
    return {
      title: s(i.title), content: '', author: s(i.nickname),
      url: s(i.opusUrl), publishTime: tsToStr(i.publishTime),
      likes: null, comments: i.commentNum || 0, shares: null,
      views: null, collects: null, followers: null,
      coverUrl: '', mediaType: 'text',
    }
  },
  tiktok(i) {
    const author = i.authorData || {}
    const stats = i.statsData || {}
    const video = i.videoData || {}
    return {
      title: s(i.content), content: s(i.content), author: s(author.userName),
      url: s(i.shareLink), publishTime: tsToStr(i.publishTime),
      likes: stats.likeCount || 0, comments: stats.commentTotal || 0, shares: stats.shareTotal || 0,
      views: stats.viewCount || 0, collects: stats.favoriteCount || 0, followers: author.fansCount || 0,
      coverUrl: s(video.coverImage), mediaType: i.mediaType === 'video' ? 'video' : 'image',
    }
  },
  instagram(i) {
    const code = s(i.code)
    const user = i.user || {}
    return {
      title: s(i.captionText), content: s(i.captionText),
      author: s(user.username) || s(user.fullName),
      url: code ? `https://www.instagram.com/p/${code}/` : '',
      publishTime: s(i.takenAtDate) || tsToStr(i.takenAt),
      likes: i.likeCount || 0, comments: i.commentCount || 0, shares: i.shareCount || 0,
      views: i.playCount || 0, collects: null, followers: user.followerCount || 0,
      coverUrl: s(i.imageUrl) || s(i.thumbnailUrl),
      mediaType: { video: 'video', image: 'image', album: 'image' }[i.mediaFormat] || 'image',
    }
  },
  x_twitter(i) {
    const user = i.user || {}
    const username = s(user.username) || s(i.username)
    const tweetId = s(i.tweetId)
    const medias = i.medias || []
    const firstMedia = medias[0] || {}
    return {
      title: s(i.text), content: s(i.text),
      author: s(user.displayName) || username,
      url: username && tweetId ? `https://x.com/${username}/status/${tweetId}` : '',
      publishTime: s(i.createdAt),
      likes: i.likeCount || 0, comments: i.replyCount || 0, shares: i.retweetCount || 0,
      views: toInt(i.viewCount), collects: i.bookmarkCount || 0, followers: user.followers || 0,
      coverUrl: s(firstMedia.coverUrl), mediaType: s(firstMedia.type) || 'text',
    }
  },
  youtube(i) {
    const vid = s(i.videoId)
    const thumbs = i.thumbnails || []
    return {
      title: s(i.title), content: s(i.description), author: s(i.author),
      url: vid ? `https://www.youtube.com/watch?v=${vid}` : '', publishTime: s(i.publishedTime),
      likes: null, comments: null, shares: null,
      views: i.viewCount || 0, collects: null, followers: null,
      coverUrl: thumbs[0]?.url || '', mediaType: 'video',
    }
  },
}

// ── 传输（JSON POST，双 header REDFOX-API-KEY + X-API-Key）──────────────

export function httpPostJson(url, body, { timeout = TIMEOUT, headers = {} } = {}) {
  const u = new URL(url)
  const transport = u.protocol === 'http:' ? http : https
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  return new Promise((resolve, reject) => {
    const req = transport.request({
      host: u.hostname,
      port: Number(u.port) || (u.protocol === 'http:' ? 80 : 443),
      method: 'POST',
      path: `${u.pathname}${u.search}`,
      headers: { 'content-type': 'application/json', 'content-length': payload.length, ...headers },
    }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }) }
        catch { reject(new Error(`响应不是合法 JSON（HTTP ${res.statusCode}）：${text.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(timeout, () => req.destroy(new Error(`请求超时（${timeout}ms）`)))
    req.end(payload)
  })
}

// 请求单个平台，返回结果 dict（失败时含 error 字段——单平台失败不影响整体，上游容错口径）
export async function fetchPlatform(key, keyword, apiKey, { apiBase = HOST_DEFAULT, timeout = TIMEOUT } = {}) {
  const cfg = PLATFORMS[key]
  if (!cfg) throw new Error(`未知平台: ${key}（可选：${PLATFORM_KEYS.join(', ')}）`)
  const headers = {
    'Content-Type': 'application/json',
    'REDFOX-API-KEY': apiKey,
    'X-API-Key': apiKey,
  }
  const bodyDict = {}
  for (const [k, v] of Object.entries(cfg.body)) {
    bodyDict[k] = typeof v === 'string' ? v.replace('{kw}', keyword) : v
  }
  bodyDict.source = SOURCE

  let raw
  try {
    const { json } = await httpPostJson(`${apiBase}${cfg.path}`, bodyDict, { timeout, headers })
    raw = json
  } catch (err) {
    return { platform: cfg.name, error: String(err?.message || err) }
  }
  if (raw?.code !== 2000) {
    return { platform: cfg.name, error: `接口返回 code=${raw?.code}, msg=${raw?.msg}` }
  }
  let items = deepGet(raw, cfg.list_key)
  if (items === null) items = []
  if (!Array.isArray(items)) items = []
  const norm = NORMALIZERS[key]
  const normalized = items.map((i) => norm(i))
  const total = key !== 'toutiao' && key !== 'tiktok' ? toInt(deepGet(raw, ['data', 'total'])) : null
  return { platform: cfg.name, count: normalized.length, total, items: normalized }
}

// 并行采集全部选中平台（Promise.all，单平台失败落 error 不抛出）
// 互动量口径 = 点赞 + 评论 + 分享 + 播放（无播放按 0 计）；API 个别平台返回字符串数字，Number() 兜底
export async function fetchAll({ keyword, platforms, apiKey, apiBase, timeout } = {}) {
  const selected = platforms?.length ? platforms : PLATFORM_KEYS
  const entries = await Promise.all(selected.map((k) => fetchPlatform(k, keyword, apiKey, { apiBase, timeout })))
  const byName = new Map(Object.entries(PLATFORMS).map(([k, v]) => [v.name, k]))
  const results = {}
  const errors = []
  for (const r of entries) {
    if (r.error) { errors.push(r); continue }
    results[byName.get(r.platform)] = r
  }
  const engOf = (i) => (Number(i.likes) || 0) + (Number(i.comments) || 0) + (Number(i.shares) || 0)
  const totalItems = Object.values(results).reduce((n, r) => n + r.count, 0)
  const totalEngagement = Object.values(results).reduce((n, r) => n + r.items.reduce((m, i) => m + engOf(i), 0), 0)
  return {
    keyword,
    generatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    platformCount: Object.keys(results).length,
    failedPlatforms: errors,
    totalItems,
    totalEngagement,
    results,
  }
}

export function resolveApiKey({ settings = {}, config = {} } = {}) {
  return String(config.apiKey || settings.api_key || process.env.REDFOX_API_KEY || '').trim()
}

export function resolveApiBase({ settings = {} } = {}) {
  const base = String(settings.api_base || process.env.REDFOX_API_BASE || '').trim()
  return (base || HOST_DEFAULT).replace(/\/+$/, '')
}
