// 一键启动：同时拉起模拟数据引擎（server/）和前端开发服务器（client/）
import { spawn } from 'node:child_process'

const procs = []
function run(name, args) {
  const p = spawn('npm', args, { stdio: 'inherit', shell: false })
  p.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`)
    shutdown()
  })
  procs.push(p)
}

function shutdown() {
  for (const p of procs) {
    if (!p.killed) p.kill('SIGTERM')
  }
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

run('server', ['--prefix', 'server', 'run', 'start'])
run('client', ['--prefix', 'client', 'run', 'dev'])
