/**
 * 「在线探测」回归自检。
 *
 * 守的是这次适配反向 WebSocket 的那个坑：老版本 postOneBot 只看 body 不看状态码，
 * 于是 dsh-onebot-qq 之类反向 WS 服务占着端口时（HTTP 换来 401/426），
 * 一律被当成「端口不通」→ 卡死判定 → 杀掉重拉 → 无限循环。
 *
 * 现在 probe() 要能把这几种情况分清楚：
 *   200 OneBot JSON → online / http
 *   426              → reverse（端口只收 WebSocket）
 *   401              → auth（令牌不对）或 reverse（有客户端连进来时）
 *   端口没人听        → dead
 *   probeMode=process→ 直接不碰端口
 *
 * 全程在本地环回上起假服务器，端口用临时的，不碰真配置、不碰真 NapCat。
 *   node scripts/selftest-probe.mjs
 */
import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    console.log(`  ✗ ${name}${extra ? '  — ' + extra : ''}`)
  }
}

const loadInternals = async () => (await import('../lib/index.js?t=' + Date.now())).__internals

/** 起一个假服务器，返回 { port, close } */
const serve = (handler) =>
  new Promise((resolve) => {
    const srv = http.createServer(handler)
    srv.listen(0, '127.0.0.1', () => {
      resolve({
        port: srv.address().port,
        close: () => new Promise((r) => srv.close(r)),
      })
    })
  })

/** 找一个没人用的端口（开着再关掉），用来模拟「端口没开」 */
const deadPort = () =>
  new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })

/** 起一个孩子进程，朝 port 建一条常连接（模拟 NapCat 反向连进来） */
const connectAndHold = (port) => {
  const code =
    `const net=require('net');` +
    `const s=net.connect(${port},'127.0.0.1',()=>{process.stdout.write('up\\n')});` +
    's.on("error",()=>{});' +
    'setInterval(()=>{},1000)'
  const child = spawn(process.execPath, ['-e', code], { stdio: 'ignore', windowsHide: true })
  return {
    child,
    up: () => new Promise((r) => setTimeout(r, 900)),
    stop: () => {
      try {
        child.kill()
      } catch {}
    },
  }
}

const { probe: probeRaw, portClients, PROBE_MODES } = await loadInternals()
/**
 * 这个自检只看「端口本身」的行为，把「跟随 dsh-onebot-qq」钉死成关：
 * 否则会去读本机真的 ~/.dsh，装了那个插件的人跑测试结果就不一样了。
 */
const probe = (cfg) => probeRaw(cfg, { companion: null })

/* 1. 普通 NapCat HTTP 接口 ------------------------------------------------- */
console.log('1) 端口上是正常的 OneBot HTTP 接口')
let port1
{
  const srv = await serve((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', retcode: 0, data: { user_id: 10086, nickname: '测试号' } }))
  })
  port1 = srv.port
  const health = await probe({ onebotPort: port1, accessToken: '', probeMode: 'auto' })
  ok(health.online === true, '判为在线')
  ok(health.mode === 'http', 'mode = http', health.mode)
  ok(health.status === 200, '抓到 HTTP 200', String(health.status))
  await srv.close()
}

/* 2. 只收 WebSocket 的端口：426，且没人连 -------------------------------- */
console.log('\n2) 端口只收 WebSocket（426）、还没有客户端连进来')
let port2
{
  const srv = await serve((req, res) => {
    res.writeHead(426, { 'content-type': 'text/plain' })
    res.end('Upgrade Required')
  })
  port2 = srv.port
  const health = await probe({ onebotPort: port2, accessToken: '', probeMode: 'auto' })
  ok(health.online === false, '没客户端时不判在线')
  ok(health.mode === 'reverse', 'mode = reverse', health.mode)
  ok(health.portAlive === true, '认得出「端口是活的」', JSON.stringify(health.portAlive))
  ok(health.status === 426, '抓到 HTTP 426', String(health.status))
  const links = await portClients({ onebotPort: port2 }, 0)
  ok(links.count === 0 || links.count === null, '客户端数 = 0 或查不到（不是 1）', String(links.count))
  await srv.close()
}

/* 3. 426 + 真有客户端连进来 → 反向 WS 在线 -------------------------------- */
console.log('\n3) 反向 WS：端口上有客户端连进来了')
{
  const srv = await serve((req, res) => {
    res.writeHead(426, { 'content-type': 'text/plain' })
    res.end('Upgrade Required')
  })
  const client = connectAndHold(srv.port)
  await client.up()
  const health = await probe({ onebotPort: srv.port, accessToken: '', probeMode: 'auto' })
  ok(health.mode === 'reverse', 'mode = reverse', health.mode)
  ok(health.online === true, '有客户端就判在线')
  ok(health.clients !== null && health.clients >= 1, '数到了客户端', String(health.clients))
  client.stop()
  await srv.close()
}

/* 4. 401：可能是反向 WS 服务，也可能是令牌不对 --------------------------- */
console.log('\n4) 端口回 401')
{
  const srv = await serve((req, res) => {
    res.writeHead(401, { 'content-type': 'text/plain' })
    res.end('Unauthorized')
  })
  const health = await probe({ onebotPort: srv.port, accessToken: '', probeMode: 'auto' })
  ok(health.mode === 'auth', '没客户端时判 auth（多半是令牌不对）', health.mode)
  ok(health.online === false, '不判在线')
  ok(health.portAlive === true, '但仍认得出端口是活的（所以不会去杀进程）')
  ok(String(health.hint || '').includes('401'), '给得出 401 的提示', health.hint)
  await srv.close()
}

/* 5. 端口没开 ------------------------------------------------------------ */
console.log('\n5) 端口没人听')
{
  const port = await deadPort()
  const health = await probe({ onebotPort: port, accessToken: '', probeMode: 'auto' })
  ok(health.online === false, '不判在线')
  ok(health.mode === 'dead', 'mode = dead', health.mode)
  ok(health.portAlive === false, 'portAlive = false')
  ok(health.status === 0, '没有 HTTP 状态码', String(health.status))
}

/* 6. probeMode 的几种强制值 --------------------------------------------- */
console.log('\n6) probeMode 强制值')
{
  const srv = await serve((req, res) => {
    res.writeHead(426)
    res.end('Upgrade Required')
  })
  const asProcess = await probe({ onebotPort: srv.port, accessToken: '', probeMode: 'process' })
  ok(asProcess.mode === 'process', 'process：连端口都不看', asProcess.mode)
  const asHttp = await probe({ onebotPort: srv.port, accessToken: '', probeMode: 'http' })
  ok(asHttp.mode === 'auth' || asHttp.mode === 'http', 'http：不认反向（判成 auth/http）', asHttp.mode)
  const asReverse = await probe({ onebotPort: srv.port, accessToken: '', probeMode: 'reverse' })
  ok(asReverse.mode === 'reverse', 'reverse：直接按反向 WS 处理', asReverse.mode)
  const bad = await probe({ onebotPort: srv.port, accessToken: '', probeMode: '乱填' })
  ok(bad.mode === 'reverse', '乱填的 probeMode 退回 auto（这里应判成 reverse）', bad.mode)
  await srv.close()
}

/* 7. 归一化 -------------------------------------------------------------- */
console.log('\n7) 配置归一化')
{
  const { normalizeConfig } = await loadInternals()
  ok(normalizeConfig({ probeMode: 'REVERSE' }).probeMode === 'reverse', '大小写归一')
  ok(normalizeConfig({ probeMode: '' }).probeMode === 'auto', '空值 → auto')
  ok(normalizeConfig({ probeMode: 'xyz' }).probeMode === 'auto', '非法值 → auto')
  ok(PROBE_MODES.has('auto') && PROBE_MODES.has('reverse'), 'PROBE_MODES 导出可用')
}

console.log(`\n结果：${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
