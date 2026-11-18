import { describe, expect, it } from 'vitest'
import { amapConfigFrom } from './amapEnv'

describe('高德环境变量', () => {
  it('空白和缺省都不算已配置，避免把空串当成 key 去请求高德', () => {
    expect(amapConfigFrom().enabled).toBe(false)
    expect(amapConfigFrom('   ', '  ').enabled).toBe(false)
    expect(amapConfigFrom(null, null)).toEqual({ key: '', securityJsCode: '', enabled: false })
  })

  it('只认传入的字符串，key 两侧空白去掉；没有安全密钥时仍视为要尝试加载', () => {
    expect(amapConfigFrom('  demo-key  ', '')).toEqual({ key: 'demo-key', securityJsCode: '', enabled: true })
    expect(amapConfigFrom('demo-key', ' sec ').securityJsCode).toBe('sec')
  })
})
