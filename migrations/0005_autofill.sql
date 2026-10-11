-- 自动补全：外部评分 / Bangumi ID / 补全操作日志（支持撤回）
ALTER TABLE items ADD COLUMN external_rating REAL;
ALTER TABLE items ADD COLUMN bgm_id INTEGER;

CREATE TABLE autofill_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  source     TEXT    NOT NULL,             -- tmdb | bangumi
  external_id TEXT   NOT NULL,             -- TMDB id / Bangumi subject id
  fields     TEXT    NOT NULL,             -- JSON: {字段名: {before: 旧值|null, after: 新值}}
  applied_at TEXT    NOT NULL,
  undone_at  TEXT                            -- 非空表示已撤回
);

CREATE INDEX idx_autofill_item ON autofill_log(item_id);
