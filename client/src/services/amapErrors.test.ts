import { describe, expect, it } from 'vitest'
import { extractAmapErrorCode } from './amapErrors'

describe('高德错误码提取', () => {
  it('只返回已知错误码，不把脚本地址里的参数带出来', () => {
    expect(extractAmapErrorCode('Error: INVALID_USER_SCODE at https://webapi.amap.com/maps?key=placeholder&v=2.0')).toBe('INVALID_USER_SCODE')
    expect(extractAmapErrorCode('USERKEY_PLAT_NOMATCH')).toBe('USERKEY_PLAT_NOMATCH')
    expect(extractAmapErrorCode('当前域名未在白名单')).toBe('DOMAIN_WHITELIST')
  })

  it('普通失败和空文本不编造错误码', () => {
    expect(extractAmapErrorCode('')).toBeNull()
    expect(extractAmapErrorCode('网络超时')).toBeNull()
    expect(extractAmapErrorCode('key=placeholder')).toBeNull()
  })
})
