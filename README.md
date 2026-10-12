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

[项目简介](#-项目简介) · [界面预览](#-界面预览) · [功能特性](#-功能特性) · [安装](#-安装) · [使用指南](#-使用指南) · [开放接口](#-开放接口) · [仓库结构](#-仓库结构) · [常见问题](#-常见问题) · [注意事项](#-说明与注意事项) · [版本历史](#-版本历史) · [声明与授权](#-声明与授权) · [致谢](#-致谢)

</div>

---

## 📖 项目简介

书影集是一个自托管的个人书影音记录工具，起源于「把多年零散的追片记录整理明白」这个朴素需求。

- **自己填，也能自动填**：标题、年份、地区、类型标签、主创、状态、进度、评分、封面、备注、观后感全部手动可控；也可选接 TMDB / Bangumi 一键补全（默认只填空位、可撤回）；
- **随便筛**：十一个维度任意组合筛选，多选字段支持「任一匹配 / 同时命中全部」两种模式；
- **放心里**：数据存在你自己的 Cloudflare D1 里，界面有密码锁，仓库与截图不含任何个人条目数据；
- **零成本**：Workers 免费额度对个人用量绰绰有余，无需服务器；
- **导入自己的存量资料**：按 [JSON 模板](./docs/import-template.json) 整理后一条命令导入——除标题外都可以不填，缺的信息上线后用「自动补全」补齐；拼音索引自动生成。

技术栈：Hono（Workers API）+ React 19 + Vite + Tailwind CSS 4 + Cloudflare D1，单 Worker 同时服务 API 与前端页面。

## 📷 界面预览

| 片单 · 类别页签（夜幕） | 统计面板（夜幕） |
| :---: | :---: |
| ![片单](./docs/screenshots/list.png) | ![统计](./docs/screenshots/stats.png) |

| 设置 · 类别与人名管理（夜幕） | 手机端（PWA） |
| :---: | :---: |
| ![设置](./docs/screenshots/settings-night.png) | ![手机端](./docs/screenshots/mobile.png) |

*界面截图来自演示数据（在线演示站 [logdemo.civinar.eu.cc](https://logdemo.civinar.eu.cc)，密码 demo），非真实记录。*

## ✨ 功能特性

### 入口一 · 记录与浏览

| 特性 | 说明 |
| :--- | :--- |
| 🎬 六大类别 | 电影 / 剧集 / 动漫 / 综艺 / 小说 / 漫画，小说与漫画各有「完结状态」字段 |
| 🏷 四种状态 | 想看 / 在看 / 看过 / 弃了，另附自由文本进度（如「看到第 8 集」） |
| 🌏 多值字段 | 地区、类型标签、作者 / 导演 / 主演均为多选，输入时自动补全历史值；每个类别可配置显示哪些人员字段 |
| 🪪 人名别名 | 外国导演/主演的英文原名与中文译名可登记「别名 → 主名」，填写自动归一，历史数据一键统一 |
| 🔁 观看流水 | 每次观看一条记录（日期 + 一句话短评），二刷直接追加 |
| 🕘 条目动态 | 添加、改状态、改评分、记流水全部自动记入时间线 |
| 📋 个人清单 | 自由建单，从片单里搜索勾选加入，可整体维护 |

### 入口二 · 筛选与统计

| 特性 | 说明 |
| :--- | :--- |
| 🗂 类别页签 | 顶部按类别切换（带条目计数），下方状态快捷条一键筛「想看 / 在看 / 看过 / 弃了」，计数随页签联动 |
| 🔍 十一维筛选 | 类别、状态、年份区间、地区、标签、主创、评分下限、观看日期区间、有无封面、有无观后感、标题/拼音搜索 |
| 🔎 自动补全 | TMDB（影视）+ Bangumi（书漫）双源：填标题搜候选，勾选字段一键填入（默认只填空位，可勾选覆盖已有），可一键撤回；配套脚本批量回填存量 |
| 🔀 匹配模式 | 地区 / 标签 / 主创多选时可切换「任一匹配」或「全部匹配（AND）」 |
| 📊 统计面板 | 总量、看过、想看、今年看完四张数字卡；年度观看量、想看积压、类别分布、评分分布、地区 / 标签 / 主创 TOP 榜，点图表直接下钻 |
| 🎲 随机推荐 | 从想看里摇一个「今晚看什么」，可一键标记看完 |
| ✂️ 字段管理 | 标签 / 地区 / 主创 / 渠道支持改名与合并，全局生效 |

### 入口三 · 体验

| 特性 | 说明 |
| :--- | :--- |
| 🧱 双视图 | 封面网格或紧凑表格，选择会被记住 |
| 🎨 四套主题 | 晨白 / 夜幕 / 纸页 / 青瓷，可跟随系统昼夜自动切换 |
| 📱 手机适配 | 响应式布局 + PWA，手机上加到主屏幕随手记 |
| 🔐 修改密码 | 设置页内直接修改登录密码；Cloudflare 应急密钥作为忘记密码时的找回通道 |
| 📤 导出备份 | CSV（Excel 直接打开）与 JSON 完整备份，支持导出当前筛选结果或全部 |
| 🔤 拼音搜索 | 标题支持全拼检索（如输入 `manchang` 找到《漫长的季节》），列表按拼音首字母排序 |

## 📦 安装

> **完整部署文档 → [docs/部署指南.md](./docs/部署指南.md)**。部署到自己的 Cloudflare、push 即自动部署（GitHub Actions）、数据导入（JSON 模板）、日常升级与部署排错都在那里，每一步附验证方法。本节只给最快的本地体验路径。

**先看在线演示**：[logdemo.civinar.eu.cc](https://logdemo.civinar.eu.cc)（密码 `demo`）——公开可写、随便玩，数据每两天自动重置。

**一键部署到自己的 Cloudflare**（自动创建数据库，密钥按提示填写）：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Civinar-Riley/riley-media-log)

**环境要求**

- Node.js 22 与 npm（与 CI 配置一致）
- Python 3（可选。JSON 导入、演示数据、回归测试脚本用它，不需要额外依赖库）
- 一个 Cloudflare 账号（免费套餐即可，仅部署上线需要）

**三条部署路线**

| 路线 | 适合 | 一句话说明 |
| :--- | :--- | :--- |
| **A · 本地体验** | 先试试看 | localhost 跑起来，不需要 Cloudflare 账号，见下方 4 步 |
| **B · 部署上线** | 正式使用 | 部署到自己的 Cloudflare，手机随时用，见指南「路线 B」 |
| **C · push 即部署** | 长期维护 | 配一次 GitHub Actions，以后 push 自动发版，见指南「路线 C」 |

**本地快速开始**

1. **克隆并安装依赖**：`git clone https://github.com/Civinar-Riley/riley-media-log.git && cd riley-media-log && npm install`
2. **配置本地密钥**：项目根目录创建 `.dev.vars`（已被 gitignore），写入 `AUTH_PASSWORD`（登录密码）、`SESSION_SECRET`（随机长字符串）、`API_TOKEN`（脚本令牌）三行即可，格式见指南；
3. **初始化本地数据库**：`npm run db:migrate:local`；
4. **启动**：`npm run dev`，打开 `http://localhost:5173`，输入 `AUTH_PASSWORD` 登录即用。

**配置一览**

| 项 | 位置 | 说明 |
| :--- | :--- | :--- |
| `AUTH_PASSWORD` | `.dev.vars` / `wrangler secret` | 登录密码，也是忘记应用内密码时的应急登录通道 |
| `SESSION_SECRET` | `.dev.vars` / `wrangler secret` | 签名登录 cookie 的随机长字符串 |
| `API_TOKEN` | `.dev.vars` / `wrangler secret` | 脚本调用 API 用的 Bearer 令牌 |
| `TMDB_API_KEY` | `.dev.vars` / `wrangler secret` | 可选，自动补全（影视类）的 TMDB v3 Key |
| `BANGUMI_TOKEN` | `.dev.vars` / `wrangler secret` | 可选，自动补全（书漫类）的 Bangumi Token，缺省匿名可用 |
| `database_id` | `wrangler.jsonc` | 部署到线上前替换为 `wrangler d1 create` 返回的真实 ID |

> ⚠️ **顶层 `database_id` 是占位符**：一键部署按钮会在你的 Cloudflare 账号里自动创建数据库并替换它；手动部署请先 `npx wrangler d1 create riley-media-log` 再替换该值，详见指南「路线 B」。
> ⚠️ **本地与线上是两套密钥**：`.dev.vars` 只作用于本地 dev，线上要另用 `wrangler secret put` 配置，互不影响。
> ⚠️ **所有密钥绝不入库**：`.dev.vars`、`*.xlsm`、`data/` 均已 gitignore，切勿把密码或个人数据提交进仓库。

## 🚀 使用指南

| 场景 | 操作 |
| :--- | :--- |
| **导入自己的存量资料** | 照 [docs/import-template.json](./docs/import-template.json) 把资料整理成 JSON（除标题外都可以不填，缺的之后用「自动补全」补）→ `python scripts/import_json.py --input 你的资料.json`（导入线上站点加 `--base https://你的站点 --token xxx --allow-remote`）；默认按「标题+年份+类别」查重跳过已有条目 |
| **日常记一笔** | 右上角「记一笔」→ 填个标题就能保存，其余字段随时补 |
| **补记多年前的老片** | 记一笔 → 状态选「看过」→ 填年份 → 观后感写两句 → 顺手打个星 |
| **记二刷** | 打开条目详情 → 观看流水里选日期、写一句感受 → 「记一次观看」 |
| **建一张主题清单** | 清单页新建（如「2026 补片计划」）→ 进清单「添加条目」→ 搜索勾选加入 |
| **选择困难时** | 侧边栏「摇一摇」→ 从想看里随机摇一个，看完直接点「看完了」 |
| **找某段时间看的东西** | 片单页「筛选」→ 观看日期区间 → 图表下钻也能到同样效果 |
| **标签乱了** | 字段管理 → 选中值改名；改成已存在的名字即为合并，全局生效 |
| **备份到 Excel** | 片单页右上角下载图标导出当前筛选，设置页导出全部 CSV/JSON |
| **脚本批量读写** | 用 `API_TOKEN` 走 Bearer 调 `/api/*`，见下方开放接口 |
| **手机上用** | 浏览器打开站点 → 添加到主屏幕（PWA），底部标签栏切换页面 |
| **修改登录密码** | 设置页 → 登录密码 → 输入当前密码和新密码即可；改后立即生效，已登录设备不受影响 |
| **给条目自动补全信息** | 详情页 → 自动补全 → 选数据源（影视走 TMDB，书漫走 Bangumi）→ 搜索选择候选 → 勾选要填的字段（只填空位）→ 应用；填错了点「撤回」 |
| **批量回填存量** | `python scripts/backfill.py --category movie --limit 20`：逐条给候选让你确认；`--auto` 则只应用「标题+年份完全一致」的；`--overwrite` 覆盖已有值（默认只填空位）；`--undo data/报告.json` 一键撤回整批 |
| **审计批量改动** | `python scripts/item_audit.py`：`snapshot` 改库前存快照 → `diff` 改库后对比变化 → `stats` 看各字段空值统计 → `logs --item-id N` 看某条目的补全流水；全部只读 |

## 🔌 开放接口

所有 `/api/*` 路由既接受登录 cookie，也接受 `Authorization: Bearer <API_TOKEN>` 令牌，方便脚本批量读写：

| 方法与路径 | 说明 |
| :--- | :--- |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/status` | 登录 / 登出 / 会话状态（免令牌） |
| `POST /api/auth/change-password` | 修改登录密码（需登录，验证当前密码） |
| `GET /api/items` | 条目列表，支持全部筛选参数（`q`、`category`、`status`、`tags`、`tag_mode=any/all`、`authors`、`actors`、`year_min` 等）与 `sort` / `order` / `page` 分页 |
| `POST /api/items` | 新建条目（JSON） |
| `GET /api/items/:id` | 条目详情（含观看流水、所在清单、动态） |
| `PUT /api/items/:id` · `DELETE /api/items/:id` | 局部更新 / 删除条目 |
| `GET /api/items/random` | 随机抽一条，可带筛选条件 |
| `GET /api/items/status-counts` | 四种状态的条目计数（可按 `category` 过滤） |
| `POST /api/items/:id/viewings` | 追加观看流水 |
| `GET /api/lists` · `POST /api/lists` | 清单列表 / 新建清单 |
| `GET /api/stats` | 统计面板全部数据（含作者 / 导演 / 主演 TOP） |
| `GET /api/settings` · `PUT /api/settings/categories` | 类别定义读取与整体保存 |
| `PUT /api/settings/aliases` · `POST /api/settings/aliases/normalize` | 人名别名映射保存 / 历史数据一键归一 |
| `GET /api/export.csv` · `GET /api/export.json` | 导出（可带筛选参数，只导出筛选结果） |
| `GET /api/fields/facets` | 筛选面板各维度的可选项与计数 |
| `GET /api/fields/values?field=tags` | 枚举某字段全部取值与计数 |
| `POST /api/fields/rename?field=tags` | 字段值改名 / 合并（body: `{"from":[...],"to":"..."}`） |
| `POST /api/autofill/preview` · `POST /api/autofill/apply` · `POST /api/autofill/undo` | 自动补全：搜索候选 / 应用 / 撤回（快照可逆） |
| `POST /api/autofill/fields` · `GET /api/autofill/logs` | 候选可填字段预览 / 某条目的补全快照流水 |
| `GET /api/autofill/status` | 两个数据源的配置状态 |
| `GET /api/img?u=<图片URL>` | 封面图片代理（仅放行 `image.tmdb.org` 与 `lain.bgm.tv` 的 https 图片，边缘缓存） |

示例：

```bash
curl -H "Authorization: Bearer <你的API_TOKEN>" "https://<你的域名>/api/items?status=want&page_size=5"
```

## 📁 仓库结构

```text
├── .github/workflows/     # push main 自动部署双站；演示站每两天自动重置
├── docs/
│   ├── 部署指南.md         # 完整部署文档（三条路线 / 密钥 / 数据导入 / 升级）
│   ├── import-template.json # 数据导入的 JSON 模板
│   └── screenshots/       # README 截图（演示数据）
├── migrations/            # D1 表结构迁移（只追加，不修改历史）
├── scripts/
│   ├── common.py          # 脚本公共客户端（令牌 / 代理 / 翻页取全）
│   ├── import_json.py     # JSON 资料导入（模板见 docs/import-template.json）
│   ├── import_excel.py    # Excel → SQL（作者早期的迁移脚本，按需自改表头关键词）
│   ├── backfill.py        # 元数据批量回填（变体标题重试 + 报告整批撤回）
│   ├── item_audit.py      # 条目审计（快照 / 对比 / 统计 / 补全流水，只读）
│   ├── seed_demo.py       # 演示数据种子（真实热门片名，供演示站与截图）
│   ├── demo.mjs           # 演示站运维（deploy / reset 一键重置）
│   ├── demo_wipe.sql      # 演示站清库脚本
│   └── qa_sweep.py        # API 回归测试（以当前库为基准，任意数据集可跑）
├── public/                # PWA manifest、图标、Service Worker
├── src/
│   ├── shared/            # 前后端共享：类型、枚举、筛选参数解析
│   ├── worker/            # Hono 后端：认证、条目、清单、字段、自动补全、统计、导出
│   └── web/               # React 前端：页面、组件、主题系统
├── 防踩坑.md              # 开发与部署中真实踩过的坑与解法
├── .dev.vars.example      # 本地密钥示例（一键部署流程也会读取它收集密钥）
├── wrangler.jsonc         # Cloudflare 配置（顶层=一键部署模板；env.prod / env.demo 双站）
└── vite.config.ts
```

## ❓ 常见问题

| 问题 | 回答 |
| :--- | :--- |
| 想先看看再决定？ | 在线演示：[logdemo.civinar.eu.cc](https://logdemo.civinar.eu.cc)（密码 `demo`），公开可写、每两天自动重置，随便折腾 |
| 想部署一个自己用？ | 完整步骤见 [docs/部署指南.md](./docs/部署指南.md)：本地体验、部署到 Cloudflare、push 自动部署三条路线，每步附验证方法 |
| 数据存在哪？会丢吗？ | 在你自己账号的 Cloudflare D1 里；随时可在设置页导出 CSV/JSON 备份 |
| 忘记密码怎么办？ | 应用内改过密码后忘了：`npx wrangler secret put AUTH_PASSWORD` 设置的应急密钥仍可登录（两把钥匙任一有效），登录后可在设置页重新设置密码 |
| 能自动从豆瓣/TMDB 拉信息吗？ | 可以。TMDB（影视）+ Bangumi（书漫）双源自动补全已内置：详情页逐条补全，或用 `scripts/backfill.py` 批量回填；需按部署指南配置 `TMDB_API_KEY`（可选）。豆瓣无官方 API，不做主源 |
| 为什么要密码？ | 部署后在公网可访问，密码是唯一的门锁；纯本地运行同样需要 |
| 部署要花钱吗？ | Workers 免费额度对单人使用完全够用，D1 免费额度以百万次读计 |
| 多人能用吗？ | 目前单用户设计（一个密码共用）；数据模型不阻止将来加多用户 |
| 遇到奇怪的报错怎么办？ | 先翻 [防踩坑.md](./防踩坑.md)：开发与部署中真实踩过的坑（SQL 拼接、SW 缓存、Windows 编码、部署顺序等）都有现象与解法 |

## 🚧 说明与注意事项

- **本项目是纯 vibe coding 产物**：代码、文档与截图均由 AI 辅助生成，作者以「自己用得顺手」为目的持续打磨。功能以实用为先，代码风格未必统一、实现未必是最优解——欢迎提 Issue / PR，但请对代码质量保持合理预期；部署前建议自己过一遍代码，尤其是安全相关的部分。
- **请自行备份数据**：应用内不提供自动备份，请定期在设置页导出 CSV / JSON；因误操作、平台故障导致的数据丢失需自行承担。
- **演示站请勿存放隐私**：[在线演示站](https://logdemo.civinar.eu.cc)（密码 `demo`）公开可写、每两天自动重置，任何人都能看到和修改上面的内容。
- **外部数据来源**：自动补全的数据与封面来自 TMDB 与 Bangumi，版权归其各自所有（使用请遵守它们的条款与署名要求）；豆瓣没有官方开放 API，本项目不接入。
- **浏览器要求**：建议使用最近两年的 Chrome / Edge / Safari / Firefox；界面适配手机，支持 PWA 添加到主屏幕。
- **单用户设计**：一个密码即一把钥匙，没有多用户体系；公网部署后请勿把密码给不信任的人。

## 🕘 版本历史

| 版本 | 日期 | 更新内容 |
| :--- | :--- | :--- |
| 未发布 | — | 自动补全双源（TMDB / Bangumi）与封面图片代理、应用内修改密码、状态快捷条计数徽标、批量脚本通用化与审计工具 |
| v0.1.0 | 2026-10-11 | 首个可用版本：六大类别记录、四状态 + 进度、评分、观看流水与条目动态、类别自定义与页签、作者 / 导演 / 主演拆分与人名别名归一、十一维筛选（任一 / 全部匹配）、统计面板与图表下钻、随机推荐、个人清单、字段改名合并、CSV/JSON 导出、四套主题、PWA、密码登录 + Bearer 令牌 API、Excel 导入脚本、GitHub Actions 自动部署 |

版本号以 [package.json](./package.json) 为准，逐项变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 📜 声明与授权

- 基于 [MIT License](./LICENSE) 开源，可自由使用、修改与分发。
- 本仓库只包含代码与文档；README 截图使用演示数据生成。
- 部署后的站点数据归部署者所有，与作者无关。

## 🙏 致谢

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) 与 [D1](https://developers.cloudflare.com/d1/)：让个人工具零成本长期在线
- [TMDB](https://www.themoviedb.org/) 与 [Bangumi](https://bgm.tv)：自动补全的两大开放数据源（遵循其署名与使用条款）
- [Hono](https://hono.dev)、[React](https://react.dev)、[Tailwind CSS](https://tailwindcss.com)、[Recharts](https://recharts.org)、[pinyin-pro](https://github.com/zh-lx/pinyin-pro)、[pypinyin](https://github.com/mozillazg/python-pinyin)：本项目直接依赖的开源库
- [NeoDB](https://neodb.social)、[Ryot](https://github.com/IgnisDa/ryot)、[Movary](https://github.com/leepeuker/movary) 等开源追踪器：设计过程中反复参考的功能来源
