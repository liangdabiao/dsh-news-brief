# dsh-news-brief · 全球新闻AI简报

DeepSeek Harness（dsh）插件：**一个关键词并行搜索 11 大平台**（抖音/小红书/公众号/B站/快手/视频号/今日头条/TikTok/Instagram/X/YouTube），跨平台聚合标准化，agent 按四大板块撰写情报报告 + 交互式 HTML。

移植自 [redfox-data/redfox-community](https://github.com/redfox-data/redfox-community) 的 `skills/global-ai-news-brief`（Python 全量重写为 Node 原生，**零 Python 依赖**；上游 report-template.html 蓝色主题模板原样复用）。
 <img width="2409" height="1380" alt="image" src="https://github.com/user-attachments/assets/021f5001-7a5c-4451-b59a-2d6b91c1d70f" />
 <img width="1572" height="1313" alt="image" src="https://github.com/user-attachments/assets/7d9b0572-3def-43df-93ba-62fa8e18f857" />

<img width="2067" height="1244" alt="image" src="https://github.com/user-attachments/assets/85b1f856-5480-4918-9afb-fdb3be82c4d6" />

<img width="2255" height="444" alt="image" src="https://github.com/user-attachments/assets/b32f9cc9-7ae1-4ee2-a054-a49a74d059b8" />


## 安装

```bash
dsh plugin --profile web add https://github.com/liangdabiao/dsh-news-brief
```

## 覆盖平台

| 国内 | 海外 |
|------|------|
| 抖音、小红书、公众号、B站、快手、视频号、今日头条 | TikTok、Instagram、X(Twitter)、YouTube |

`platforms="domestic"` 只搜国内 7 平台；单平台失败自动跳过并标注（`failedPlatforms`），不影响其他平台。海外平台在无代理网络可能失败。

## 四大板块（agent 按 global-ai-news-brief 技能撰写）

1. **新闻事件**：事件概述（3-5 句）+ 时间线（倒序，无日期排最后）+ 热点话题聚类（3-8 个）
2. **新闻解读**：核心摘要（≤200 字）+ 关键发现（3-5 条）+ 舆情风向（正/中/负 + 共识/争议）+ 大V观点（粉丝>1w 或互动 TOP，主页链接按平台规则拼）
3. **各平台不同的解读倾向**：跨平台对比矩阵（情感/焦点/形态/热度/代表声音）+ 互动量柱状图
4. **数据源**：平台 Tab 切换（按互动量降序），每平台全部条目卡片（封面/标题/作者/指标/原文链接）

**互动量口径** = 点赞 + 评论 + 分享 + 播放（接口不返回播放量的平台按 0 计）。**数据时间范围**：解析全部条目 publishTime（含 X 的 RFC 格式与 `N days ago` 相对时间），30 天主体窗口 + 历史旧闻标注。

## 工作流

```
news_brief(action="search", keyword="…")        ← 并行 11 平台，同步 3-30 秒
  → items 分平台补读条目（供分析）
  → agent 撰写四大板块 → news_brief(action="report", analysisJson=…)
  → 交互式 HTML（概览卡/时间线/话题卡/舆情条/大V卡/矩阵/柱图/Tab 数据卡）
```

## 面板（侧栏「全球新闻AI简报」）

- **概览**：关键词 + 11 平台勾选 + 简报历史（卡片上直接有「📄 打开报告」入口）；「去对话出情报报告」开新对话
- **报告**：报告库页，列出全部已生成的 HTML 情报报告，在面板内覆盖层查看
- **简报页**：平台采集状态（✓/✗ + 失败原因）、各平台互动量对比条、agent 分析摘要（舆情条 + 时间线）、打开/生成 HTML 报告
- **设置**：API Key、代理（海外平台需要）、接口地址

> ⚠️ 桌面端 dsh 的 WebContentsView 会 deny `window.open`/`target=_blank`，所以报告**不能**用新窗口打开：
> 面板改为同源 fetch 报告 HTML → `iframe.srcdoc` 在覆盖层里渲染；报告里的条目链接由宿主 `POST /api/open`
> （`lib/open.js`，系统默认浏览器打开）处理——`/report` 路由用 `injectOpenLinks` 注入点击转发脚本。
> 报告是否存在由 `meta.has_report`（宿主）给出，宿主未重启时面板用 `HEAD /api/briefs/<bid>/report` 探测兜底。
> `/api/open` 是宿主路由：改完要**重启一次 dsh** 才生效（`lab/` 静态文件改完刷新面板即可）。

## 配置

**RedFox API Key**（必需，`ak_` 开头）：[红狐 hub](https://redfox.hk/settings/api-keys?source=github) 获取。优先级：插件配置 `apiKey` > 面板「设置」页 > 环境变量 `REDFOX_API_KEY`。双 header（`REDFOX-API-KEY` + `X-API-Key`）与上游一致。

> ✅ 2026-11-13 实测：国内 7 平台免费积分可用，3 秒返回 128 条真实内容（抖音/小红书/公众号/B站/快手/视频号/头条全部成功）。

## 开发

```bash
npm i
npm run build      # client.js → dist/client.js
npm test           # 14 个单测（11 平台归一化逐行对齐上游/并行容错/时间范围/模板填充/工具全链路）
npm run smoke      # 离线冒烟：本地假 RedFox 服务器全链路（工具 + 面板 API + 占位符泄漏检测）
npm run live       # 真实 API 冒烟：node scripts/live.mjs <keyword> [platforms] ak_xxx
npm run dev        # 面板独立预览：DSH_HOME=<目录> node scripts/devserver.mjs 5184
```

数据落在 `$DSH_HOME/news-brief/`：`settings.json` + `briefs/<bid>/`（intel/analysis/meta/report.html；同关键词+日期覆盖），原子写。上游模板在 `assets/report-template.html`。

## 结构

```
src/host.js            news_brief 工具（search/items/report/history）+ 装配
src/systemPrompt.js    四大板块规范注入
lib/platforms.js       11 平台定义 + 专属归一化（逐行对齐 norm_*）+ 并行采集 + 双 header
lib/report.js          上游模板填充（时间线/话题/舆情/大V/矩阵/柱图/Tab）+ 数据时间范围计算
lib/store.js           briefs/<bid> 持久化 + analysis 存取 + 设置
lib/api.js             /news-brief 面板路由（含 /analysis 回写通道）
client.js / lab/       浏览器半边（侧栏入口 + iframe 面板，明暗跟随 dsh 主题）
assets/report-template.html     上游蓝色主题模板（原样复用）
skills/global-ai-news-brief/    方法论技能（四板块规范 + api-reference 参考）
```

## License

MIT（本插件代码）。方法论、模板与 API 用例参考 redfox-data/redfox-community skills/global-ai-news-brief（上游未附许可证文件，仅作技术参考）；RedFox API 使用受其服务条款约束。
