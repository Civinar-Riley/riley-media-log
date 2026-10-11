-- 人员字段拆分：通用 creators → 作者/导演/主演 三列
ALTER TABLE items ADD COLUMN authors   TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN directors TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN actors    TEXT NOT NULL DEFAULT '[]';

-- 小说/漫画的作者迁入 authors；影视类的旧主创按约定直接弃用（用户自行重填）
UPDATE items SET authors = creators WHERE category IN ('novel', 'manga') AND creators <> '[]';

ALTER TABLE items DROP COLUMN creators;

-- 人名别名映射（规范名机制）：{ "别名": "主名" }
INSERT OR IGNORE INTO settings (key, value) VALUES ('person_aliases', '{}');
