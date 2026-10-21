// 告警处置接口：POST /alerts/:id/status，引擎校验状态流转后返回更新后的告警
import type { AlertStatus, AnomalyEvent } from '../stores/dashboard'

const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '')
const ERROR_TEXT: Record<string, string> = {
  alert_not_found: '告警不存在或已过期',
  invalid_status: '状态无效',
  invalid_transition: '状态流转不允许',
  already_closed: '告警已关闭',
}

export async function postAlertStatus(id: number, status: AlertStatus, by = '大屏值班'): Promise<AnomalyEvent> {
  const res = await fetch(`${apiBase}/alerts/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, by }),
  })
  const body = await res.json().catch(() => ({})) as { alert?: AnomalyEvent; error?: string }
  if (!res.ok || !body.alert) throw new Error(ERROR_TEXT[body.error ?? ''] ?? `接口返回 HTTP ${res.status}`)
  return body.alert
}
