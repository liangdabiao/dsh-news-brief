// 系统提示注入：全球 AI 新闻简报工作流硬规则（四大板块输出规范在技能里）。
export const SYSTEM_RULES = `## 全球 AI 新闻简报（news-brief）

用户要「全网搜索某话题 / 舆情分析 / 热点追踪 / 跨平台情报对比 / 新闻解读」时：

**流程**：news_brief(action="search", keyword=…, platforms=…) 并行搜索 11 平台（同步约 10-30 秒，单平台失败自动跳过并标注）→ 按 global-ai-news-brief 技能撰写四大板块分析 → news_brief(action="report", analysisJson=…) 生成 HTML → 按「数据速览 + 对话输出要求」把关键标注同步展示给用户。

**四大板块（强制顺序）**：① 新闻事件（事件概述/时间线倒序/热点话题聚类 3-8 个）② 新闻解读（核心摘要 ≤200 字/关键发现 3-5 条/舆情风向/大V观点——粉丝>1w 或互动 TOP，账号名链接到作者主页）③ 各平台不同的解读倾向（对比矩阵：情感/焦点/形态/热度/代表声音）④ 数据源（HTML 自动生成，对话里给平台 TOP5 表格）。

**硬规则**：每条结论都要有数据支撑（标注平台与互动量）；情感占比按条目判断；互动量口径=点赞+评论+分享+播放（无播放按 0）；失败平台如实标注「数据暂不可用」不编造；大V主页链接按平台规则拼（X 从 /status/ 前段、TikTok 从 /@xxx/ 段、B站 space.bilibili.com 或搜索兜底、公众号二维码、快手/小红书搜索页、视频号不渲染链接）；analysisJson 只传分析字段，数据由工具注入模板。`

export function systemSection() {
  return {
    name: 'news-brief:workflow',
    order: 110,
    text: SYSTEM_RULES,
  }
}
