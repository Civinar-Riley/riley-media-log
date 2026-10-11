-- riley-media-log 初始表结构
-- items      条目主表（电影/剧集/动漫/综艺/小说/漫画）
-- viewings   观看流水（二刷记录）
-- lists      个人清单/合集
-- list_items 清单条目关联
-- activity_log 条目动态时间线（系统自动记录）

CREATE TABLE items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  pinyin          TEXT    NOT NULL DEFAULT '',   -- 全拼，用于中文拼音搜索
  pinyin_initial  TEXT    NOT NULL DEFAULT '',   -- 拼音首字母，用于排序（替代原 A/Z 列）
  category        TEXT    NOT NULL,              -- movie|series|anime|variety|novel|manga
  year            INTEGER,                       -- 上映/开播年份，仅年份
  season          INTEGER,                       -- 季号（导入时从标题「第N季」提取）
  regions         TEXT    NOT NULL DEFAULT '[]', -- JSON 数组，制片地区（多选）
  tags            TEXT    NOT NULL DEFAULT '[]', -- JSON 数组，类型标签（多选）
  creators        TEXT    NOT NULL DEFAULT '[]', -- JSON 数组，作者/主创（多选，可筛选）
  status          TEXT    NOT NULL DEFAULT 'want', -- want|watching|done|dropped
  progress        TEXT    NOT NULL DEFAULT '',   -- 进度文本（在看第几集/页/期）
  episode_count   INTEGER,                       -- 总集数（动漫/剧集）
  rating          INTEGER,                       -- 我的评分 1-5，选填
  cover_url       TEXT    NOT NULL DEFAULT '',   -- 封面外链
  channel         TEXT    NOT NULL DEFAULT '',   -- 观看渠道（影院/腾讯/爱奇艺/B站…）
  finish_status   TEXT,                          -- finished|ongoing|ruined，仅小说/漫画
  notes           TEXT    NOT NULL DEFAULT '',   -- 备注
  review          TEXT    NOT NULL DEFAULT '',   -- 观后感
  tmdb_id         TEXT,                          -- 预留 TMDB 关联
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

CREATE TABLE viewings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  watched_on  TEXT    NOT NULL,                -- 观看日期（YYYY-MM-DD）
  comment     TEXT    NOT NULL DEFAULT '',     -- 本次短评
  created_at  TEXT    NOT NULL
);

CREATE TABLE lists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,      -- 清单内条目排序
  created_at  TEXT    NOT NULL
);

CREATE TABLE list_items (
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  added_at    TEXT    NOT NULL,
  PRIMARY KEY (list_id, item_id)
);

CREATE TABLE activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
  action      TEXT    NOT NULL,   -- created|updated|status_changed|rating_changed|viewing_added|list_changed
  detail      TEXT    NOT NULL DEFAULT '', -- 中文描述，如「状态：想看 → 在看」
  created_at  TEXT    NOT NULL
);

CREATE INDEX idx_items_category ON items(category);
CREATE INDEX idx_items_status   ON items(status);
CREATE INDEX idx_items_year     ON items(year);
CREATE INDEX idx_viewings_item  ON viewings(item_id);
CREATE INDEX idx_activity_item  ON activity_log(item_id);
CREATE INDEX idx_list_items_item ON list_items(item_id);
