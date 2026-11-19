// 高德 key 与安全密钥只从 Vite 环境变量读。这里不提供默认值，避免把密钥写进仓库。

export interface AmapConfig {
  key: string
  securityJsCode: string
  /** 有非空 key 才尝试加载高德。安全密钥缺失时仍会尝试，加载失败由界面降级 */
  enabled: boolean
}

export function amapConfigFrom(key?: string | null, security?: string | null): AmapConfig {
  const trimmedKey = (key ?? '').trim()
  const securityJsCode = (security ?? '').trim()
  return { key: trimmedKey, securityJsCode, enabled: trimmedKey.length > 0 }
}

export function readAmapConfig(): AmapConfig {
  return amapConfigFrom(import.meta.env.VITE_AMAP_KEY, import.meta.env.VITE_AMAP_SECURITY_CODE)
}
