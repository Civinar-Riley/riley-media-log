// 密钥字段的类型补充声明。
// `wrangler types` 生成的 Env 里，密钥字段来自本地 .dev.vars；CI（GitHub Actions）
// 没有这个文件，生成结果会缺这些字段导致类型检查失败。这里用接口合并声明一次，
// 本地与 CI 都完整。以后新增 secret 时记得在此同步添加。
interface Env {
  AUTH_PASSWORD: string
  SESSION_SECRET: string
  API_TOKEN: string
  /** TMDB API Key（v3 key），用于自动补全影视元数据 */
  TMDB_API_KEY: string
  /** Bangumi Access Token（可选，公开接口匿名也可用），用于自动补全书漫数据 */
  BANGUMI_TOKEN: string
}
