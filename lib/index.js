/**
 * dsh-napcat-keeper —— NapCat 看门狗 v2.0.0（可发布通用版）
 *
 * 解决的问题：DSH 是桌面应用，重启 DSH 时 NapCat(QQ 协议端) 不会跟着起来，
 * 于是 dsh-qq-bridge 一直轮询一个死端口，你在 QQ 里说的话就石沉大海。
 *
 * v2.0.0：从「一台机器专用」改成通用款
 *   - 所有机器相关的路径都不再写死，改为「设置 → napcat桥」里填，或自动探测；
 *   - 新增设置界面（lib/client.js）：状态 / 配置 / 一键动作 / 日志，保存即热生效；
 *   - 计划任务不存在时自动创建（用户级，无需管理员），保证拉起的 QQ 链不随 DSH 退出；
 *   - 只填 QQ 号也能用：自动生成直接调 NapCatWinBootMain.exe 的启动脚本。
 *
 * v1.1.x 修掉的真 bug（实测踩到，保留记录）：
 *   1. 重复拉起：只看「有没有进程」就决定拉不拉，两条链同时存活时两个 QQ 客户端互踢，
 *      账号被强制下线 → 掉进扫码模式。现在先做链去重（启动时间聚类），拉起前过跨进程锁。
 *   2. 卡在扫码不再升级：现在扫码超时会杀掉重来，重试超上限后明确 giveup 并大声记日志。
 *   3. 杀进程范围算错：root 曾多套一层，会去匹配用户目录下任何 QQ.exe。
 *
 * 只依赖 node 内置模块，不需要构建。看门狗自己绝不能把 DSH 启动搞崩。
 */

import { execFileSync, spawn } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

export const name = 'napcat-keeper'
export const version = '2.0.1'

/** tools 用来注册 napcat_* 工具；webServer 用来挂设置界面接口。拿不到也不至于把 DSH 拖崩。 */
export const inject = ['tools', 'webServer']

const DEFAULTS = {
  enabled: true,
  /** NapCat Shell 目录（启动脚本所在目录）；留空则自动探测 */
  shellDir: '',
  /** 启动脚本名或绝对路径；留空则自动探测（quick / napcat*.bat） */
  launcherScript: '',
  /** 想快登的 QQ 号；填了且启动脚本不存在时，会自动生成一个直接调 NapCatWinBootMain.exe 的 bat */
  launchAccount: '',
  /** 追加给启动脚本的参数（空格分隔），一般不用填 */
  launchArgs: '',
  /** OneBot 11 HTTP 端口 */
  onebotPort: 3000,
  /** OneBot access token，没有就留空 */
  accessToken: '',
  /** 只在这些路径下找 QQ/NapCat 进程；留空 = 由 shellDir 推导（上层目录） */
  procPathMatch: '',
  /** 复查间隔（秒） */
  probeIntervalSec: 45,
  /** 拉起后给它的宽限期（秒），期间不重复拉起 */
  launchGraceSec: 150,
  /** 二维码新鲜度窗口（秒）：二维码比这新 = 在等人扫 */
  qrFreshSec: 300,
  /** 等扫码多久还没上线就杀掉重来（秒） */
  scanTimeoutSec: 300,
  /** 扫码重试上限，超过就 giveup（不再反复杀进程） */
  maxScanRetries: 2,
  /** 进程在但端口不通、又没有任何新信号的卡死判定（秒） */
  stuckSec: 420,
  /** 心跳日志间隔（秒） */
  heartbeatSec: 600,
  /** 同一条链的启动时间聚类窗口（秒）；两批启动相隔超过它就算两条重复链 */
  chainGapSec: 120,
  /** 单条链应有的 QQ.exe 进程数上限（仅作参考，判断重复用启动时间聚类） */
  maxQqPerChain: 4,
  /** 优先用这个计划任务拉起（父进程是任务计划服务，不随 DSH 重启死掉）；空 = 只用 cscript */
  taskName: 'NapCat-Keeper-Launch',
  /** 计划任务不存在时自动创建（用户级，不需要管理员） */
  autoCreateTask: true,
  /** 拉起时不显示黑框：用 wscript 壳把控制台窗口藏起来（桌面干净） */
  hideConsole: true,
  /** 设置界面存下来的配置（优先级高于 cordis 里的 config） */
  configPath: '',
  /** 拉起脚本的输出落这里 */
  launcherLog: '',
  /** 看门狗自己的日志 */
  logPath: '',
  /** 跨进程拉起锁 */
  lockPath: '',
  /** 状态快照 */
  statePath: '',
  /** 二维码副本（方便 agent 或你自己直接看图） */
  qrCopyPath: '',
  /** qq-bridge 的 state 文件 */
  bridgeStatePath: '',
  /** 桥接 state 超过这么多秒没更新就提醒 */
  bridgeStaleSec: 180,
  /** 日志超过多少字节就滚动一次 */
  maxLogBytes: 1024 * 1024,
}

const state = {
  phase: 'idle', // idle | online | launching | starting | need-scan | need-scan-giveup | offline
  lastProbeAt: null,
  lastOnlineAt: 0,
  lastLaunchAt: 0,
  lastError: '',
  launchCount: 0,
  dedupeCount: 0,
  scanSince: 0,
  scanRetries: 0,
  lastHeartbeatAt: 0,
  lastDupCheckAt: 0,
  timer: null,
  cfg: null,
  lastSnapshot: null,
}

/* ------------------------------------------------------------------ */
/* 基础设施                                                            */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || path.join(homedir(), '.dsh')
}

/** 设置界面写的那份配置（JSON，无 BOM） */
function configFilePath(cfgOrHome) {
  const home = typeof cfgOrHome === 'string' ? cfgOrHome : dshHome()
  if (cfgOrHome && typeof cfgOrHome === 'object' && cfgOrHome.configPath) return cfgOrHome.configPath
  return path.join(home, 'napcat-keeper-config.json')
}

function readConfigFile(home) {
  const file = configFilePath(home)
  try {
    if (!existsSync(file)) return {}
  } catch {
    return {}
  }
  try {
    const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeConfigFile(home, data) {
  const file = configFilePath(home)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return file
}

/* ---- 自动探测：让新用户不用手填一堆路径 ---------------------------- */

function looksLikeShellDir(dir) {
  try {
    if (!statSync(dir).isDirectory()) return false
  } catch {
    return false
  }
  try {
    return readdirSync(dir).some((f) => /\.bat$/i.test(f))
  } catch {
    return false
  }
}

function findShellDirs(root, depth, out) {
  if (depth < 0 || out.length > 12) return
  let entries = []
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const full = path.join(root, entry.name)
    if (/shell$/i.test(entry.name) && looksLikeShellDir(full)) out.push(full)
    else findShellDirs(full, depth - 1, out)
  }
}

/** 扫常见位置找 NapCat Shell 目录 */
function detectShellDir() {
  const home = homedir()
  const roots = [
    path.join(home, 'NapCat'),
    path.join(home, 'Documents', 'NapCat'),
    path.join(home, 'Desktop', 'NapCat'),
    'C:\\NapCat',
    'D:\\NapCat',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'NapCat') : '',
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'NapCat') : '',
  ].filter(Boolean)
  for (const root of roots) {
    const out = []
    try {
      if (!statSync(root).isDirectory()) continue
    } catch {
      continue
    }
    findShellDirs(root, 3, out)
    if (out.length) {
      // 有多个就挑路径最短（=层级最浅）的那个
      out.sort((a, b) => a.length - b.length)
      return out[0].replace(/\\/g, '/')
    }
  }
  return ''
}

/** 在 shellDir 里挑启动脚本：先挑「写死了这个 QQ 号」的，其次 quick，其次 napcat*.bat */
function detectLauncher(shellDir, account = '') {
  if (!shellDir) return ''
  let files = []
  try {
    files = readdirSync(shellDir).filter((f) => /\.bat$/i.test(f))
  } catch {
    return ''
  }
  const want = String(account || '').replace(/\D/g, '')
  if (want) {
    for (const file of files) {
      try {
        const text = readFileSync(path.join(shellDir, file), 'utf8')
        if (text.includes(want)) return file
      } catch {}
    }
  }
  const quick = files.find((f) => /quick/i.test(f))
  if (quick) return quick
  const napcat = files.find((f) => /napcat/i.test(f))
  if (napcat) return napcat
  return files[0] || ''
}

/** PowerShell 的 -like 只认反斜杠 */
function psPath(value) {
  return String(value || '').replace(/\//g, '\\')
}

/** 进程路径前缀（原样，给 PowerShell 的 -like 用） */
function procRootRaw(cfg) {
  const explicit = String(cfg.procPathMatch || '').trim()
  return explicit || (cfg.shellDir ? path.dirname(path.dirname(cfg.shellDir)) : '')
}

/** 进程路径前缀：配置优先，其次由 shellDir 推上两层 */
function procRoot(cfg) {
  return procRootRaw(cfg).toLowerCase().replace(/\\/g, '/')
}

const clampNum = (value, min, max, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeConfig(cfg) {
  cfg.enabled = cfg.enabled !== false && cfg.enabled !== 'false'
  cfg.autoCreateTask = cfg.autoCreateTask !== false && cfg.autoCreateTask !== 'false'
  cfg.shellDir = String(cfg.shellDir || '').trim().replace(/"/g, '')
  cfg.launcherScript = String(cfg.launcherScript || '').trim().replace(/"/g, '')
  cfg.launchAccount = String(cfg.launchAccount || '').trim().replace(/\D/g, '')
  cfg.launchArgs = String(cfg.launchArgs || '').trim()
  cfg.accessToken = String(cfg.accessToken || '').trim()
  cfg.procPathMatch = String(cfg.procPathMatch || '').trim()
  cfg.taskName = String(cfg.taskName || '').trim()
  cfg.onebotPort = clampNum(cfg.onebotPort, 1, 65535, 3000)
  cfg.probeIntervalSec = clampNum(cfg.probeIntervalSec, 10, 3600, 45)
  cfg.launchGraceSec = clampNum(cfg.launchGraceSec, 20, 3600, 150)
  cfg.qrFreshSec = clampNum(cfg.qrFreshSec, 30, 3600, 300)
  cfg.scanTimeoutSec = clampNum(cfg.scanTimeoutSec, 30, 7200, 300)
  cfg.maxScanRetries = clampNum(cfg.maxScanRetries, 0, 20, 2)
  cfg.stuckSec = clampNum(cfg.stuckSec, 60, 7200, 420)
  cfg.heartbeatSec = clampNum(cfg.heartbeatSec, 60, 86400, 600)
  cfg.chainGapSec = clampNum(cfg.chainGapSec, 10, 3600, 120)
  cfg.maxQqPerChain = clampNum(cfg.maxQqPerChain, 1, 40, 4)
  cfg.bridgeStaleSec = clampNum(cfg.bridgeStaleSec, 30, 86400, 180)
  cfg.hideConsole = cfg.hideConsole !== false && cfg.hideConsole !== 'false' && cfg.hideConsole !== 0
  return cfg
}

function resolveConfig(raw) {
  const home = dshHome()
  // 优先级：内置默认 < cordis 里的 config < 设置界面存下来的 json
  const cfg = { ...DEFAULTS, ...(raw || {}), ...readConfigFile(home) }
  normalizeConfig(cfg)
  if (!cfg.shellDir) cfg.shellDir = detectShellDir()
  if (!cfg.launcherScript) cfg.launcherScript = detectLauncher(cfg.shellDir, cfg.launchAccount)
  if (!cfg.logPath) cfg.logPath = path.join(home, 'napcat-keeper.log')
  if (!cfg.launcherLog) cfg.launcherLog = path.join(home, 'napcat-keeper-launch.log')
  if (!cfg.lockPath) cfg.lockPath = path.join(home, 'napcat-keeper.lock.json')
  if (!cfg.statePath) cfg.statePath = path.join(home, 'napcat-keeper-state.json')
  if (!cfg.qrCopyPath) cfg.qrCopyPath = path.join(home, 'napcat-qr.png')
  if (!cfg.bridgeStatePath) cfg.bridgeStatePath = path.join(home, 'qq-bridge-state.json')
  if (!cfg.configPath) cfg.configPath = configFilePath(home)
  return cfg
}

function log(cfg, message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  try {
    mkdirSync(path.dirname(cfg.logPath), { recursive: true })
    try {
      if (existsSync(cfg.logPath) && statSync(cfg.logPath).size > cfg.maxLogBytes) {
        writeFileSync(cfg.logPath, line)
        return
      }
    } catch {}
    appendFileSync(cfg.logPath, line)
  } catch {}
}

/** 起子进程抓 stdout（powershell / tasklist 这类廉价查询用） */
function runCapture(file, args, timeoutMs = 12000) {
  return new Promise((resolve) => {
    let buffer = ''
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let child
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      return done('')
    }
    const guard = setTimeout(() => {
      try {
        child.kill()
      } catch {}
      done(buffer)
    }, timeoutMs)
    guard.unref?.()
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      buffer += chunk
    })
    child.on('error', () => {
      clearTimeout(guard)
      done(buffer)
    })
    child.on('close', () => {
      clearTimeout(guard)
      done(buffer)
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* OneBot                                                             */
/* ------------------------------------------------------------------ */

function postOneBot(cfg, action, payload, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const body = JSON.stringify(payload || {})
    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    }
    if (cfg.accessToken) headers.authorization = `Bearer ${cfg.accessToken}`
    let req
    try {
      req = http.request(
        {
          host: '127.0.0.1',
          port: cfg.onebotPort,
          path: `/${action}`,
          method: 'POST',
          headers,
          timeout: timeoutMs,
        },
        (res) => {
          let buf = ''
          res.setEncoding('utf8')
          res.on('data', (c) => {
            buf += c
          })
          res.on('end', () => {
            try {
              resolve(JSON.parse(buf))
            } catch {
              resolve({ retcode: -1, raw: String(buf).slice(0, 200) })
            }
          })
        },
      )
    } catch (error) {
      return resolve({ retcode: -1, error: String((error && error.message) || error) })
    }
    req.on('timeout', () => {
      try {
        req.destroy(new Error('timeout'))
      } catch {}
      resolve({ retcode: -1, error: 'timeout' })
    })
    req.on('error', (error) => resolve({ retcode: -1, error: String((error && error.message) || error) }))
    try {
      req.write(body)
      req.end()
    } catch (error) {
      resolve({ retcode: -1, error: String((error && error.message) || error) })
    }
  })
}

async function probe(cfg) {
  const login = await postOneBot(cfg, 'get_login_info')
  const data = login && login.data
  const online = Boolean(login && login.retcode === 0 && data && (data.user_id || data.uin))
  return {
    online,
    retcode: login && login.retcode,
    nickname: online ? data.nickname : '',
    userId: online ? data.user_id || data.uin : '',
    error: online ? '' : String((login && (login.error || login.raw || login.wording)) || 'no response'),
  }
}

/* ------------------------------------------------------------------ */
/* 进程链 / 二维码 / 桥接新鲜度                                          */
/* ------------------------------------------------------------------ */

function napcatRoot(cfg) {
  // .../NapCat/OneKey/NapCat.52230.Shell -> .../NapCat
  return path.dirname(path.dirname(cfg.shellDir))
}

const PS_PROCS =
  "$ErrorActionPreference='SilentlyContinue';" +
  "Get-Process QQ,NapCatWinBootMain | " +
  'ForEach-Object { $p=$null; try { $p=$_.Path } catch {}; ' +
  '[pscustomobject]@{ n=$_.ProcessName; id=$_.Id; t=[int64]($_.StartTime.ToUniversalTime() - ' +
  '([datetime]::new(1970,1,1,0,0,0,[System.DateTimeKind]::Utc))).TotalMilliseconds; p=$p } } | ' +
  'ConvertTo-Json -Compress'

/**
 * 进程快照（带启动时间，用来判断「刚拉起」和「重复链」）。
 * powershell 挂掉时退化到 tasklist 的计数，保证看门狗不会因为拿不到时间就瞎拉。
 */
async function probeProcs(cfg) {
  const root = procRoot(cfg)
  const out = await runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_PROCS], 15000)
  const result = { boot: 0, qq: 0, chains: 0, dup: false, newestStartMs: 0, chainStarts: [], pids: [], source: 'ps' }
  let list = []
  if (out && out.trim()) {
    try {
      const parsed = JSON.parse(out)
      list = Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      list = []
    }
  }
  const starts = []
  if (list.length) {
    for (const p of list) {
      const pth = String(p.p || '').toLowerCase().replace(/\\/g, '/')
      if (!pth || (root && !pth.startsWith(root))) continue
      result.pids.push(Number(p.id))
      const t = Number(p.t) || 0
      if (t > result.newestStartMs) result.newestStartMs = t
      if (t > 0) starts.push(t)
      if (String(p.n).toLowerCase() === 'napcatwinbootmain') result.boot += 1
      else result.qq += 1
    }
  } else {
    // 退化路径：只数次数
    const tl = await runCapture('tasklist.exe', ['/NH', '/FO', 'CSV'], 10000)
    result.boot = (tl.match(/"NapCatWinBootMain\.exe"/gi) || []).length
    result.qq = (tl.match(/"QQ\.exe"/gi) || []).length
    result.source = 'tasklist'
  }

  // 一条链里的 QQ.exe 有 1~4 个（主进程 + 渲染子进程），个数不能当链数；
  // 真正的判据是「启动时间聚类」：同一批启动时间聚成一条链，间隔超过 chainGapSec 就算另一条。
  starts.sort((a, b) => a - b)
  const clusters = []
  for (const t of starts) {
    const last = clusters[clusters.length - 1]
    if (last && t - last.lastMs <= cfg.chainGapSec * 1000) {
      last.lastMs = t
      last.count += 1
    } else {
      clusters.push({ firstMs: t, lastMs: t, count: 1 })
    }
  }
  result.chainStarts = clusters.map((c) => new Date(c.firstMs).toISOString())
  result.chains = clusters.length
  result.clusters = clusters.map((c) => ({ firstMs: c.firstMs, lastMs: c.lastMs, count: c.count }))
  result.dup = result.boot > 1 || clusters.length > 1
  return result
}

/** 找 versions/<ver>/resources/app/napcat/cache/qrcode.png，取最新的那张 */
function qrInfo(cfg) {
  try {
    const versionsDir = path.join(cfg.shellDir, 'versions')
    if (!existsSync(versionsDir)) return null
    let newest = null
    for (const entry of readdirSync(versionsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const file = path.join(versionsDir, entry.name, 'resources', 'app', 'napcat', 'cache', 'qrcode.png')
      try {
        const st = statSync(file)
        if (!newest || st.mtimeMs > newest.mtimeMs) newest = { file, mtimeMs: st.mtimeMs }
      } catch {}
    }
    if (!newest) return null
    const ageSec = Math.round((Date.now() - newest.mtimeMs) / 1000)
    let copy = ''
    if (ageSec <= cfg.qrFreshSec) {
      try {
        mkdirSync(path.dirname(cfg.qrCopyPath), { recursive: true })
        copyFileSync(newest.file, cfg.qrCopyPath)
        copy = cfg.qrCopyPath
      } catch {}
    }
    return { file: newest.file, ageSec, copy }
  } catch {
    return null
  }
}

function bridgeAge(cfg) {
  try {
    const st = statSync(cfg.bridgeStatePath)
    return { path: cfg.bridgeStatePath, ageSec: Math.round((Date.now() - st.mtimeMs) / 1000) }
  } catch {
    return { path: cfg.bridgeStatePath, ageSec: null }
  }
}

/* ------------------------------------------------------------------ */
/* 跨进程拉起锁                                                         */
/* ------------------------------------------------------------------ */

function pidAlive(pid) {
  if (!pid || pid === process.pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readLock(cfg) {
  try {
    if (!existsSync(cfg.lockPath)) return null
    const raw = JSON.parse(readFileSync(cfg.lockPath, 'utf8'))
    if (!raw || typeof raw !== 'object') return null
    return raw
  } catch {
    return null
  }
}

/** 锁被别的活着的进程持有时返回 true，这次就不拉 */
function lockBlocked(cfg) {
  const lock = readLock(cfg)
  if (!lock) return false
  const ageMs = Date.now() - Number(lock.ts || 0)
  if (ageMs > cfg.launchGraceSec * 1000) return false // 过期锁，忽略
  if (pidAlive(Number(lock.pid))) return true
  // pid 不同但时间很近：可能是同一插件在别的 DSH 实例里刚拉过，保守起见也算占用
  return ageMs < 20000
}

function writeLock(cfg) {
  try {
    mkdirSync(path.dirname(cfg.lockPath), { recursive: true })
    writeFileSync(cfg.lockPath, JSON.stringify({ pid: process.pid, ts: Date.now() }, null, 2), 'utf8')
  } catch {}
}

function clearLock(cfg) {
  try {
    if (existsSync(cfg.lockPath)) unlinkSync(cfg.lockPath)
  } catch {}
}

/* ------------------------------------------------------------------ */
/* 拉起 / 杀掉 NapCat                                                  */
/* 首选：计划任务（父进程 = 任务计划服务，DSH 重启/退出都牵连不到它）      */
/* 兜底：cscript → WScript.Run（父进程仍在 DSH 进程树里，DSH 一退就跟着死）*/
/* ------------------------------------------------------------------ */

/** 计划任务是否可用；结果缓存进 state，避免每次 tick 都跑 schtasks */
function taskReady(cfg) {
  if (!cfg.taskName) return false
  if (state.taskReady !== undefined) return state.taskReady
  try {
    execFileSync('schtasks.exe', ['/query', '/tn', cfg.taskName], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 8000,
    })
    state.taskReady = true
  } catch {
    state.taskReady = false
    log(cfg, `task "${cfg.taskName}" 不可用，退回 cscript 拉起`)
  }
  return state.taskReady
}

/** 找启动脚本：配置的绝对/相对路径 → 自动探测 → 用 QQ 号现生成一个 */
function resolveLauncherPath(cfg) {
  const raw = String(cfg.launcherScript || '').trim()
  if (raw) {
    const asIs = path.isAbsolute(raw) ? raw : path.join(cfg.shellDir || '', raw)
    if (existsSync(asIs)) return asIs
  }
  if (cfg.shellDir) {
    const guessed = detectLauncher(cfg.shellDir, cfg.launchAccount)
    if (guessed) return path.join(cfg.shellDir, guessed)
  }
  if (cfg.shellDir && cfg.launchAccount) {
    // 用户只填了 QQ 号：直接调 NapCatWinBootMain.exe，不依赖别人的 quick bat
    const boot = findBootMain(cfg.shellDir)
    if (boot) {
      const file = path.join(dshHome(), 'napcat-autogen.bat')
      const body =
        '@echo off\r\n' +
        'chcp 65001 >nul\r\n' +
        `cd /d "${cfg.shellDir}"\r\n` +
        `"${boot}" ${cfg.launchAccount}\r\n`
      try {
        writeFileSync(file, body, 'utf8')
        log(cfg, `autogen launcher: ${file} (account ${cfg.launchAccount})`)
        return file
      } catch {}
    }
  }
  return ''
}

/** 在 Shell 目录里找 NapCatWinBootMain.exe（最多往下两层） */
function findBootMain(dir) {
  const direct = path.join(dir, 'NapCatWinBootMain.exe')
  if (existsSync(direct)) return direct
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return ''
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const deeper = findBootMain(path.join(dir, entry.name))
      if (deeper) return deeper
    } else if (/^NapCatWinBootMain\.exe$/i.test(entry.name)) {
      return path.join(dir, entry.name)
    }
  }
  return ''
}

/** 无窗口壳 .vbs 的路径（跟日志放一起） */
function taskWrapperPath(cfg) {
  const dir = path.dirname(cfg.launcherLog || path.join(dshHome(), 'napcat-keeper-launch.log'))
  return path.join(dir, 'napcat-keeper-launch.vbs')
}

/** 真正要跑的那条 cmd 命令 */
function taskCommandLine(cfg, bat) {
  return (
    `cmd.exe /c chcp 65001 >nul & cd /d "${cfg.shellDir}" & call "${bat}" ` +
    `>> "${cfg.launcherLog}" 2>&1`
  )
}

/**
 * 写一个 WScript 壳：sh.Run cmd, 0, False  → 子进程以“隐藏窗口”启动，
 * 桌面不会多出那个黑框（原来计划任务直接跑 cmd.exe 就会挂一个控制台窗口）。
 * .vbs 用 UTF-16LE + BOM 存，中文路径也认。
 */
function writeTaskWrapper(cfg, bat, hidden = true) {
  const vbs = taskWrapperPath(cfg)
  const cmdLine = taskCommandLine(cfg, bat).replace(/"/g, '""')
  const body =
    [
      'Option Explicit',
      'Dim sh',
      'Set sh = CreateObject("WScript.Shell")',
      `sh.Run "${cmdLine}", ${hidden ? 0 : 1}, False`,
      '',
    ].join('\r\n')
  mkdirSync(path.dirname(vbs), { recursive: true })
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')])
  writeFileSync(vbs, buf)
  return vbs
}

/** 自动建计划任务（用户级，不需要管理员），并解开执行时长限制 */
function ensureTask(cfg) {
  if (!cfg.taskName) return { ok: false, error: 'taskName 为空' }
  const bat = resolveLauncherPath(cfg)
  if (!bat) return { ok: false, error: '找不到启动脚本（先在设置里填 NapCat 目录）' }
  let wrapper = ''
  let inner = ''
  if (cfg.hideConsole !== false) {
    try {
      wrapper = writeTaskWrapper(cfg, bat, true)
      inner = `wscript.exe "${wrapper}"`
    } catch (error) {
      log(cfg, `wrapper 写不出来（${String((error && error.message) || error)}），退回直接跑 cmd`)
    }
  }
  if (!inner) inner = taskCommandLine(cfg, bat)
  try {
    execFileSync(
      'schtasks.exe',
      ['/create', '/tn', cfg.taskName, '/tr', inner, '/sc', 'ONCE', '/st', '00:00', '/f'],
      { stdio: 'ignore', windowsHide: true, timeout: 20000 },
    )
  } catch (error) {
    // 任务正在跑时 /f 覆盖可能被拒：先结束再建一次
    try {
      execFileSync('schtasks.exe', ['/end', '/tn', cfg.taskName], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 12000,
      })
      execFileSync(
        'schtasks.exe',
        ['/create', '/tn', cfg.taskName, '/tr', inner, '/sc', 'ONCE', '/st', '00:00', '/f'],
        { stdio: 'ignore', windowsHide: true, timeout: 20000 },
      )
    } catch (error2) {
      return { ok: false, error: String((error2 && error2.message) || error2) }
    }
  }
  state.taskReady = undefined
  log(cfg, `task "${cfg.taskName}" created → ${cfg.shellDir}`)
  const ps =
    `$ErrorActionPreference='SilentlyContinue';` +
    `$t=Get-ScheduledTask -TaskName '${cfg.taskName.replace(/'/g, "''")}';` +
    `if($t){$s=$t.Settings;$s.ExecutionTimeLimit='PT0S';$s.DisallowStartIfOnBatteries=$false;` +
    `$s.StopIfGoingOnBatteries=$false;Set-ScheduledTask -TaskName '${cfg.taskName.replace(/'/g, "''")}' -Settings $s | Out-Null}`
  void runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 20000)
  return { ok: true, created: true }
}

/** 把已经在跑的 NapCat 控制台窗口藏起来（老链条留下的黑框也能收掉，不用重启 QQ） */
function hideConsoleWindows(cfg) {
  const ps = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Add-Type -Namespace K -Name U -MemberDefinition '",
    '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
    '[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
    '[DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);',
    '[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);',
    "public delegate bool EnumProc(IntPtr h, IntPtr p);",
    "'",
    "$targets=@()",
    "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe' or Name='conhost.exe' or Name='wscript.exe'\" |",
    "  Where-Object { $_.CommandLine -match 'napcat' } | ForEach-Object {",
    '    $targets += [uint32]$_.ProcessId',
    '    Get-CimInstance Win32_Process -Filter "ParentProcessId=$($_.ProcessId)" |',
    "      Where-Object { $_.Name -eq 'conhost.exe' } | ForEach-Object { $targets += [uint32]$_.ProcessId }",
    '  }',
    '$targets = $targets | Sort-Object -Unique',
    '$global:ktTargets = @($targets)',
    '$global:ktHidden = 0',
    '$cb = [K.U+EnumProc]{ param($h,$lp)',
    '  $pp = [uint32]0',
    '  [void][K.U]::GetWindowThreadProcessId($h, [ref]$pp)',
    '  if($global:ktTargets -contains $pp -and [K.U]::IsWindowVisible($h)){ [void][K.U]::ShowWindow($h, 0); $global:ktHidden++ }',
    '  return $true }',
    '[void][K.U]::EnumWindows($cb, [IntPtr]::Zero)',
    'Write-Output ("hidden=" + $global:ktHidden + " targets=" + ($global:ktTargets -join ","))',
  ].join('\n')
  const out = runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 20000)
  const hidden = /hidden=(\d+)/.exec(String(out || ''))
  const n = hidden ? Number(hidden[1]) : 0
  log(cfg, `hide console: ${n} 个窗口收起`)
  return { ok: true, hidden: n }
}

function launchNapcat(cfg, reason = '') {
  const batPath = resolveLauncherPath(cfg)
  if (!batPath) {
    state.lastError =
      `launcher missing: shellDir="${cfg.shellDir}" launcherScript="${cfg.launcherScript}"` +
      '（在设置里填 NapCat Shell 目录，或填 QQ 号让它自动生成启动脚本）'
    log(cfg, `LAUNCH FAILED: ${state.lastError}`)
    return { ok: false, error: state.lastError }
  }
  if (lockBlocked(cfg)) {
    log(cfg, 'LAUNCH skipped: another keeper instance holds the lock')
    return { ok: false, skipped: true, error: 'locked' }
  }
  if (cfg.taskName && cfg.autoCreateTask && !taskReady(cfg)) {
    const made = ensureTask(cfg)
    if (!made.ok) log(cfg, `task create failed: ${made.error}`)
  }
  if (taskReady(cfg)) {
    try {
      execFileSync('schtasks.exe', ['/run', '/tn', cfg.taskName], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 12000,
      })
      writeLock(cfg)
      state.lastLaunchAt = Date.now()
      state.launchCount += 1
      state.phase = 'launching'
      state.scanSince = 0
      state.lastError = ''
      log(
        cfg,
        `LAUNCH ok via task "${cfg.taskName}"${reason ? ` (${reason})` : ''} (launch #${state.launchCount})`,
      )
      return { ok: true, via: 'task' }
    } catch (error) {
      state.taskReady = false
      log(cfg, `task run failed: ${String((error && error.message) || error)}，改用 cscript`)
    }
  }
  const stamp = Date.now()
  const cmdFile = path.join(tmpdir(), `dsh-napcat-keeper-${stamp}.cmd`)
  const vbsFile = path.join(tmpdir(), `dsh-napcat-keeper-${stamp}.vbs`)
  try {
    writeFileSync(
      cmdFile,
      '@echo off\r\n' +
        'chcp 65001 >nul\r\n' +
        `cd /d "${cfg.shellDir}"\r\n` +
        `call "${batPath}" >> "${cfg.launcherLog}" 2>&1\r\n`,
      'utf8',
    )
    // VBScript 字符串里 "" 表示一个引号；sh.Run 的第三个参数 False = 不等待返回
    writeFileSync(
      vbsFile,
      'Option Explicit\r\n' +
        'Dim sh\r\n' +
        'Set sh = CreateObject("WScript.Shell")\r\n' +
        `sh.Run """${cmdFile}""", 0, False\r\n`,
      'utf8',
    )
  } catch (error) {
    state.lastError = String((error && error.message) || error)
    log(cfg, `LAUNCH FAILED (write): ${state.lastError}`)
    return { ok: false, error: state.lastError }
  }
  try {
    const child = spawn('cscript.exe', ['//nologo', vbsFile], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    child.unref?.()
  } catch (error) {
    state.lastError = String((error && error.message) || error)
    log(cfg, `LAUNCH FAILED (spawn): ${state.lastError}`)
    return { ok: false, error: state.lastError }
  }
  writeLock(cfg)
  state.lastLaunchAt = Date.now()
  state.launchCount += 1
  state.phase = 'launching'
  state.scanSince = 0
  state.lastError = ''
  log(cfg, `LAUNCH ok: ${batPath}${reason ? ` (${reason})` : ''} (launch #${state.launchCount})`)
  return { ok: true, cmdFile, vbsFile }
}

/** 只杀掉比 oldestLastMs 更晚启动的那几条链（保留正在服务的那条） */
async function killNewerChains(cfg, oldestLastMs) {
  const base = procRootRaw(cfg)
  if (!base) {
    log(cfg, 'dedupe skipped: 没有可用的进程路径前缀（先填 NapCat 目录或 procPathMatch）')
    return
  }
  const root = psPath(base).replace(/'/g, "''")
  const script =
    "$ErrorActionPreference='SilentlyContinue';" +
    `$cut=([datetime]'1970-01-01').AddMilliseconds(${Math.round(oldestLastMs)});` +
    'Get-Process QQ,NapCatWinBootMain | ' +
    `Where-Object { $_.Path -like '${root}*' -and $_.StartTime -gt $cut } | ` +
    'ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }'
  await runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000)
}

/** 杀掉 root 下所有 QQ / NapCatWinBootMain；返回是否真的清干净（没清干净就别拉新链） */
async function killNapcat(cfg) {
  const base = procRootRaw(cfg)
  if (!base) {
    log(cfg, 'KILL skipped: 没有可用的进程路径前缀（先填 NapCat 目录或 procPathMatch）')
    return false
  }
  const root = psPath(base).replace(/'/g, "''")
  const script =
    "Get-Process QQ,NapCatWinBootMain -ErrorAction SilentlyContinue | " +
    `Where-Object { $_.Path -like '${root}*' } | ` +
    'ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }'
  await runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000)
  // 等进程真的消失，别在旧客户端还没退干净时就拉新的（这就是互踢的根源）
  for (let i = 0; i < 20; i += 1) {
    const procs = await probeProcs(cfg)
    if (procs.boot === 0 && procs.qq === 0) break
    await sleep(1000)
  }
  // QQ 有时会被残留进程重新拉起来，再兜两轮
  let final = await probeProcs(cfg)
  for (let round = 0; round < 2 && (final.boot > 0 || final.qq > 0); round += 1) {
    log(cfg, `KILL round ${round + 1}: 仍有 boot=${final.boot} qq=${final.qq}，再清一遍`)
    await runCapture('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 20000)
    await sleep(1500)
    final = await probeProcs(cfg)
  }
  if (final.boot > 0 || final.qq > 0) {
    log(
      cfg,
      `KILL incomplete: boot=${final.boot} qq=${final.qq} 仍活着 —— 这次不拉新链（再拉就会互踢）`,
    )
    return false
  }
  clearLock(cfg)
  log(cfg, 'KILL: napcat chain stopped')
  return true
}

/* ------------------------------------------------------------------ */
/* 心跳                                                                */
/* ------------------------------------------------------------------ */

function writeSnapshot(cfg, payload) {
  state.lastSnapshot = payload
  try {
    mkdirSync(path.dirname(cfg.statePath), { recursive: true })
    writeFileSync(cfg.statePath, JSON.stringify(payload, null, 2), 'utf8')
  } catch {}
}

async function tick(cfg) {
  state.cfg = cfg
  state.lastProbeAt = new Date().toISOString()
  const health = await probe(cfg)

  if (health.online) {
    if (state.phase !== 'online') log(cfg, `ONLINE: ${health.nickname} (${health.userId})`)
    state.phase = 'online'
    state.lastOnlineAt = Date.now()
    state.lastError = ''
    state.scanSince = 0
    state.scanRetries = 0
    const bridge = bridgeAge(cfg)
    if (bridge.ageSec !== null && bridge.ageSec > cfg.bridgeStaleSec) {
      log(cfg, `WARN bridge state stale ${bridge.ageSec}s (${bridge.path}) —— 桥接可能卡住`)
    }
    // 在线也查一次重复链（每分钟一次）：两个客户端同号在线迟早互相踢，只杀晚启动的那几条
    if (Date.now() - state.lastDupCheckAt > 60000) {
      state.lastDupCheckAt = Date.now()
      const live = await probeProcs(cfg)
      if (live.dup && live.clusters.length > 1) {
        state.dedupeCount += 1
        log(
          cfg,
          `ONLINE 但存在重复链（chains=${live.chains}）→ 只杀较新的，保留正在服务的那条`,
        )
        await killNewerChains(cfg, live.clusters[0].lastMs)
      }
    }
    const snapshot = {
      phase: state.phase,
      online: true,
      nickname: health.nickname,
      userId: health.userId,
      port: cfg.onebotPort,
      bridge,
      launches: state.launchCount,
      dedupes: state.dedupeCount,
      updatedAt: new Date().toISOString(),
    }
    writeSnapshot(cfg, snapshot)
    if (Date.now() - state.lastHeartbeatAt > cfg.heartbeatSec * 1000) {
      state.lastHeartbeatAt = Date.now()
      log(cfg, `heartbeat: online ${health.nickname}, bridge age ${bridge.ageSec ?? 'n/a'}s`)
    }
    return { phase: state.phase, health, bridge }
  }

  const procs = await probeProcs(cfg)

  // ① 重复链：先收拾干净，再拉一条
  if (procs.dup) {
    state.dedupeCount += 1
    log(
      cfg,
      `DUPLICATE chain detected (boot=${procs.boot}, qq=${procs.qq}, chains=${procs.chains}) -> kill all, relaunch single chain`,
    )
    const cleaned = await killNapcat(cfg)
    if (!cleaned) {
      state.phase = 'dedupe-blocked'
      state.lastError = 'kill incomplete'
      writeSnapshot(cfg, {
        phase: state.phase,
        online: false,
        deduped: true,
        procs,
        launches: state.launchCount,
        dedupes: state.dedupeCount,
        updatedAt: new Date().toISOString(),
      })
      return { phase: state.phase, health, procs, deduped: true, launched: { ok: false } }
    }
    await sleep(1200)
    const launched = launchNapcat(cfg, 'dedupe')
    state.phase = 'launching'
    writeSnapshot(cfg, {
      phase: state.phase,
      online: false,
      deduped: true,
      procs,
      launches: state.launchCount,
      dedupes: state.dedupeCount,
      updatedAt: new Date().toISOString(),
    })
    return { phase: state.phase, health, procs, deduped: true, launched }
  }

  // ② 完全没有进程：拉起（带宽限期 + 跨进程锁）
  if (procs.boot === 0 && procs.qq === 0) {
    const since = Date.now() - state.lastLaunchAt
    if (since < cfg.launchGraceSec * 1000) {
      state.phase = 'launching'
      writeSnapshot(cfg, { phase: state.phase, online: false, procs, launches: state.launchCount })
      return { phase: state.phase, health, procs }
    }
    state.phase = 'offline'
    log(cfg, `OFFLINE (${health.error}) -> launching NapCat`)
    const launched = launchNapcat(cfg, 'offline')
    writeSnapshot(cfg, {
      phase: state.phase,
      online: false,
      procs,
      launches: state.launchCount,
      launched: launched.ok,
      updatedAt: new Date().toISOString(),
    })
    return { phase: 'launching', health, procs, launched }
  }

  // ③ 进程在、端口不通：正在启动 or 卡在扫码 or 卡死
  const qr = qrInfo(cfg)
  if (qr && qr.ageSec <= cfg.qrFreshSec) {
    if (!state.scanSince) state.scanSince = Date.now()
    const waitedSec = Math.round((Date.now() - state.scanSince) / 1000)
    if (state.phase !== 'need-scan' && state.phase !== 'need-scan-giveup') {
      log(cfg, `WAITING SCAN: qrcode.png ${qr.ageSec}s old, 需要手机扫码（副本 ${qr.copy || 'n/a'}）`)
    }
    if (waitedSec <= cfg.scanTimeoutSec) {
      state.phase = 'need-scan'
    } else if (state.scanRetries < cfg.maxScanRetries) {
      state.scanRetries += 1
      log(
        cfg,
        `SCAN TIMEOUT ${waitedSec}s -> kill & relaunch fresh QR (retry ${state.scanRetries}/${cfg.maxScanRetries})`,
      )
      const cleaned = await killNapcat(cfg)
      if (cleaned) {
        await sleep(1200)
        launchNapcat(cfg, 'scan-timeout')
      } else {
        log(cfg, 'SCAN TIMEOUT: 旧链没清干净，先不拉新链')
      }
      state.scanSince = 0
      writeSnapshot(cfg, {
        phase: state.phase,
        online: false,
        procs,
        qr,
        scanRetries: state.scanRetries,
        updatedAt: new Date().toISOString(),
      })
      return { phase: 'launching', health, procs, qr, relaunched: cleaned }
    } else {
      if (state.phase !== 'need-scan-giveup') {
        log(
          cfg,
          `GIVE UP: 扫码重试 ${state.scanRetries} 次仍未登录。一次性修复靠人：QMainWindow 扫码 or ` +
            '用 QQ 密码重新登录后重跑 quick 登录脚本；之后看门狗会自己接着盯。',
        )
      }
      state.phase = 'need-scan-giveup'
    }
    writeSnapshot(cfg, {
      phase: state.phase,
      online: false,
      procs,
      qr,
      scanWaitedSec: waitedSec,
      scanRetries: state.scanRetries,
      qrCopy: qr.copy,
      updatedAt: new Date().toISOString(),
    })
    return { phase: state.phase, health, procs, qr }
  }

  // 没有新二维码：还在启动
  if (state.phase !== 'starting') log(cfg, `STARTING: procs boot=${procs.boot} qq=${procs.qq}, port not ready`)
  state.phase = 'starting'
  const lastSignal = Math.max(
    state.lastLaunchAt,
    procs.newestStartMs,
    qr ? Date.now() - qr.ageSec * 1000 : 0,
    state.lastOnlineAt,
  )
  if (Date.now() - lastSignal > cfg.stuckSec * 1000) {
    log(cfg, `STUCK ${Math.round((Date.now() - lastSignal) / 1000)}s with no signal -> kill & relaunch`)
    const cleaned = await killNapcat(cfg)
    if (cleaned) {
      await sleep(1200)
      launchNapcat(cfg, 'stuck')
    } else {
      log(cfg, 'STUCK: 旧链没清干净，先不拉新链')
    }
    writeSnapshot(cfg, { phase: state.phase, online: false, procs, relaunched: cleaned })
    return { phase: 'launching', health, procs, relaunched: cleaned }
  }
  writeSnapshot(cfg, {
    phase: state.phase,
    online: false,
    procs,
    qr,
    launches: state.launchCount,
    updatedAt: new Date().toISOString(),
  })
  return { phase: state.phase, health, procs, qr }
}

/* ------------------------------------------------------------------ */
/* 工具（拿得到 @deepseek-ai/dsh-tools 才注册）                         */
/* ------------------------------------------------------------------ */

function loadDefineTool() {
  const candidates = [
    path.join(dshHome(), 'profiles', process.env.DSH_PROFILE || 'desktop', 'package.json'),
    path.join(dshHome(), 'package.json'),
  ]
  for (const pkg of candidates) {
    try {
      if (!existsSync(pkg)) continue
      const mod = createRequire(pkg)('@deepseek-ai/dsh-tools')
      const fn = mod && (mod.defineTool || (mod.default && mod.default.defineTool))
      if (typeof fn === 'function') return fn
    } catch {}
  }
  return null
}

const renderText = (value) => [
  { type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) },
]

function registerTools(ctx, cfg) {
  const defineTool = loadDefineTool()
  if (!defineTool || !ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
    log(cfg, 'tools: unavailable, watchdog-only mode')
    return
  }
  const offs = []
  const push = (off) => {
    if (typeof off === 'function') offs.push(off)
  }
  try {
    push(
      ctx.tools.register(
        defineTool({
          name: 'napcat_status',
          description:
            '看 NapCat(QQ) 看门狗此刻的状态：OneBot 是否在线、登录的是哪个号、进程链数量（有无重复链）、二维码是否在等人扫（含副本路径）、dsh-qq-bridge 的轮询有多久没更新，以及最近看门狗日志。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_args, value) => renderText(value) },
          async execute() {
            const health = await probe(cfg)
            const procs = await probeProcs(cfg)
            const qr = qrInfo(cfg)
            const tail = (() => {
              try {
                return readFileSync(cfg.logPath, 'utf8').trim().split('\n').slice(-8)
              } catch {
                return []
              }
            })()
            return JSON.stringify(
              {
                ok: true,
                phase: state.phase,
                onebot: {
                  port: cfg.onebotPort,
                  online: health.online,
                  nickname: health.nickname,
                  user_id: health.userId,
                  error: health.error,
                },
                procs,
                qr,
                bridge: bridgeAge(cfg),
                launches: state.launchCount,
                dedupes: state.dedupeCount,
                scanRetries: state.scanRetries,
                lastLaunchAt: state.lastLaunchAt ? new Date(state.lastLaunchAt).toISOString() : null,
                lastProbeAt: state.lastProbeAt,
                config: {
                  shellDir: cfg.shellDir,
                  launcherScript: cfg.launcherScript,
                  probeIntervalSec: cfg.probeIntervalSec,
                  scanTimeoutSec: cfg.scanTimeoutSec,
                  statePath: cfg.statePath,
                  qrCopyPath: cfg.qrCopyPath,
                },
                logTail: tail,
                note: health.online
                  ? '在线。若 QQ 里还是没回音，问题在 dsh-qq-bridge 那一侧（绑定/试运行开关）。'
                  : qr && qr.ageSec <= cfg.qrFreshSec
                    ? '离线，且二维码是新的：小号需要手机扫码，文件在 qrCopyPath。'
                    : '离线。看门狗会自动拉起；若 procs.dup 为 true 说明被重复拉起过，已自动去重。',
              },
              null,
              2,
            )
          },
        }),
      ),
    )
    push(
      ctx.tools.register(
        defineTool({
          name: 'napcat_restart',
          description:
            '重启 NapCat(QQ)：按路径杀掉整条进程链（等它真的退干净），再用快登脚本拉起一条新的，然后等它上线。会打断当前登录态但不动 QQ 账号本身。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_args, value) => renderText(value) },
          async execute() {
            await killNapcat(cfg)
            await sleep(2000)
            const launched = launchNapcat(cfg, 'manual restart')
            let online = false
            let health = null
            for (let i = 0; i < 25; i += 1) {
              await sleep(3000)
              health = await probe(cfg)
              if (health.online) {
                online = true
                log(cfg, `RESTART online: ${health.nickname} (${health.userId})`)
                break
              }
            }
            return JSON.stringify(
              {
                ok: online || launched.ok,
                launched,
                online,
                health,
                phase: state.phase,
                qr: qrInfo(cfg),
              },
              null,
              2,
            )
          },
        }),
      ),
    )
    push(
      ctx.tools.register(
        defineTool({
          name: 'napcat_dedupe',
          description:
            '只处理重复进程链：数一下 QQ/NapCatWinBootMain，超过一条链（boot>1 或 QQ>3）就全杀掉再拉起一条；没重复就什么都不做。',
          parameters: {},
          output: { schema: { type: 'string' }, render: (_args, value) => renderText(value) },
          async execute() {
            const before = await probeProcs(cfg)
            if (!before.dup) {
              return JSON.stringify({ ok: true, action: 'none', procs: before, note: '没有重复链' }, null, 2)
            }
            await killNapcat(cfg)
            await sleep(1500)
            const launched = launchNapcat(cfg, 'manual dedupe')
            state.dedupeCount += 1
            return JSON.stringify(
              { ok: launched.ok, action: 'deduped', before, launched, phase: state.phase },
              null,
              2,
            )
          },
        }),
      ),
    )
    if (typeof ctx.on === 'function') {
      ctx.on('dispose', () => {
        for (const off of offs) {
          try {
            off?.()
          } catch {}
        }
      })
    }
    log(cfg, `tools: napcat_status / napcat_restart / napcat_dedupe registered (v${version})`)
  } catch (error) {
    log(cfg, `tools: register failed: ${String((error && error.message) || error)}`)
  }
}

/* ------------------------------------------------------------------ */
/* 插件入口                                                            */
/* ------------------------------------------------------------------ */

function stop(cfg) {
  if (state.timer) {
    try {
      clearInterval(state.timer)
    } catch {}
    state.timer = null
    log(cfg, 'watchdog stopped')
  }
}

function armTimer(cfg) {
  if (state.timer) {
    try {
      clearInterval(state.timer)
    } catch {}
    state.timer = null
  }
  if (!cfg.enabled) {
    log(cfg, 'disabled by config, watchdog not armed')
    return
  }
  state.timer = setInterval(() => {
    tick(cfg).catch((error) => log(cfg, `tick error: ${String((error && error.message) || error)}`))
  }, Math.max(10, Number(cfg.probeIntervalSec) || 45) * 1000)
  state.timer.unref?.()
}

/* ------------------------------------------------------------------ */
/* 设置界面（「napcat桥」）用的 HTTP 接口                                */
/* ------------------------------------------------------------------ */

const ROUTE = '/dsh-napcat-keeper'

function readBody(req, limit = 262144) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size <= limit) chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text.trim()) return resolve({})
      try {
        const parsed = JSON.parse(text)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.statusCode = status
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(body)
  } catch {
    try {
      res.end('{}')
    } catch {}
  }
}

/** 暴露给设置界面的配置（不含运行期派生路径以外的敏感项，token 原样给本地页面） */
function publicConfig(cfg) {
  return {
    enabled: cfg.enabled,
    shellDir: cfg.shellDir,
    launcherScript: cfg.launcherScript,
    launchAccount: cfg.launchAccount,
    launchArgs: cfg.launchArgs,
    onebotPort: cfg.onebotPort,
    accessToken: cfg.accessToken,
    procPathMatch: cfg.procPathMatch,
    probeIntervalSec: cfg.probeIntervalSec,
    launchGraceSec: cfg.launchGraceSec,
    qrFreshSec: cfg.qrFreshSec,
    scanTimeoutSec: cfg.scanTimeoutSec,
    maxScanRetries: cfg.maxScanRetries,
    stuckSec: cfg.stuckSec,
    heartbeatSec: cfg.heartbeatSec,
    chainGapSec: cfg.chainGapSec,
    maxQqPerChain: cfg.maxQqPerChain,
    bridgeStaleSec: cfg.bridgeStaleSec,
    taskName: cfg.taskName,
    autoCreateTask: cfg.autoCreateTask,
    logPath: cfg.logPath,
    launcherLog: cfg.launcherLog,
    configPath: cfg.configPath,
  }
}

function logTail(cfg, lines = 60) {
  try {
    const text = readFileSync(cfg.logPath, 'utf8').replace(/^\uFEFF/, '')
    const all = text.split(/\r?\n/).filter(Boolean)
    return all.slice(-Math.max(1, Math.min(400, lines)))
  } catch {
    return []
  }
}

async function uiState(cfg) {
  const [health, procs] = await Promise.all([probe(cfg), probeProcs(cfg)])
  const qr = qrInfo(cfg)
  const bridge = bridgeAge(cfg)
  return {
    ok: true,
    version,
    config: publicConfig(cfg),
    runtime: {
      enabled: cfg.enabled,
      phase: state.phase,
      online: !!health.online,
      nickname: health.nickname || '',
      userId: health.userId || 0,
      error: health.error || '',
      launchCount: state.launchCount,
      dedupeCount: state.dedupeCount,
      scanRetries: state.scanRetries,
      lastLaunchAt: state.lastLaunchAt ? new Date(state.lastLaunchAt).toISOString() : '',
      lastOnlineAt: state.lastOnlineAt ? new Date(state.lastOnlineAt).toISOString() : '',
      lastProbeAt: state.lastProbeAt || '',
      procs: { boot: procs.boot, qq: procs.qq, chains: procs.chains, dup: procs.dup },
      qr: qr,
      bridge: bridge,
      procRoot: procRootRaw(cfg),
      launcherFound: resolveLauncherPath(cfg),
      taskName: cfg.taskName,
      taskReady: cfg.taskName ? taskReady(cfg) : false,
    },
    detect: { shellDir: detectShellDir() },
    log: logTail(cfg, 40),
  }
}

/** 保存配置：写文件 → 重新解析 → 热应用（不用重启 DSH） */
function saveAndApply(ctx, patch) {
  const home = dshHome()
  const fileCfg = { ...readConfigFile(home) }
  for (const [key, value] of Object.entries(patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue
    if (key === 'shellDir' || key === 'procPathMatch') {
      fileCfg[key] = String(value == null ? '' : value).trim().replace(/"/g, '').replace(/\\/g, '/')
      continue
    }
    if (key === 'enabled' || key === 'autoCreateTask') {
      fileCfg[key] = value !== false && value !== 'false'
      continue
    }
    if (typeof DEFAULTS[key] === 'number') {
      const num = Number(value)
      if (Number.isFinite(num)) fileCfg[key] = num
      continue
    }
    fileCfg[key] = value == null ? '' : String(value).trim()
  }
  const written = writeConfigFile(home, fileCfg)
  const prev = state.cfg
  const next = resolveConfig(state.patchConfig || {})
  state.cfg = next
  const shellChanged = prev && (prev.shellDir !== next.shellDir || prev.onebotPort !== next.onebotPort)
  if (shellChanged) {
    try {
      clearLock(next)
    } catch {}
    state.scanRetries = 0
    state.phase = 'idle'
  }
  log(
    next,
    `config saved → ${written} (enabled=${next.enabled}, shell=${next.shellDir || '(未探测到)'}, ` +
      `port=${next.onebotPort}, task=${next.taskName || '(不用)'})`,
  )
  armTimer(next)
  if (next.enabled) {
    tick(next).catch((error) => log(next, `tick after save error: ${String((error && error.message) || error)}`))
  }
  return next
}

async function doAction(ctx, cfg, action) {
  switch (String(action || '')) {
    case 'probe':
      await tick(cfg)
      return { said: '重新探测了一次' }
    case 'launch': {
      const r = launchNapcat(cfg, 'manual')
      await sleep(1500)
      await tick(cfg)
      return { said: r.ok ? '已下达拉起指令' : `拉起失败：${r.error || ''}` }
    }
    case 'restart': {
      const cleaned = await killNapcat(cfg)
      if (!cleaned) return { said: '进程没杀干净，这次不拉新的（再拉会互踢）' }
      await sleep(1200)
      const r = launchNapcat(cfg, 'manual-restart')
      await sleep(1500)
      await tick(cfg)
      return { said: r.ok ? '已杀掉重拉' : `重拉失败：${r.error || ''}` }
    }
    case 'kill': {
      const cleaned = await killNapcat(cfg)
      await tick(cfg)
      return { said: cleaned ? '已杀掉 NapCat 进程' : '还有进程没退干净' }
    }
    case 'dedupe': {
      const live = await probeProcs(cfg)
      if (!live.dup || live.clusters.length < 2) return { said: '只有一条链，不用去重' }
      const oldest = live.clusters.reduce((a, b) => (a.firstMs <= b.firstMs ? a : b))
      await killNewerChains(cfg, oldest.lastMs)
      state.dedupeCount += 1
      await tick(cfg)
      return { said: `杀掉 ${live.clusters.length - 1} 条重复链，保留最早那条` }
    }
    case 'createTask': {
      const r = ensureTask(cfg)
      return { said: r.ok ? `计划任务「${cfg.taskName}」已就绪（无窗口拉起）` : `建任务失败：${r.error}` }
    }
    case 'hideConsole': {
      const r = hideConsoleWindows(cfg)
      return {
        said: r.hidden > 0 ? `收起了 ${r.hidden} 个控制台窗口` : '没找到可见的控制台窗口',
        hidden: r.hidden,
      }
    }
    case 'detect': {
      const found = detectShellDir()
      return { said: found ? `探测到：${found}` : '常见位置没找到 NapCat Shell 目录', shellDir: found }
    }
    default:
      return { said: `不认识的 action：${action}` }
  }
}

function registerRoutes(ctx) {
  if (!ctx || !ctx.webServer || typeof ctx.webServer.register !== 'function') {
    log(state.cfg, 'webServer 不可用，设置界面接口没挂上（看门狗照常工作）')
    return
  }
  const route = (suffix, handler) => {
    try {
      ctx.effect(() =>
        ctx.webServer.register({
          kind: 'exact',
          path: `${ROUTE}${suffix}`,
          handler: async (req, res) => {
            try {
              await handler(req, res)
            } catch (error) {
              sendJson(res, 500, { ok: false, error: String((error && error.message) || error) })
            }
          },
        }),
      )
    } catch (error) {
      log(state.cfg, `route ${suffix} failed: ${String((error && error.message) || error)}`)
    }
  }

  route('/state', async (req, res) => {
    sendJson(res, 200, await uiState(state.cfg))
  })

  route('/save', async (req, res) => {
    const body = await readBody(req)
    const next = saveAndApply(ctx, body && body.patch ? body.patch : body)
    sendJson(res, 200, await uiState(next))
  })

  route('/action', async (req, res) => {
    const body = await readBody(req)
    const result = await doAction(ctx, state.cfg, body.do)
    const payload = await uiState(state.cfg)
    sendJson(res, 200, { ...payload, said: result.said, extra: result.shellDir || '' })
  })

  route('/log', async (req, res) => {
    const url = String(req.url || '')
    const match = url.match(/lines=(\d+)/)
    const lines = match ? Number(match[1]) : 80
    sendJson(res, 200, { ok: true, lines: logTail(state.cfg, lines) })
  })
}

export function apply(ctx, config) {
  state.patchConfig = config || {}
  const cfg = resolveConfig(state.patchConfig)
  state.cfg = cfg
  log(
    cfg,
    `boot: watchdog v${version} (enabled=${cfg.enabled}, port=${cfg.onebotPort}, every ${cfg.probeIntervalSec}s, ` +
      `scanTimeout=${cfg.scanTimeoutSec}s, shell=${cfg.shellDir || '(未配置)'}, task=${cfg.taskName || '(不用)'})`,
  )
  registerTools(ctx, cfg)
  registerRoutes(ctx)
  armTimer(cfg)
  if (typeof ctx?.on === 'function') {
    try {
      ctx.on('dispose', () => stop(cfg))
    } catch {}
  }
  if (cfg.enabled) {
    tick(cfg).catch((error) => log(cfg, `first tick error: ${String((error && error.message) || error)}`))
  }
}

/** 给 node 命令行手动测试用（DSH 不读它） */
export const __internals = {
  resolveConfig,
  normalizeConfig,
  detectShellDir,
  detectLauncher,
  resolveLauncherPath,
  ensureTask,
  readConfigFile,
  writeConfigFile,
  uiState,
  saveAndApply,
  procRoot,
  probe,
  probeProcs,
  qrInfo,
  bridgeAge,
  launchNapcat,
  killNapcat,
  tick,
  lockBlocked,
  state,
}
