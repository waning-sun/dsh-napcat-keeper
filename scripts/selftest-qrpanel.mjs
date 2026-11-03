/**
 * 「扫码页」回归自检。
 *
 * 守的是这几个坑：
 *   1. DSH 的 webServer 对外部浏览器一律 403（Browser access is disabled），
 *      所以扫码页必须另有自己的小端口 —— 只挂 DSH 路由等于点不开。
 *   2. 页面里的 qr.png / qr-state / qr-restart 用相对路径，
 *      在 / 下和在 /dsh-napcat-keeper/qr 下都得指对地方。
 *   3. 关掉开关 / 换端口之后，旧 server 必须关掉（不然端口越占越多）。
 *
 * 全程在本机环回、临时 DSH_HOME 上跑，不碰真配置、不碰真 NapCat。
 *   node scripts/selftest-qrpanel.mjs
 */
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

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

/** 临时家目录：所有写操作都落在这里，不碰真实 DSH_HOME */
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'napcat-keeper-qrpanel-'))
process.env.DSH_HOME = tmpHome

const mod = await import('../lib/index.js?t=' + Date.now())
const I = mod.__internals

const freePort = () =>
  new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })

const get = (url, { raw = false } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 8000 }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const body = Buffer.concat(chunks)
        if (raw) return resolve({ status: res.statusCode, headers: res.headers, body })
        let json = null
        try {
          json = JSON.parse(body.toString('utf8'))
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, text: body.toString('utf8'), json })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
  })

const waitListening = async (port, ms = 4000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const okNow = await new Promise((resolve) => {
      const s = net.connect(port, '127.0.0.1')
      s.on('connect', () => {
        s.destroy()
        resolve(true)
      })
      s.on('error', () => resolve(false))
    })
    if (okNow) return true
    await new Promise((r) => setTimeout(r, 60))
  }
  return false
}

console.log('扫码页自检')

/* 1. 配置项默认值 + 归一化 ------------------------------------------------ */
{
  const d = I.resolveConfig({})
  ok(d.qrPanelEnabled === true, '默认开着扫码页')
  ok(d.qrPanelPort === 8899, '默认端口 8899', String(d.qrPanelPort))

  const c = I.normalizeConfig({ qrPanelEnabled: false, qrPanelPort: 70000 })
  ok(c.qrPanelEnabled === false, 'qrPanelEnabled=false 能关掉')
  ok(c.qrPanelPort === 65535, '越界端口被夹到合法上界', String(c.qrPanelPort))
  ok(I.normalizeConfig({ qrPanelPort: 80 }).qrPanelPort === 1024, '小于 1024 的端口被夹到 1024')

  const c2 = I.normalizeConfig({ qrPanelEnabled: 'false', qrPanelPort: 9123 })
  ok(c2.qrPanelEnabled === false, '字符串 "false" 也认作关')
  ok(c2.qrPanelPort === 9123, '合法端口原样保留', String(c2.qrPanelPort))
}

/* 2. 起服务 → 页面 / 状态 / 图片 / 未知路径 ------------------------------- */
const port = await freePort()
const cfg = { ...I.resolveConfig({}), qrPanelEnabled: true, qrPanelPort: port, enabled: false }
I.state.cfg = cfg

{
  const started = I.startQrPanel(cfg)
  ok(started.ok === true, 'startQrPanel 返回 ok')
  ok(await waitListening(port), `127.0.0.1:${port} 真的在听`)

  const pub = I.qrPanelPublic(cfg)
  ok(pub.running === true, 'qrPanelPublic.running = true')
  ok(pub.url === `http://127.0.0.1:${port}/`, '给出的地址带端口', pub.url)
  ok(I.qrPanelUrl(cfg) === pub.url, 'qrPanelUrl 与 qrPanelPublic 一致')
}

{
  const r = await get(`http://127.0.0.1:${port}/`)
  ok(r.status === 200, 'GET / → 200', String(r.status))
  ok(/text\/html/.test(String(r.headers['content-type'] || '')), '/ 是 HTML')
  ok(r.text.includes('扫码'), '页面里有「扫码」字样')
  ok(r.text.includes('qr.png'), '页面用相对路径引 qr.png')
  ok(!/src="\/qr\.png/.test(r.text), '页面没有写死绝对路径（子路径下也能用）')
  ok(r.text.includes('smsbox'), '页面留了短信验证提示的位置')
}

{
  const r = await get(`http://127.0.0.1:${port}/qr-state`)
  ok(r.status === 200, 'GET /qr-state → 200', String(r.status))
  ok(r.json && r.json.ok === true, '/qr-state 返回 ok:true')
  ok(r.json && typeof r.json.qrTtlSec === 'number', '/qr-state 带 qrTtlSec')
  ok(r.json && r.json.panel && r.json.panel.port === port, '/qr-state 里带 panel.port', JSON.stringify(r.json && r.json.panel))
}

{
  const r = await get(`http://127.0.0.1:${port}/qr.png`, { raw: true })
  // 临时家里没有二维码，正常就该是 404；真出过码时是 200 + image/png
  const fine = r.status === 404 || (r.status === 200 && /image\/png/.test(String(r.headers['content-type'] || '')))
  ok(fine, '/qr.png 只会是 404 或 image/png', String(r.status))
}

{
  const r = await get(`http://127.0.0.1:${port}/nope`)
  ok(r.status === 404, '不认识的路径 → 404', String(r.status))
}

{
  // DSH 路由那条是 /dsh-napcat-keeper/qr，靠 serveQrPage 剥前缀，这里用小服务复现
  const r = await get(`http://127.0.0.1:${port}/dsh-napcat-keeper/qr`)
  ok(r.status === 200 && r.text.includes('扫码'), '带 ROUTE 前缀的路径也能出页面', String(r.status))
}

/* 3. 端口被占时给的是人话 ------------------------------------------------ */
{
  const busy = net.createServer()
  await new Promise((r) => busy.listen(0, '127.0.0.1', r))
  const busyPort = busy.address().port
  const cfg2 = { ...cfg, qrPanelPort: busyPort }
  I.startQrPanel(cfg2)
  await new Promise((r) => setTimeout(r, 250))
  const pub = I.qrPanelPublic(cfg2)
  ok(pub.running === false, '端口被占时 running=false')
  ok(/被占/.test(pub.note) || /被占/.test(pub.error), '提示里说了端口被占', pub.note || pub.error)
  await new Promise((r) => busy.close(r))
}

/* 4. 关掉开关 → 端口立刻释放 -------------------------------------------- */
{
  const cfg3 = { ...cfg, qrPanelEnabled: false }
  I.startQrPanel(cfg3)
  const still = await new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
  })
  ok(still === false, '关掉后端口不再接受连接')
  ok(I.qrPanelPublic(cfg3).enabled === false, 'qrPanelPublic.enabled = false')
  ok(I.qrPanelUrl(cfg3) === '', '关掉后不给地址')
}

/* 5. 换端口：旧的就该关掉 ---------------------------------------------- */
{
  const p2 = await freePort()
  I.startQrPanel({ ...cfg, qrPanelPort: port })
  ok(await waitListening(port), '重新打开原端口')
  I.startQrPanel({ ...cfg, qrPanelPort: p2 })
  ok(await waitListening(p2), `换到 ${p2} 后新端口在听`)
  const oldStill = await new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1')
    s.on('connect', () => {
      s.destroy()
      resolve(true)
    })
    s.on('error', () => resolve(false))
  })
  ok(oldStill === false, '换端口后旧端口已释放')
  I.stopQrPanel(cfg, '自检收尾')
}

/* 6. 状态里带 qrPanel（设置页要用） ------------------------------------ */
{
  const st = await I.qrPageState({ ...cfg, qrPanelPort: port })
  ok(st && st.panel && typeof st.panel.enabled === 'boolean', 'qrPageState 带 panel.enabled')
  ok(st && st.sms && typeof st.sms === 'object', 'qrPageState 带 sms')
  ok(st && st.sms && st.sms.url === '', '临时家里没有运行日志时 sms.url 是空串')
}

/* 7. 短信验证：从假日志里抠 ErrCode / proofWaterUrl --------------------- */
{
  const shell = path.join(tmpHome, 'fake-napcat')
  fs.mkdirSync(shell, { recursive: true })
  fs.writeFileSync(
    path.join(shell, '_run.log'),
    '01-01 00:00:01 [INFO] start\n01-01 00:00:02 [ERROR] ErrCode: 46\n' +
      'proofWaterUrl: https://tn.qq.com/proof?x=1\n01-01 00:00:03 Login Success\n',
    'latin1',
  )
  const cfg4 = { ...cfg, shellDir: shell.replace(/\\/g, '/'), qrPanelPort: port }
  const st = await I.qrPageState(cfg4)
  ok(st.sms.code === 46, '能抠到 ErrCode', String(st.sms.code))
  ok(st.sms.url === 'https://tn.qq.com/proof?x=1', '能抠到 proofWaterUrl', st.sms.url)
  ok(st.sms.success === true, '能认出「登录成功」')
  ok(st.sms.needSms === false, '登录成功之后的老 ErrCode 不算「这次要验证」')
  ok(st.sms.file.includes('_run.log'), '记录读的是哪个文件', st.sms.file)

  /* 登录成功之后又冒出 ErrCode = 这次真的要短信验证（时间戳用「现在」，否则会被判成过期） */
  const now2 = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  const stamp = `${p2(now2.getMonth() + 1)}-${p2(now2.getDate())} ${p2(now2.getHours())}:${p2(now2.getMinutes())}:${p2(now2.getSeconds())}`
  fs.writeFileSync(
    path.join(shell, '_run.log'),
    `${stamp} Login Success\n${stamp} [error] ErrCode: 46\n${stamp} [info] 需要验证码, proofWaterUrl:  https://tn.qq.com/proof?x=2\n`,
    'latin1',
  )
  const st2 = await I.qrPageState(cfg4)
  ok(st2.sms.needSms === true, '登录后又掉线 → 判定要短信验证')
  ok(st2.sms.url === 'https://tn.qq.com/proof?x=2', '拿到新的验证链接', st2.sms.url)

  /* 很老的验证链接就别拿出来让人点了 */
  fs.writeFileSync(
    path.join(shell, '_run.log'),
    `01-01 00:10:00 [error] ErrCode: 46\n01-01 00:10:00 [info] 需要验证码, proofWaterUrl:  https://tn.qq.com/proof?old=1\n`,
    'latin1',
  )
  const st3 = await I.qrPageState(cfg4)
  ok(st3.sms.url === '', '过期（>30 分钟）的验证链接被丢掉')
  ok(st3.sms.urlStale === true, '并且标了 urlStale')
}

fs.rmSync(tmpHome, { recursive: true, force: true })

console.log('')
console.log(`扫码页：${pass} 过 / ${fail} 挂`)
if (fail) process.exitCode = 1
