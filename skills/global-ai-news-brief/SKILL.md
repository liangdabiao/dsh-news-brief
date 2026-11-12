---
name: global-ai-news-brief
description: 全球 AI 新闻简报方法论：一个关键词并行搜索 11 大平台（抖音/小红书/公众号/B站/快手/视频号/头条/TikTok/Instagram/X/YouTube），跨平台聚合标准化后按四大板块撰写情报报告（新闻事件/新闻解读/各平台解读倾向/数据源）。用户要新闻搜索、舆情分析、热点追踪、跨平台情报对比、事件追踪、行业情报时使用。触发词：新闻情报、全网搜索、舆情分析、热点追踪、新闻解读、资讯聚合、跨平台分析、事件追踪、行业情报。
---

# 全球AI新闻简报

输入一个关键词，同时发起 11 大平台搜索请求，跨平台聚合数据后由你（agent）生成深度情报报告。

## 覆盖平台

抖音 / 小红书 / 公众号 / B站 / 快手 / 视频号 / 今日头条 / TikTok / Instagram / X(Twitter) / YouTube（`domestic` 只搜国内 7 平台）

详细请求/响应字段见 `references/api-reference.md`。

## 鉴权

需要 RedFox API Key（`ak_` 开头，[红狐 hub](https://redfox.hk/settings/api-keys?source=github) 获取）。优先级：插件配置 > 面板「设置」页 > 环境变量 `REDFOX_API_KEY`。海外平台在无代理网络可能失败（失败自动跳过不影响其他平台）。

## 关键词处理

用户输入直接作为搜索词；含「达人」「博主」「KOL」「网红」「账号」等后缀时，剥离后缀仅保留核心语义词再搜。

## 工作流

### 1. 并行采集

`news_brief(action="search", keyword="…")` —— 并行请求全部平台，每个平台标准化条目（title/content/author/url/publishTime/likes/comments/shares/views/collects/followers/coverUrl/mediaType），单平台失败自动跳过并标注。

### 2. 撰写四大板块分析（强制顺序）

**① 新闻事件**——还原"发生了什么"：
- 事件概述：3-5 句话概括核心事件（谁、什么、何时、何地、影响范围）
- 关键事件时间线：按发布时间**倒序**排列（最新在最上），无明确日期的条目排最后
- 热点话题聚类：3-8 个话题，每个标注主题名、涉及平台数、代表内容 2-3 条

**② 新闻解读**——分析"意味着什么"：
- 核心摘要：≤200 字精炼总结（事件定性、影响评估、趋势预判）
- 关键发现：3-5 条核心洞察，每条论点 + 数据支撑
- 舆情风向：正面/中性/负面占比 + 核心共识点 + 核心争议点
- 大V观点：粉丝 > 10000 或单条互动量 TOP 的作者（标题用「大V观点」不用「关键意见领袖」）；**主页链接拼接规则**：X `https://x.com/{username}`（从作品 url `/status/` 前段提取）、TikTok `https://www.tiktok.com/@{username}`（从 `/@xxx/` 段）、Instagram `https://www.instagram.com/{username}/`、B站 `https://space.bilibili.com/{mid}`（无 mid 回退搜索页）、公众号 `https://open.weixin.qq.com/qr/code?username={biz}`、快手/小红书回退平台搜索链接、视频号不渲染链接

**③ 各平台不同的解读倾向**——跨平台对比：
- 每个有数据的平台分析：情感倾向（与全网均值对比）/ 关注焦点 / 内容形态（视频/图文/长文）/ 热度指标 / 代表声音
- 输出为跨平台对比矩阵表（平台/内容数/总互动/情感倾向/关注焦点/代表观点）

**④ 数据源**：HTML 自动生成平台 Tab；对话里按平台给 TOP5 表格（# / 标题 / 作者 / 点赞 / 评论 / 分享 / 发布时间 / 链接）

### 3. 提交分析生成 HTML

把分析整理成 JSON 提交 `news_brief(action="report", analysisJson=…)`，字段：
```
{
  eventSummary: "…",
  timeline: [{time, desc, sourcePlatform, sourceAuthor}],
  topics: [{name, platforms, items: ["代表内容…"]}],
  coreSummary: "…",
  keyFindings: ["…"],
  sentiment: { pos: 45, neu: 40, neg: 15, consensus: "…", controversy: "…" },
  kols: [{name, platform, followers, viewpoint, url}],
  platformInsights: { "抖音": { sentiment, focus, viewpoint }, … },
  highlights: ["各平台差异亮点…"]
}
```
工具自动填充：对比矩阵、互动量柱状图、平台 Tab 数据卡、数据时间范围。

### 4. 对话输出（关键标注同步展示）

- 数据时间范围（短格式 + 主体占比/历史旧闻说明，来自工具返回）
- 互动量计算公式：**互动量 = 点赞 + 评论 + 分享 + 播放**（接口不返回播放量的平台按 0 计）
- 各平台数据统计、互动排名、报告文件路径

## 数据时间范围口径

解析全部条目 publishTime（兼容 `YYYY-MM-DD...`、X 的 `%a %b %d %H:%M:%S +0000 %Y`、相对时间 `N days/weeks/months ago` 以采集日推算），取最小/最大日期；报告当前时间前 30 天为主体窗口，90% 以上条目落在窗口内则注明「主体近30天」，窗口外计为「历史旧闻」注明最早日期。

## 错误处理

| 情况 | 处理方式 |
|------|---------|
| 某平台请求失败 | 跳过并在报告标注「数据暂不可用」，不阻断其他平台 |
| 全部平台无结果 | 如实说明，建议换更通用的关键词 |
| 未配置 API Key | 引导到面板「设置」页填写 |
| 封面缺失 | 工具自动处理（无封面平台不渲染封面区，空封面渲染占位块） |

## 在 DSH 插件里使用

- `news_brief` 工具负责 11 平台并行搜索/标准化/模板填充；四大板块分析由你撰写
- `items` 分平台补读条目；`history` 列出简报（新→旧），补分析传 `briefId` + `analysisJson`
- 面板可直搜/看平台状态/互动对比/生成纯数据版报告；与对话流程共用同一份数据
