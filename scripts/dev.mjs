// 一键启动：同时拉起模拟数据引擎（server/）和前端开发服务器（client/）
// 任一子进程异常退出或无法启动时，终止另一个并以非零码退出，保留失败原因；Ctrl+C 正常停止时退出码为 0
import { spawn } from 'node:child_process'

const procs = []
let shuttingDown = false
let exitCode = 0
// npm 不会把终止信号转发给它拉起的 node/vite，所以每个子进程单独成组，终止时按进程组发信号，不留孤儿
const grouped = process.platform !== 'win32'
function kill(p, signal) {
  try { if (grouped) process.kill(-p.pid, signal); else p.kill(signal) } catch { /* 进程组已不存在 */ }
}

function run(name, args) {
  const p = spawn('npm', args, { stdio: 'inherit', shell: false, detached: grouped })
  p.on('error', (error) => {
    console.error(`[${name}] 无法启动：${error.message}`)
    fail(1)
  })
  p.on('exit', (code, signal) => {
    console.log(`[${name}] exited with ${signal ? `signal ${signal}` : `code ${code}`}`)
    // 用户停止时子进程退出属于预期；否则子进程自行退出即视为失败（非零码原样保留）
    if (!shuttingDown) fail(code === 0 ? 1 : code ?? 1)
  })
  procs.push(p)
}

function fail(code) {
  exitCode = code
  shutdown()
}

const finished = (p) => p.exitCode !== null || p.signalCode !== null
// 子进程及其整个进程组都退出才算结束：npm 包装进程先退、vite 等后代忽略 SIGTERM 时不能提前返回，否则端口仍被占着
function gone(p) {
  if (!finished(p)) return false
  if (!grouped) return true
  try { process.kill(-p.pid, 0); return false } catch { return true }
}
function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  for (const p of procs) if (!gone(p)) kill(p, 'SIGTERM')
  // 等全部进程组结束再退出，本次启动占用的端口随之释放；5 秒仍未结束则强杀整组
  const wait = () => {
    if (procs.every(gone)) process.exit(exitCode)
    else setTimeout(wait, 100)
  }
  wait()
  setTimeout(() => {
    for (const p of procs) if (!gone(p)) kill(p, 'SIGKILL')
    process.exit(exitCode)
  }, 5000).unref()
}
process.on('SIGINT', () => shutdown())
process.on('SIGTERM', () => shutdown())

run('server', ['--prefix', 'server', 'run', 'start'])
run('client', ['--prefix', 'client', 'run', 'dev'])
