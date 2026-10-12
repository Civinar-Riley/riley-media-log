-- 清空演示站业务数据（保留表结构；类别/别名定义不受访客影响，无需重置）
-- 只清登录密码哈希：万一 DEMO_MODE 拦截失效被人改过密码，重置后恢复公开密码 demo
DELETE FROM viewings;
DELETE FROM list_items;
DELETE FROM lists;
DELETE FROM activity_log;
DELETE FROM autofill_log;
DELETE FROM items;
DELETE FROM settings WHERE key = 'auth_password_hash';
