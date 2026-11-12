// platforms 单测：11 平台归一化逐行对齐上游 norm_*、deepGet/tsToStr、单平台容错、并行聚合
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { PLATFORMS, PLATFORM_KEYS, DOMESTIC_KEYS, NORMALIZERS, fetchPlatform, fetchAll, deepGet, tsToStr, toInt, SOURCE } from '../lib/platforms.js'

test('PLATFORMS：11 平台与上游路径一致', () => {
  assert.equal(PLATFORM_KEYS.length, 11)
  assert.equal(PLATFORMS.douyin.path, '/story/api/dy/data/searchWork')
  assert.equal(PLATFORMS.youtube.body.searchQuery, '{kw}') // 参数名特例
  assert.deepEqual(DOMESTIC_KEYS, ['douyin', 'xiaohongshu', 'wechat_gzh', 'bilibili', 'kuaishou', 'shipinhao', 'toutiao'])
})

test('deepGet / tsToStr / toInt：工具函数', () => {
  assert.deepEqual(deepGet({ data: { list: [1] } }, ['data', 'list']), [1]) // 数组也按路径取（上游 _deep_get 同语义）
  assert.equal(deepGet({ data: {} }, ['data', 'list']), null)
  assert.equal(tsToStr(1700000000).startsWith('2023-11-1'), true)
  assert.equal(tsToStr(null), '')
  assert.equal(tsToStr('abc'), '')
  assert.equal(toInt('12'), 12)
  assert.equal(toInt('abc'), null)
  assert.equal(toInt(null), null)
})

test('norm_douyin：videoType 68 → image', () => {
  const n = NORMALIZERS.douyin({ content: '视频文案', authorName: '甲', opusUrl: 'https://dy/1', likeCount: '100', videoType: '68' })
  assert.equal(n.title, '视频文案')
  assert.equal(n.mediaType, 'image')
  assert.equal(n.views, null)
  assert.equal(n.likes, '100') // 上游直通字符串（展示层 fmtInt 兜底）
})

test('norm_bilibili：BV 拼接', () => {
  const n = NORMALIZERS.bilibili({ title: 'B站视频', bvId: 'BV1xx', playCount: 5000, favoriteCount: 99, picUrl: 'https://pic/1' })
  assert.equal(n.url, 'https://www.bilibili.com/video/BV1xx')
  assert.equal(n.views, 5000)
  assert.equal(n.mediaType, 'video')
})

test('norm_kuaishou：photoId 拼接 + 粉丝数', () => {
  const n = NORMALIZERS.kuaishou({ caption: '快手文案', photoId: 'px', nickname: '乙', authorFans: 888, viewCount: 1000 })
  assert.equal(n.url, 'https://www.kuaishou.com/short-video/px')
  assert.equal(n.followers, 888)
})

test('norm_toutiao：无点赞/分享/封面，时间戳转换', () => {
  const n = NORMALIZERS.toutiao({ title: '头条文章', nickname: '丙', publishTime: 1700000000, commentNum: 42 })
  assert.equal(n.likes, null)
  assert.equal(n.shares, null)
  assert.equal(n.coverUrl, '')
  assert.equal(n.mediaType, 'text')
  assert.ok(n.publishTime.startsWith('2023-11-1'))
})

test('norm_tiktok：嵌套 authorData/statsData/videoData', () => {
  const n = NORMALIZERS.tiktok({
    content: 'TT视频', shareLink: 'https://tiktok.com/@a/video/1',
    authorData: { userName: 'TT作者', fansCount: 9999 },
    statsData: { likeCount: 100, commentTotal: 20, shareTotal: 5, viewCount: 8000 },
    videoData: { coverImage: 'https://cover/1' }, mediaType: 'video',
  })
  assert.equal(n.author, 'TT作者')
  assert.equal(n.followers, 9999)
  assert.equal(n.views, 8000)
  assert.equal(n.coverUrl, 'https://cover/1')
})

test('norm_x_twitter：tweetId 拼接 + username 兜底', () => {
  const n = NORMALIZERS.x_twitter({
    text: '推文', user: { username: 'elon', displayName: 'Elon Musk', followers: 100000000 },
    tweetId: '123', medias: [{ type: 'photo', coverUrl: 'https://m/1' }], likeCount: 10, viewCount: '777',
  })
  assert.equal(n.url, 'https://x.com/elon/status/123')
  assert.equal(n.author, 'Elon Musk')
  assert.equal(n.views, 777)
  assert.equal(n.mediaType, 'photo')
})

test('norm_youtube：thumbnails 首图', () => {
  const n = NORMALIZERS.youtube({ title: 'YT视频', videoId: 'abc', viewCount: 20000, thumbnails: [{ url: 'https://thumb/1' }] })
  assert.equal(n.url, 'https://www.youtube.com/watch?v=abc')
  assert.equal(n.coverUrl, 'https://thumb/1')
  assert.equal(n.likes, null)
})

// ── fetchPlatform / fetchAll（假服务器）────────────────────────────────
test('fetchPlatform：成功/业务错误/网络失败容错', async () => {
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const payload = JSON.parse(body || '{}')
      const reply = (obj, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
      const h = req.headers
      if (h['x-api-key'] !== 'ak_x') return reply({ code: 3201, msg: '积分不足' })
      // 双 header 校验
      if (!h['redfox-api-key']) return reply({ code: 403, msg: 'missing header' })
      if (payload.keyword === ' DouyinBad ') return reply({ code: 500, msg: 'internal' })
      if (req.url.includes('/dy/') || req.url.includes('douyin')) {
        reply({ code: 2000, data: { list: [{ content: 'dy视频', authorName: '甲', opusUrl: 'https://dy/1', likeCount: '100' }], total: 99 } })
        return
      }
      reply({ code: 2000, data: { list: [] } })
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    const ok = await fetchPlatform('douyin', 'AI', 'ak_x', { apiBase: base })
    assert.equal(ok.count, 1)
    assert.equal(ok.total, 99)
    assert.equal(ok.items[0].likes, '100') // 上游直通字符串
    assert.equal(ok.platform, '抖音')

    const bad = await fetchPlatform('douyin', ' DouyinBad ', 'ak_x', { apiBase: base })
    assert.match(bad.error, /code=500/)

    const noKey = await fetchPlatform('douyin', 'AI', 'ak_bad', { apiBase: base })
    assert.match(noKey.error, /3201|积分不足/)
  } finally {
    await new Promise((r) => srv.close(r))
  }
})

test('fetchAll：并行聚合、失败平台标注、互动口径', async () => {
  const srv = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const payload = JSON.parse(body || '{}')
      const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
      if (payload.keyword === ' DouyinBad ' && req.url.includes('/dy/')) return reply({ code: 500, msg: 'boom' })
      const isToutiao = req.url.includes('toutiao')
      const isYoutube = req.url.includes('youtube')
      const item = isToutiao
        ? { title: '头条文', nickname: '丙', publishTime: 1700000000, commentNum: 5 }
        : { content: '通用作品', authorName: '甲', opusUrl: 'https://x/1', likeCount: 10, commentCount: 2, shareCount: 3 }
      if (isToutiao) reply({ code: 2000, data: [item] })
      else if (isYoutube) reply({ code: 2000, data: { videos: [item] } })
      else reply({ code: 2000, data: { list: [item] } })
    })
  })
  await new Promise((r) => srv.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${srv.address().port}`
  try {
    const intel = await fetchAll({ keyword: 'AI', platforms: ['douyin', 'toutiao', 'youtube'], apiKey: 'ak_x', apiBase: base })
    assert.equal(intel.platformCount, 3)
    assert.equal(intel.totalItems, 3)
    // douyin 条目互动 15（10+2+3），toutiao 评论 5 → 总 20
    assert.equal(intel.totalEngagement, 20)
    assert.deepEqual(intel.failedPlatforms, [])
    assert.ok(intel.results.douyin && intel.results.toutiao && intel.results.youtube)
    assert.ok(intel.generatedAt)

    // 一个平台业务失败 → failedPlatforms 标注，其余不受影响
    const intel2 = await fetchAll({ keyword: ' DouyinBad ', platforms: ['douyin', 'toutiao'], apiKey: 'ak_x', apiBase: base })
    assert.equal(intel2.platformCount, 1)
    assert.equal(intel2.failedPlatforms.length, 1)
    assert.match(intel2.failedPlatforms[0].error, /code=500/)
    assert.equal(intel2.results.toutiao.count, 1)
  } finally {
    await new Promise((r) => srv.close(r))
  }
})
