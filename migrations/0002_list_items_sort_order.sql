-- 清单内条目排序字段：sort_order 应在 list_items 上（0001 误放在 lists 上，保留不碍事）
ALTER TABLE list_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
