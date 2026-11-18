/** 高德鉴权失败时控制台或地图容器里会出现的错误码。只认这些记号，避免把脚本地址里的 key 带进界面或日志。 */
export const AMAP_ERROR_CODES = [
  'INVALID_USER_SCODE',
  'INVALID_USER_KEY',
  'INVALID_USER_DOMAIN',
  'INVALID_USER_SIGNATURE',
  'USERKEY_PLAT_NOMATCH',
  'DAILY_QUERY_OVER_LIMIT',
  'ACCESS_TOO_FREQUENT',
] as const

export type AmapErrorCode = typeof AMAP_ERROR_CODES[number] | 'DOMAIN_WHITELIST'

/** 从一段控制台或页面文本里抽出错误码。没有已知错误码时返回 null，不返回原文。 */
export function extractAmapErrorCode(text: string): AmapErrorCode | null {
  const upper = text.toUpperCase()
  for (const code of AMAP_ERROR_CODES) {
    if (upper.includes(code)) return code
  }
  if (text.includes('白名单')) return 'DOMAIN_WHITELIST'
  return null
}
