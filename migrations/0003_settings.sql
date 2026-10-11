-- 设置表：目前存「类别定义」，让任何部署者都能按自己的习惯分类
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 默认六类（与原版一致）；改名/增删/排序/隐藏后以 settings 里的为准
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'categories',
  '[{"id":"movie","label":"电影"},{"id":"series","label":"剧集"},{"id":"anime","label":"动漫"},{"id":"variety","label":"综艺"},{"id":"novel","label":"小说","finish":true},{"id":"manga","label":"漫画","finish":true}]'
);
