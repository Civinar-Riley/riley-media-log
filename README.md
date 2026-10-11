<div align="center">

# 书影集 · riley-media-log

**个人的书影音记录工具：电影、剧集、动漫、综艺、小说、漫画，看过的和想看的都记在这里。**

跑在 Cloudflare Workers + D1 上，免费套餐即可长期运行，数据完全属于你自己。

[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)
[![version](https://img.shields.io/badge/version-0.1.0-blue?style=flat-square)](./package.json)
[![platform](https://img.shields.io/badge/platform-Cloudflare%20Workers-orange?style=flat-square)](https://developers.cloudflare.com/workers/)
[![storage](https://img.shields.io/badge/storage-Cloudflare%20D1-orange?style=flat-square)](https://developers.cloudflare.com/d1/)
[![frontend](https://img.shields.io/badge/React-19-blue?style=flat-square)](https://react.dev)
[![pwa](https://img.shields.io/badge/PWA-ready-9cf?style=flat-square)](#-功能特性)

[项目简介](#-项目简介) · [功能特性](#-功能特性) · [界面预览](#-界面预览) · [快速开始](#-快速开始) · [数据导入](#-数据导入) · [部署上线](#-部署上线) · [开放接口](#-开放接口) · [项目结构](#-项目结构) · [授权说明](#-授权说明)

</div>

---

## 📖 项目简介

书影集是从一份记录了约两千条影视小说的 Excel 表迁移而来的个人记录工具。它把「片单」搬到了云端：

- **自己填**：标题、年份、地区、类型标签、主创、状态、进度、评分、封面、备注、观后感，全部手动可控；
- **随便筛**：十一个维度任意组合筛选，多选字段支持「任一匹配 / 同时命中全部」两种模式；
- **放心里**：数据存在你自己的 Cloudflare D1 里，前端有密码锁，仓库里不含任何个人数据。

技术栈：Hono（Workers API）+ React 19 + Vite + Tailwind CSS 4 + Cloudflare D1，单 Worker 同时服务 API 与前端页面。

## ✨ 功能特性

### 记录与浏览

| 功能 | 说明 |
| --- | --- |
| 六大类别 | 电影 / 剧集 / 动漫 / 综艺 / 小说 / 漫画，小说与漫画各有「完结状态」字段 |
| 四种状态 | 想看 / 在看 / 看过 / 弃了，另附自由文本进度（如「看到第 8 集」） |
| 多值字段 | 地区、类型标签、主创均为多选，输入时自动补全历史值 |
| 观看流水 | 每次观看一条记录（日期 + 一句话短评），二刷直接追加 |
| 条目动态 | 添加、改状态、改评分、记流水全部自动记入时间线 |
| 个人清单 | 自由建单，从片单里搜索勾选加入，可整体维护 |

### 筛选与统计

| 功能 | 说明 |
| --- | --- |
| 十一维筛选 | 类别、状态、年份区间、地区、标签、主创、评分下限、观看日期区间、有无封面、有无观后感、标题/拼音搜索 |
| 匹配模式 | 地区 / 标签 / 主创多选时可切换「任一匹配」或「全部匹配（AND）」 |
| 统计面板 | 总量、看过、想看、今年看完四张数字卡；年度观看量、想看积压、类别分布、评分分布、地区 / 标签 / 主创 TOP 榜，点图表直接下钻到筛选结果 |
| 随机推荐 | 从想看里摇一个「今晚看什么」，可一键标记看完 |
| 字段管理 | 标签 / 地区 / 主创 / 渠道支持改名与合并，全局生效 |

### 体验

| 功能 | 说明 |
| --- | --- |
| 网格 / 列表双视图 | 封面网格或紧凑表格，选择会被记住 |
| 四套主题 | 晨白 / 夜幕 / 纸页 / 青瓷，可跟随系统昼夜自动切换 |
| 手机适配 | 响应式布局 + PWA，手机上加到主屏幕随手记 |
| 导出备份 | CSV（Excel 直接打开）与 JSON 完整备份，支持导出当前筛选结果或全部 |
| 拼音搜索 | 标题支持全拼检索（如输入 `manchang` 找到《漫长的季节》），列表按拼音首字母排序 |

## 🖼 界面预览

| 统计面板（晨白主题） | 设置页（夜幕主题） |
| --- | --- |
| ![统计面板](./docs/screenshots/stats.png) | ![设置页](./docs/screenshots/settings-night.png) |

## 🚀 快速开始

环境要求：Node.js 20+、npm、Python 3（仅数据导入需要，依赖 `openpyxl` 与 `pypinyin`）。

```bash
# 1. 安装依赖
npm install

# 2. 配置本地密钥：在项目根目录创建 .dev.vars（已被 gitignore）
#    AUTH_PASSWORD=<你的登录密码>
#    SESSION_SECRET=<任意随机长字符串，用于签名登录 cookie>
#    API_TOKEN=<脚本调 API 用的令牌，可先留空>

# 3. 初始化本地数据库并启动
npm run db:migrate:local
npm run dev
```

打开 `http://localhost:5173`，输入 `.dev.vars` 里的 `AUTH_PASSWORD` 登录。本地数据落在 `.wrangler/state` 下的 SQLite 文件里，随时可删可重灌。

## 📥 数据导入

项目自带 Excel 导入脚本（`scripts/import_excel.py`），按「动漫 / 电影 / 剧集 / 综艺 / 小说」五个工作表读取，规则：

- 进度列「已阅」或空 → 看过；数字或其他文本 → 在看 + 进度文本；
- 地区按空格与 `/` 拆分为多值；类型标签按 `/` 拆分；
- 小说表的「作者」进主创字段、「状态」进完结状态字段，「类型=漫画」的行自动归入漫画类别；
- 按「标题 + 年份 + 类别」查重，疑似重复的照常导入并在备注前打 `[疑似重复]` 标记，绝不自动删数据；
- 拼音与首字母自动计算，用于搜索与排序。

```bash
# 把你的 Excel 命名为 电影动漫小说剧集.xlsm 放在项目根目录，然后：
/d/Python/python scripts/import_excel.py          # 生成 data/import.sql 与对账报告
npx wrangler d1 execute riley-media-log --local --file data/import.sql
```

## ☁️ 部署上线

前置条件：一个 Cloudflare 账号（免费套餐即可）。

```bash
# 1. 登录 Cloudflare（浏览器授权一次）
npx wrangler login

# 2. 创建 D1 数据库，把返回的 database_id 填进 wrangler.jsonc
npx wrangler d1 create riley-media-log

# 3. 应用表结构迁移到线上库
npm run db:migrate:remote

# 4. 设置线上密钥（按提示逐个输入，不会明文出现在命令历史里）
npx wrangler secret put AUTH_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put API_TOKEN

# 5. 构建并部署
npm run deploy
```

### GitHub Actions 自动部署

仓库已带 `.github/workflows/deploy.yml`：push 到 `main` 分支即自动类型检查、构建、应用迁移并部署。需要在仓库的 **Settings → Secrets and variables → Actions** 里配置两个 Secret：

| Secret 名 | 来源 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare 后台 → My Profile → API Tokens，用「Edit Cloudflare Workers」模板创建，额外勾选 D1 编辑权限 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 后台首页右侧的 Account ID |

## 🔌 开放接口

所有 `/api/*` 路由既接受登录 cookie，也接受 `Authorization: Bearer <API_TOKEN>` 令牌，方便脚本批量读写：

| 方法与路径 | 说明 |
| --- | --- |
| `GET /api/items` | 条目列表，支持全部筛选参数（`q`、`category`、`status`、`tags`、`tag_mode=any/all`、`year_min` 等）与 `sort` / `order` / `page` 分页 |
| `POST /api/items` | 新建条目（JSON） |
| `GET /api/items/:id` | 条目详情（含观看流水、所在清单、动态） |
| `PUT /api/items/:id` | 局部更新条目 |
| `DELETE /api/items/:id` | 删除条目 |
| `GET /api/items/random` | 随机抽一条，可带筛选条件 |
| `POST /api/items/:id/viewings` | 追加观看流水 |
| `GET /api/lists` · `POST /api/lists` | 清单列表 / 新建清单 |
| `GET /api/stats` | 统计面板全部数据 |
| `GET /api/export.csv` · `GET /api/export.json` | 导出（可带筛选参数，只导出筛选结果） |
| `GET /api/fields/values?field=tags` | 枚举某字段全部取值与计数 |
| `POST /api/fields/rename?field=tags` | 字段值改名 / 合并（body: `{"from":[...],"to":"..."}`） |

示例：

```bash
curl -H "Authorization: Bearer <你的API_TOKEN>" "https://<你的域名>/api/items?status=want&page_size=5"
```

## 📁 项目结构

```text
├── migrations/            # D1 表结构迁移
├── scripts/
│   └── import_excel.py    # Excel → SQL 导入脚本（Python）
├── public/                # PWA manifest、图标、Service Worker
├── src/
│   ├── shared/            # 前后端共享：类型、枚举、筛选参数解析
│   ├── worker/            # Hono 后端：认证、条目、清单、字段、统计、导出
│   └── web/               # React 前端：页面、组件、主题系统
├── wrangler.jsonc         # Cloudflare 配置（Worker + 静态资产 + D1）
└── vite.config.ts
```

## 📄 授权说明

基于 [MIT License](./LICENSE) 开源。请自行部署使用，仓库本身不包含任何个人记录数据。
