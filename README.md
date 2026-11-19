# 生成式 AI 技术路线树 · Generative AI Tech Roadmap

一棵从矿产、能源一直延伸到应用层的生成式 AI 技术树：横轴是时间，越放大越细，带实时的“现在”线。

A generative AI technology tree that runs from minerals and energy all the way up to applications: time on the horizontal axis, more detail as you zoom in, and a live "now" line.

## 功能 · Features

- **10 层 / 4 大区 · 10 layers in 4 zones**：价值区（应用、模型服务）、智能区（基础模型、数据）、算力区（系统软件、数据中心、芯片）、物理区（制造、能源、矿产）。Value, Intelligence, Compute and Physical zones.
- **语义缩放 · Semantic zoom**：概览 → 分层 → 子分支，三级细节随缩放出现。Overview → layers → sub-branches.
- **实时时间轴 · Live timeline**：聚焦近期的对数时间轴（可切换线性），按真实时钟移动的“现在”线，30 天内新节点高亮，未来计划节点，时间回放。Log-scaled "recent focus" axis (or linear), a now line driven by the real clock, fresh-node highlights, scheduled future nodes, and replay.
- **两种节点 · Two node types**：● 技术突破、◆ 约束 / 事件（出口管制、产能、电力等）。● breakthroughs and ◆ constraints/events.
- **中英双语 · Bilingual**：右上角切换，或在链接末尾加 `#en` / `#zh`。Toggle top-right, or add `#en` / `#zh` to the URL.

## 数据格式 · Data format

每个节点都是 `index.html` 里 `NODES` 数组中的一条记录 · Each node is one entry in the `NODES` array in `index.html`:

```js
{
  id, title, date: "YYYY" | "YYYY-MM" | "YYYY-MM-DD", branch, parents: [id...],
  level: 1 | 2 | 3,                       // 1 里程碑 milestone · 2 重要 important · 3 细节 detail
  kind: "paper" | "release" | "event" | "constraint" | "upcoming",
  summary, source, url, criteria: [...], tags: [...],
  status: "verified" | "candidate", added_by, added_at, confidence,
  en: { title, summary }                  // 英文版 English version
}
```

## 部署 · Deployment

推送到 `main` 后，GitHub Actions 会自动部署到 GitHub Pages（仓库 Settings → Pages → Source 需选 “GitHub Actions”）。

Pushing to `main` deploys to GitHub Pages via GitHub Actions (set Settings → Pages → Source to "GitHub Actions").

## 说明 · Notes

数据截至 2026-11，部分节点日期和事实尚待逐条核对。This is seed data as of 2026-11; some dates and facts are still being verified.
