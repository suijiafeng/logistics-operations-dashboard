import { load } from '@amap/amap-jsapi-loader'
import type { AMapNamespace } from './amapTypes'
import type { AmapConfig } from './amapEnv'

declare global {
  interface Window {
    /** 高德 JS API 2.0 要求在加载脚本前设置安全密钥，不能写进地图请求参数里凑合 */
    _AMapSecurityConfig?: { securityJsCode: string }
    /** 高德在无法识别的平台上默认不用 WebGL，官方 mapStyle 也就不会着色 */
    forceWebGL?: boolean
  }
}

const LOAD_TIMEOUT_MS = 12_000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('高德脚本加载超时')), ms)
    promise.then((value) => {
      clearTimeout(timer)
      resolve(value)
    }, (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

/**
 * 加载高德 JS API。本模块只被轨迹地图组件引用，而该组件在没有 key 时不会挂载，
 * 因此首屏不会去请求 webapi.amap.com。
 */
export async function loadAmap(config: AmapConfig): Promise<AMapNamespace> {
  if (!config.enabled) throw new Error('未配置高德 Key')
  if (config.securityJsCode) window._AMapSecurityConfig = { securityJsCode: config.securityJsCode }
  // 必须在脚本执行前设置。高德把识别不出的平台记成 other，并因此关闭 WebGL，底图停在浅色栅格上。
  try {
    const probe = document.createElement('canvas')
    if (probe.getContext('webgl2') || probe.getContext('webgl')) window.forceWebGL = true
  } catch { /* 没有 WebGL 时沿用高德默认渲染 */ }
  const namespace = await withTimeout(load({ key: config.key, version: '2.0', plugins: ['AMap.DistrictSearch'] }), LOAD_TIMEOUT_MS)
  return namespace as AMapNamespace
}
