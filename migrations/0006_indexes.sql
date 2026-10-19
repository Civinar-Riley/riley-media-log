-- 常用排序/统计路径的索引（列表默认按创建时间排序，统计按观看日期聚合）
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
CREATE INDEX IF NOT EXISTS idx_viewings_watched_on ON viewings(watched_on);
