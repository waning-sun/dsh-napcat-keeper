/**
 * dsh-napcat-keeper —— NapCat 看门狗 v2.7.0（可发布通用版）
 *
 * 解决的问题：DSH 是桌面应用，重启 DSH 时 NapCat(QQ 协议端) 不会跟着起来，
 * 于是 dsh-qq-bridge 一直轮询一个死端口，你在 QQ 里说的话就石沉大海。
 *
 * v2.7.0：自己的东西收进自己的目录（~/.dsh/dsh-napcat-keeper/）
 *   - 以前配置、日志、状态、二维码、生成的 bat/vbs、提权脚本全散在 ~/.dsh 根上，
 *     和 DSH 自己的文件混在一起，一眼看不出哪些是插件产生的；
 *   - 现在统一落在 ~/.dsh/dsh-napcat-keeper/ 一个目录里，文件名去掉重复前缀：
 *     config.json / keeper.log / launch.log / state.json / lock.json / qr.png /
 *     env.bat / launch.vbs / autogen.bat / autogen-node.bat / setup/；
 *   - 老版本升级时 migrateLegacyFiles() 自动搬一次（能 rename 就 rename），
 *     遗留的 *.bak、旧备份目录挪进 legacy/ 留档；计划任务里写死的旧路径由
 *     repairTaskActions() 用 /change 改指新位置，不 /end、不打扰正在跑的 QQ；
 *   - qq-bridge-state.json 不搬：那是 dsh-qq-bridge 的文件，只是被读一下。
 *
 * v2.6.0：清死代码 + README 与代码对齐（行为一字没变）
 *   - 删掉 v2.2.2 起就没人再调用的目录自动探测三件套（looksLikeShellDir / findShellDirs /
 *     detectShellDir）和只被写过一次的 napcatRoot()：配置不再有「悄悄替你填」的暗路，
 *     文件也短了 70 行；
 *   - PowerShell 调用收成 psArgs / runPs / runPsSync 三个薄封装，原先 7 处手抄的
 *     ['-NoProfile','-NonInteractive','-Command', …] 不再各写一遍（参数漏一个就查半天的那种坑）；
 *   - README：补回隐私体检那段说明（命令原先悬空）、修正计划任务「留空」的语义、
 *     把 Shell 型自动生成的 bat 路径写对、配置表补齐 hideConsole / heartbeatSec 等漏掉的键；
 *   - 发版流程不变：npm run check（清单 + 隐私）+ 三个自测全绿才发。
 *
 * v2.5.0：统一用 DSH 自带的 Node 运行时
 *   - 以前凡是「要跑一段 JS」的地方都默认那台机器上有 node（或者干脆蹭 NapCat / QQ 的私有环境），
 *     换台机器、换个装法就哑火；现在统一走 resolveNode()：
 *       手填 nodePath → DSH 自带（<DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe）
 *       → 系统 PATH → 常见安装目录 → NapCat 目录兜底；
 *   - 顺带补上「Shell 型」NapCat（目录**顶层**有 napcat.mjs，官方 NapCat.Shell 那种）：
 *     以前只认 NapCatWinBootMain.exe，遇到 node 型安装就报「找不到启动脚本」；
 *     现在用这份 node 生成 napcat-autogen-node.bat 去跑 napcat.mjs；
 *   - 注入型（OneKey）不受影响：NapCat 跑在 QQ.exe 自己的 Node service
 *     （`--type=utility --utility-sub-type=node.mojom.NodeService`）里，磁盘上没有 node.exe，
 *     外部的 node 也替不了它 —— 这条链路插件只负责调 bootmain，不碰 node；
 *   - 设置页新增「Node 运行时」一栏和「测一下 node」按钮，状态条里直接显示用的是哪一份、什么版本。
 *
 * v2.4.1：package.json 被 PowerShell 重写成乱码 + 断引号，同一个位置再炸一次
 *   - 事故：`Bad control character in string literal in JSON at position 899 (line 36 column 23)`。
 *     不是插件跑起来才炸，是 DSH 读清单时就炸 —— 插件整段加载失败，看门狗跟着消失；
 *   - 现场：第 36 行 `"author": "鐔欑殑澶ц偉楸?,` —— 值被 UTF-8→ANSI(GBK) 双重编码成乱码，行尾那个标记是给体检脚本的豁免（事故原文引用）check-manifest:ignore-mojibake
 *     末尾「鱼」的字节 E9 B1 BC 在 GBK 里凑不成整字，最后一个字节连**收尾的引号**一起被吞，
 *     于是字符串没有结束引号，后面的换行成了字符串里的裸控制字符（就是报错里那个 position 899）；
 *   - 根因还是 PowerShell 5.1：`Get-Content` 默认按 ANSI 读、`Set-Content -Encoding utf8` 再写回，
 *     一趟往返就把中文变成「鐔欑殑澶ц偉楸」这种双层乱码（BOM 那次的亲戚；check-manifest:ignore-mojibake）
 *   - 这次把防线补在 scripts/check-manifest.mjs：除 BOM 外再查「UTF-8 合不合法 / 是不是双重编码 /
 *     JSON 错在第几行第几列（带指针）/ 清单版本与代码里的 version 同不同步」，出问题先跑它。
 *
 * v2.3.2：清单带 BOM 会把整个插件打死（DSH 的 JSON.parse 直接抛 Unexpected token）
 *   - 根因是本机 PowerShell 5.1 的 Set-Content/Out-File -Encoding utf8 默认写 BOM；
 *   - 新增 scripts/check-manifest.mjs：查 BOM / 校验 JSON / 核对入口文件，--fix 只抹 BOM；
 *   - 改本插件任何 json/js 请用 write/edit 工具或 [IO.File]::WriteAllText + UTF8Encoding($false)；
 *
 * v2.3.0：提权交接 —— 需要管理员的活，交给「你点一下」的脚本
 *   - 插件不再自己尝试要管理员（它本来也要不到）：把要做的事摊成步骤写进
 *     ~/.dsh/dsh-napcat-keeper/setup/plan.json，生成 apply.ps1 + apply-admin.cmd + undo-admin.cmd；
 *   - 脚本先数一遍有没有真需要管理员的步骤：没有就直接干；有才 Start-Process -Verb RunAs
 *     自我提权 —— UAC 那个「是」就是用户亲手按的确认键，插件全程普通权限；
 *   - 每步结果写 result.json，设置页「读结果」说清楚哪条成了、哪条没成、有没有拿到管理员；
 *   - undo-admin.cmd 按相反顺序把建过的文件/任务/防火墙规则撤掉；
 *   - 能做的事（needs）：补启动脚本 / 写「记住密码」中间层 / 建计划任务 / 放行 OneBot 入站端口。
 *
 * v2.2.2：目录只认「人选」
 *   - 去掉「自动探测 NapCat Shell 目录」：不再替用户猜位置、也不再在配置里悄悄填，
 *     shellDir 空着就是空着，由用户自己决定；
 *   - 只留「分盘扫描」：本机有几块盘就列几个按钮，点哪个扫哪个；
 *   - 盘符改成向系统要（.NET DriveInfo，含光驱 / 移动盘 / BitLocker 锁着的盘），
 *     A–Z 根目录探测只当 PowerShell 不可用时的兜底，保证「系统里有几块盘就显示几块」；
 *   - 新增 drives 动作：插拔移动盘后设置页点「重新读盘」就能刷新，不用重启 DSH。
 *
 * v2.2.0：分盘深扫 —— 常见位置找不到时，用户可选 C:/D:/E: 甚至全部盘各扫一遍，
 *   深度 7 层、跳过系统目录、单盘 90 秒预算，命中就停在那条路径，结果点一下直接用。
 *
 * v2.1.0：可选「记住密码」
 *   - NapCat 的快速登录 token 会失效（实测几小时就掉），失效后只剩手机扫码一条路；
 *   - 打开 rememberPassword 后，拉起时会通过环境变量 ACCOUNT / NAPCAT_QUICK_PASSWORD
 *     （外加 MD5 兜底）交给 NapCat，token 一失效它自己用密码重新登录，不用人管；
 *   - 密码只落在本机两处：~/.dsh/dsh-napcat-keeper/config.json 与生成的 env.bat，
 *     所以设置页打开它之前会先摆出风险说明，要人自己点确认；关掉或点「清除密码」就删干净。
 *   - 密码绝不进日志、绝不进 /state 返回值（只回「已保存」和长度）。
 *
 * v2.0.0：从「一台机器专用」改成通用款
 *   - 所有机器相关的路径都不再写死，改为「设置 → napcat桥」里填，或点分盘扫描找；
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

import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  accessSync,
  appendFileSync,
  closeSync,
  constants as fsConstants,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

export const name = 'napcat-keeper'
export const version = '2.7.0'

/** tools 用来注册 napcat_* 工具；webServer 用来挂设置界面接口。拿不到也不至于把 DSH 拖崩。 */
export const inject = ['tools', 'webServer']

const DEFAULTS = {
  enabled: true,
  /** NapCat Shell 目录（启动脚本所在目录）；不再自动探测，留空就表示还没选 */
  shellDir: '',
  /** 启动脚本名或绝对路径；留空则在 shellDir 里自动挑（quick / napcat*.bat） */
  launcherScript: '',
  /**
   * Node 运行时（node.exe）的位置；留空 = 自动。
   * 自动顺序：DSH 自带的那份 → 系统 PATH → 常见安装目录 → NapCat 目录里自带的。
   * 只在「Shell 型」NapCat（目录顶层有 napcat.mjs，需要自己用 node 跑）时才会真的用到；
   * OneKey 那种注入式是 QQ 自己去跑 NapCat，跟这里无关（见文件头 v2.5.0 的说明）。
   */
  nodePath: '',
  /** 想快登的 QQ 号；填了且启动脚本不存在时，会自动生成一个直接调 NapCatWinBootMain.exe 的 bat */
  launchAccount: '',
  /** 追加给启动脚本的参数（空格分隔），一般不用填 */
  launchArgs: '',
  /**
   * 记住 QQ 密码：token 失效时 NapCat 用密码自己重新登录，不用手机扫码。
   * 默认关；打开后密码会以明文存在本机配置和一个生成的 bat 里，设置页会先摆风险说明。
   */
  rememberPassword: false,
  /** QQ 密码（明文，只存在本机）；rememberPassword 打开、且 launchAccount 有值时才生效 */
  quickPassword: '',
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
  /**
   * 拉起方式。默认留空 = 用 cscript 直接拉，QQ 链挂在 DSH 下面：
   * DSH 起来 → 拉 QQ；DSH 关掉 → QQ 跟着走。本插件就是「开机接上 QQ」用的，不需要它替 QQ 续命。
   * 填了任务名才走计划任务（父进程是任务计划服务，DSH 退出后 QQ 还活着）——那是另一套用法，想要才填。
   */
  taskName: '',
  /** 只有填了 taskName 才有意义：任务不存在时自动创建（用户级，不需要管理员）；默认关 */
  autoCreateTask: false,
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

/**
 * 模块级状态放进 globalThis 一份：DSH 改了插件文件会热重载（旧模块实例丢掉、
 * 新模块重新 apply），如果状态（尤其 timer）跟着模块走，每次热重载都会多留下
 * 一个还活着的 45s 定时器 + 各自的 tick → 越改越卡，最后把整个 DSH 拖住。
 * 共用同一份状态后，armTimer 里 clearInterval(state.timer) 能真的清掉旧实例的定时器。
 */
const STATE_KEY = Symbol.for('dsh.napcat-keeper.state')
const state =
  globalThis[STATE_KEY] ||
  (globalThis[STATE_KEY] = {
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
  })

/* ------------------------------------------------------------------ */
/* 基础设施                                                            */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || path.join(homedir(), '.dsh')
}

/**
 * 插件自己的家：~/.dsh/dsh-napcat-keeper。
 * 配置、日志、状态、二维码、生成的 bat / vbs、提权脚本全在这一个目录里 ——
 * 老版本是直接摊在 ~/.dsh 根上的，2.7.0 起收拢，升级时 migrateLegacyFiles() 自动搬。
 */
function keeperDir() {
  const dir = path.join(dshHome(), 'dsh-napcat-keeper')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {}
  return dir
}

/* 老名字 → 新名字。搬过一次就不再动（同目录 rename 是原子的）。 */
const LEGACY_FILES = [
  ['napcat-keeper-config.json', 'config.json'],
  ['napcat-keeper.log', 'keeper.log'],
  ['napcat-keeper-launch.log', 'launch.log'],
  ['napcat-keeper.lock.json', 'lock.json'],
  ['napcat-keeper-state.json', 'state.json'],
  ['napcat-qr.png', 'qr.png'],
  ['napcat-keeper-env.bat', 'env.bat'],
  ['napcat-keeper-launch.vbs', 'launch.vbs'],
  ['napcat-autogen-node.bat', 'autogen-node.bat'],
  ['napcat-autogen.bat', 'autogen.bat'],
]
const LEGACY_DIRS = [['napcat-keeper-setup', 'setup']]
/** 老版本留下的零碎（配置备份、bom-backup 之类）：扫一遍挪进 legacy/，不参与运行 */
const LEGACY_LEFTOVER = /^(napcat-keeper[.-]|napcat-qr\.|napcat-autogen)/
const CANONICAL_LEGACY = new Set([...LEGACY_FILES, ...LEGACY_DIRS].map(([oldName]) => oldName))

let migratedFor = ''
/** 上一次搬迁搬了几个（给 apply 写一行日志用） */
let lastMigrated = 0

function moveOne(from, to) {
  try {
    if (existsSync(to)) return false
    renameSync(from, to)
    return true
  } catch {
    try {
      copyFileSync(from, to)
      unlinkSync(from)
      return true
    } catch {
      return false
    }
  }
}

/** 把老版本散在 ~/.dsh 根上的文件搬进 keeperDir；重复调用是空操作，返回搬了几个 */
function migrateLegacyFiles(dir) {
  const target = dir || keeperDir()
  if (migratedFor === target) return 0
  migratedFor = target
  const home = dshHome()
  let moved = 0
  for (const [oldName, newName] of LEGACY_FILES) {
    try {
      if (!existsSync(path.join(home, oldName))) continue
    } catch {
      continue
    }
    if (moveOne(path.join(home, oldName), path.join(target, newName))) moved += 1
  }
  for (const [oldName, newName] of LEGACY_DIRS) {
    try {
      const from = path.join(home, oldName)
      if (existsSync(from) && !existsSync(path.join(target, newName)) && moveOne(from, path.join(target, newName))) {
        moved += 1
      }
    } catch {}
  }
  try {
    for (const entry of readdirSync(home)) {
      if (CANONICAL_LEGACY.has(entry) || !LEGACY_LEFTOVER.test(entry)) continue
      try {
        mkdirSync(path.join(target, 'legacy'), { recursive: true })
        if (moveOne(path.join(home, entry), path.join(target, 'legacy', entry))) moved += 1
      } catch {}
    }
  } catch {}
  lastMigrated = moved
  return moved
}

/** 设置界面写的那份配置（JSON，无 BOM）：<keeperDir>/config.json */
function configFilePath(cfgOrDir) {
  if (cfgOrDir && typeof cfgOrDir === 'object' && cfgOrDir.configPath) return cfgOrDir.configPath
  const dir = typeof cfgOrDir === 'string' ? cfgOrDir : keeperDir()
  return path.join(dir, 'config.json')
}

function readConfigFile(dir) {
  const file = configFilePath(dir)
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

/**
 * 同步跑一条命令抓 stdout。失败一律返回空串 —— 这里全是「问一下系统」的活，
 * 问不到就走兜底，绝不能影响看门狗本身。
 */
function captureSync(file, args, timeoutMs = 4000) {
  try {
    return String(
      execFileSync(file, args, {
        timeout: timeoutMs,
        windowsHide: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }) || '',
    )
  } catch {
    return ''
  }
}

/* PowerShell 调用只有一种形状：-NoProfile -NonInteractive -Command <脚本>。
 * 下面三个薄封装把这段样板收在一处，调用点只剩「脚本 + 超时」，也省得每处手抄漏参数。 */
const psArgs = (script) => ['-NoProfile', '-NonInteractive', '-Command', script]

/** 同步问一次系统（盘符这种一开机就该知道的廉价查询） */
const runPsSync = (script, timeoutMs = 4000) => captureSync('powershell.exe', psArgs(script), timeoutMs)

/** 异步跑一段 PowerShell，返回 stdout；失败返回空串 */
const runPs = (script, timeoutMs = 20000) => runCapture('powershell.exe', psArgs(script), timeoutMs)

/**
 * 本机有哪些盘 —— 系统里有几块就报几块。
 *
 * 优先问 .NET：`[System.IO.DriveInfo]::GetDrives()` 是系统视角的完整列表，
 * 光驱、移动硬盘、BitLocker 上着锁的盘都会出现（资源管理器里看得见就该看得见）；
 * 只有 PowerShell 起不来时才退回 A–Z 根目录探测 —— 那条路对锁着的盘、无介质的
 * 光驱、某些虚拟盘都会 stat 失败，于是「有盘却不显示」，正是要避免的。
 */
function listDrives() {
  const found = new Set()
  const add = (value) => {
    const match = String(value || '').trim().match(/^([A-Za-z])[:：]/)
    if (match) found.add(`${match[1].toUpperCase()}:`)
  }

  const out = runPsSync('[System.IO.DriveInfo]::GetDrives() | ForEach-Object { $_.Name }')
  for (const line of out.split(/\r?\n/)) add(line)

  if (!found.size) {
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      try {
        if (statSync(`${letter}:\\`).isDirectory()) add(`${letter}:`)
      } catch {}
    }
  }
  return [...found].sort()
}

/* ---- 分盘深扫：用户点「扫 C 盘 / 扫 D 盘」，边扫边报进度 ------------- */
/**
 * 为什么要有这个：常见位置只有那么几个，装到「D:\Games\NapCat\OneKey\NapCat.x.Shell」
 * 这种地方的人（包括我自己）永远探测不到。于是给按钮，让人自己选盘、自己点，扫的时候
 * 深度限制 + 目录黑名单 + 时间预算，边扫边把命中的目录吐给界面，命中一个就能直接用。
 */
const SCAN_SKIP_NAMES = new Set([
  'windows',
  '$recycle.bin',
  'system volume information',
  '$windows.~bt',
  '$windows.~ws',
  'windows.old',
  'recovery',
  'msocache',
  'perflogs',
  'winsxs',
  'driverstore',
  'windowsapps',
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'package cache',
  'temp',
  'tmp',
  'cache',
  '.cache',
  '$extend',
])

const scan = {
  running: false,
  drives: [],
  driveIndex: 0,
  drive: '',
  visited: 0,
  found: [],
  startedAt: 0,
  endedAt: 0,
  elapsedMs: 0,
  cancelled: false,
  limitHit: false,
  error: '',
  account: '',
  maxDepth: 7,
}

/** 给界面看的扫描快照 */
function scanPublic() {
  return {
    running: scan.running,
    drives: scan.drives.slice(),
    drive: scan.drive,
    driveIndex: scan.driveIndex,
    visited: scan.visited,
    maxDepth: scan.maxDepth,
    // 真 Shell 排前面：扫到的顺序是磁盘遍历顺序，壳模板往往比真 Shell 先撞上
    found: scan.found
      .slice()
      .sort((a, b) => Number(b.shell) - Number(a.shell) || String(a.path).localeCompare(String(b.path)))
      .slice(0, 20),
    elapsedMs: scan.running ? Date.now() - scan.startedAt : scan.elapsedMs,
    cancelled: scan.cancelled,
    limitHit: scan.limitHit,
    error: scan.error,
  }
}

/** 认一个目录是不是 NapCat Shell：名字像 napcat，或有 NapCatWinBootMain.exe，并且带 .bat */
function looksLikeShellDirLoose(dir, names) {
  const boot = names.some((n) => /^NapCatWinBootMain\.exe$/i.test(n))
  if (!boot && !/napcat/i.test(path.basename(dir))) return false
  return names.some((n) => /\.bat$/i.test(n))
}

/**
 * 真 Shell 的强证据。OneKey 那套会同时留下两种目录：
 *   - `bootmain/`：安装器解出来的壳模板，只有 NapCatWinBootMain.exe + 几个 bat，没有 QQ 本体
 *   - `NapCat.<版本>.Shell/`：真正的 Shell，有 versions/ 或顶层 QQ.exe（napcat.mjs 在 versions 里）
 * 光看「有 bootmain.exe + 有 bat」分不出这两者，所以再数一遍强证据。
 */
function shellEvidence(entries) {
  const evidence = []
  const hasDir = (re) => entries.some((e) => e.isDirectory() && re.test(e.name))
  const hasFile = (re) => entries.some((e) => !e.isDirectory() && re.test(e.name))
  if (hasDir(/^versions$/i)) evidence.push('versions/')
  if (hasFile(/^QQ\.exe$/i)) evidence.push('QQ.exe')
  if (hasFile(/^napcat\.mjs$/i)) evidence.push('napcat.mjs')
  return { shell: evidence.length > 0, evidence }
}

/**
 * 扫一个盘。BFS + 深度限制 + 名字黑名单；每 4000 个条目让一次事件循环，
 * 否则设置页那边会因为主线程被 IO 占满而看起来卡死。
 */
async function scanOneDrive(drive, { maxDepth = 7, maxDirs = 250000, budgetMs = 90000 } = {}) {
  const root = /[\\/]$/.test(drive) ? drive : `${drive}\\`
  const queue = [{ dir: root, depth: 0 }]
  let head = 0
  let ops = 0
  const started = Date.now()
  scan.drive = drive.replace(/[\\/]+$/, '')
  scan.maxDepth = maxDepth
  while (head < queue.length) {
    if (scan.cancelled) return
    if (scan.visited >= maxDirs || Date.now() - started > budgetMs) {
      scan.limitHit = true
      return
    }
    const item = queue[head++]
    let entries = []
    try {
      entries = readdirSync(item.dir, { withFileTypes: true })
    } catch {
      continue
    }
    scan.visited += 1
    const names = entries.map((e) => e.name)
    if (looksLikeShellDirLoose(item.dir, names)) {
      const full = item.dir.replace(/\\/g, '/')
      if (!scan.found.some((f) => f.path === full)) {
        const ev = shellEvidence(entries)
        scan.found.push({
          path: full,
          name: path.basename(item.dir),
          launcher: detectLauncher(item.dir, scan.account),
          boot: names.some((n) => /^NapCatWinBootMain\.exe$/i.test(n)),
          shell: ev.shell,
          evidence: ev.evidence,
          drive: String(drive).slice(0, 2),
        })
      }
      continue // 命中就不再往下钻，免得在 QQ 的几千个文件里打转
    }
    if (item.depth >= maxDepth) continue
    for (const entry of entries) {
      if (!entry.isDirectory()) continue // 符号链接/联接点也别跟，容易绕圈
      if (SCAN_SKIP_NAMES.has(entry.name.toLowerCase())) continue
      queue.push({ dir: path.join(item.dir, entry.name), depth: item.depth + 1 })
    }
    ops += entries.length
    if (ops >= 4000) {
      ops = 0
      scan.visited = scan.visited
      await new Promise((r) => setImmediate(r))
    }
  }
}

/** 开扫（不 await，立刻返回；进度从 /state 的 scan 段拿） */
async function startScan(cfg, driveSpec) {
  if (scan.running) {
    return { ok: false, said: `已经在扫 ${scan.drive || scan.drives.join('、')} 了，等我扫完这一轮` }
  }
  const drives = listDrives()
  if (!drives.length) return { ok: false, said: '一个盘都没读出来（权限问题？）' }
  const want = String(driveSpec || '')
    .trim()
    .toUpperCase()
    .replace(/[\\/]/g, '')
  const wantNorm = want && !/[：:]$/.test(want) ? `${want.slice(0, 1)}:` : want.replace('：', ':')
  let targets
  if (!want || want === 'ALL') targets = drives.slice()
  else if (drives.includes(wantNorm)) targets = [wantNorm]
  else return { ok: false, said: `本机没有 ${wantNorm || driveSpec} 这个盘（现有：${drives.join(' ')}）` }

  Object.assign(scan, {
    running: true,
    drives: targets,
    driveIndex: 0,
    drive: '',
    visited: 0,
    found: [],
    startedAt: Date.now(),
    endedAt: 0,
    elapsedMs: 0,
    cancelled: false,
    limitHit: false,
    error: '',
    account: (cfg && cfg.launchAccount) || '',
  })
  log(cfg, `scan: start ${targets.join(',')} (maxDepth=${scan.maxDepth})`)
  const budget = targets.length > 1 ? 45000 : 90000
  ;(async () => {
    try {
      for (let i = 0; i < targets.length; i++) {
        if (scan.cancelled) break
        scan.driveIndex = i
        await scanOneDrive(targets[i], { budgetMs: budget })
      }
    } catch (error) {
      scan.error = String((error && error.message) || error)
      log(cfg, `scan: error ${scan.error}`)
    } finally {
      scan.running = false
      scan.endedAt = Date.now()
      scan.elapsedMs = scan.endedAt - scan.startedAt
      log(
        cfg,
        `scan: done drives=${scan.drives.join(',')} visited=${scan.visited} found=${scan.found.length}` +
          `${scan.limitHit ? ' limit-hit' : ''}${scan.cancelled ? ' cancelled' : ''}`,
      )
    }
  })()
  return {
    ok: true,
    said:
      `开始扫 ${targets.join('、')}（深度 ${scan.maxDepth} 层，跳过系统目录，` +
      `单盘最多 ${Math.round(budget / 1000)} 秒，命中就停在那条路径不再往下钻）`,
  }
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
  cfg.nodePath = String(cfg.nodePath || '').trim().replace(/"/g, '')
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
  cfg.rememberPassword = cfg.rememberPassword === true || cfg.rememberPassword === 'true' || cfg.rememberPassword === 1
  // 密码原样保留（空格也可能属于密码），只把换行去掉——换行会破坏生成的 bat
  cfg.quickPassword = String(cfg.quickPassword == null ? '' : cfg.quickPassword).replace(/[\r\n]/g, '')
  // 没有密码、没有账号，「记住密码」就等于没打开
  if (!cfg.quickPassword || !cfg.launchAccount) cfg.rememberPassword = false
  return cfg
}

function resolveConfig(raw) {
  const home = dshHome()
  const dir = keeperDir()
  // 老版本的东西摊在 ~/.dsh 根上，先搬进 dir 再读配置（否则读的是搬走前的那份）
  migrateLegacyFiles(dir)
  // 优先级：内置默认 < cordis 里的 config < 设置界面存下来的 json
  const cfg = { ...DEFAULTS, ...(raw || {}), ...readConfigFile(dir) }
  normalizeConfig(cfg)
  // v2.2.2：shellDir 不再自动探测/自动填，空着就等用户在设置页里扫盘选或者手填
  if (!cfg.launcherScript) cfg.launcherScript = detectLauncher(cfg.shellDir, cfg.launchAccount)
  if (!cfg.logPath) cfg.logPath = path.join(dir, 'keeper.log')
  if (!cfg.launcherLog) cfg.launcherLog = path.join(dir, 'launch.log')
  if (!cfg.lockPath) cfg.lockPath = path.join(dir, 'lock.json')
  if (!cfg.statePath) cfg.statePath = path.join(dir, 'state.json')
  if (!cfg.qrCopyPath) cfg.qrCopyPath = path.join(dir, 'qr.png')
  // qq-bridge-state.json 是 dsh-qq-bridge 写的，不归我们管，留在 ~/.dsh 根上
  if (!cfg.bridgeStatePath) cfg.bridgeStatePath = path.join(home, 'qq-bridge-state.json')
  if (!cfg.configPath) cfg.configPath = configFilePath(dir)
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

const PS_PROCS =
  "$ErrorActionPreference='SilentlyContinue';" +
  // node 也要算：无头版（Node 包）只有 node.exe 一条进程，没有 QQ.exe
  "Get-Process QQ,NapCatWinBootMain,node | " +
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
  const out = await runPs(PS_PROCS, 15000)
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
  // 顺手喂给设置界面的缓存：看门狗每轮的探测结果直接复用，面板不再另开 PowerShell
  try {
    uiCache.procs = result
    uiCache.procsAt = Date.now()
  } catch {}
  return result
}

/** 找 versions/<ver>/resources/app/napcat/cache/qrcode.png，取最新的那张 */
function qrInfo(cfg) {
  try {
    const versionsDir = path.join(cfg.shellDir, 'versions')
    if (!existsSync(versionsDir)) {
      // 无头版（Node 包）没有 versions/ 层：二维码落在 <shellDir>\napcat\cache\qrcode.png
      const direct = path.join(cfg.shellDir, 'napcat', 'cache', 'qrcode.png')
      try {
        const st = statSync(direct)
        const age = Math.round((Date.now() - st.mtimeMs) / 1000)
        let copyDirect = ''
        if (age <= cfg.qrFreshSec) {
          try {
            mkdirSync(path.dirname(cfg.qrCopyPath), { recursive: true })
            copyFileSync(direct, cfg.qrCopyPath)
            copyDirect = cfg.qrCopyPath
          } catch {}
        }
        return { file: direct, ageSec: age, copy: copyDirect }
      } catch {
        return null
      }
    }
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

/** 找启动脚本：配置的绝对/相对路径 → 在 shellDir 里挑 → 用 QQ 号现生成一个 */
function resolveLauncherPath(cfg) {
  const raw = String(cfg.launcherScript || '').trim()
  if (raw) {
    const asIs = path.isAbsolute(raw) ? raw : path.join(cfg.shellDir || '', raw)
    if (existsSync(asIs)) return asIs
  }
  // Shell 型（顶层有 napcat.mjs）：直接用自己的 node 跑，不依赖那台机器装没装 node
  const standaloneMjs = findStandaloneNapcatMjs(cfg.shellDir)
  if (standaloneMjs) {
    const node = resolveNode(cfg)
    if (node.path) {
      const file = path.join(keeperDir(), 'autogen-node.bat')
      const args = String(cfg.launchArgs || '').trim()
      const body =
        '@echo off\r\n' +
        'chcp 65001 >nul\r\n' +
        'rem dsh-napcat-keeper 自动生成：Shell 型 NapCat，用下面这份 node 跑 napcat.mjs\r\n' +
        `rem node（${node.source}）：${node.path}\r\n` +
        `cd /d "${cfg.shellDir}"\r\n` +
        `"${node.path}" "${standaloneMjs}"${args ? ` ${args}` : ''}\r\n`
      try {
        writeFileSync(file, body, 'utf8')
        log(cfg, `autogen node launcher: ${file} (node ${node.source} → ${node.path})`)
        return file
      } catch (error) {
        log(cfg, `autogen node launcher 写不出来（${String((error && error.message) || error)}），退回找现成的 bat`)
      }
    } else {
      log(cfg, 'Shell 型 NapCat（找到 napcat.mjs）但一个 node.exe 都没找到 —— 在设置里手填「Node 运行时」')
    }
  }
  if (cfg.shellDir) {
    const guessed = detectLauncher(cfg.shellDir, cfg.launchAccount)
    if (guessed) return path.join(cfg.shellDir, guessed)
  }
  if (cfg.shellDir && cfg.launchAccount) {
    // 用户只填了 QQ 号：直接调 NapCatWinBootMain.exe，不依赖别人的 quick bat
    const boot = findBootMain(cfg.shellDir)
    if (boot) {
      const file = path.join(keeperDir(), 'autogen.bat')
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

/* ── Node 运行时：优先用 DSH 自己带的那一份 ──────────────────────────────────
 *
 * 为什么要有这一段：插件里凡是「要跑一段 JS」的活，都不该指望系统 PATH 里恰好装过 node，
 * 更不该去蹭 NapCat / QQ 那边的运行时 —— 那边的 Node 是 QQ.exe 自己的私有环境
 * （OneKey 注入版的 NapCat 干脆就跑在 `QQ.exe --type=utility --utility-sub-type=node.mojom.NodeService`
 * 这个进程里，磁盘上根本没有 node.exe 给你调）。而 DSH NEXT 自带一份 node：
 *   <DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe
 * 用它最稳，版本还跟 DSH 本身一致：只要 DSH 在，node 就在，换机器换人装都不用额外安装。
 *
 * 顺序：手填 → DSH 自带（含「当前进程就是 node」）→ 系统 PATH → 常见安装目录 → NapCat 目录兜底。
 */

/** DSH 自带 node 的候选路径（按可能性排序，去重） */
function dshBundledNodeCandidates() {
  const out = []
  const push = (p) => {
    const v = String(p || '').trim()
    if (v && !out.includes(v)) out.push(v)
  }

  const exeName = process.platform === 'win32' ? 'node.exe' : 'node'
  const rel = (arch) => path.join('runtime', arch, 'primary-runtime', 'dependencies', 'node', 'bin', exeName)

  // ① 插件本身就跑在 DSH 的运行时里（DSH 用 utility process 载入插件时，这个最准）
  //    注意：只有路径里带 primary-runtime 才算，否则 process.execPath 只是「外面随手起的一个 node」，
  //    把它当 DSH 自带会指错地方（也把系统 node 冒充成 DSH 的）。
  const self = String(process.execPath || '')
  if (/[\\/]primary-runtime[\\/]/i.test(self)) push(self)

  // ② 显式指定（排查时最省事）
  push(process.env.DSH_NODE_PATH)
  push(process.env.DSH_NODE)

  // ③ 按 DSH 的安装布局推算：<DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe
  const roots = []
  if (process.resourcesPath) roots.push(process.resourcesPath)
  if (self) {
    const exeDir = path.dirname(self)
    roots.push(exeDir)
    if (/[\\/]resources$/i.test(exeDir)) roots.push(path.join(path.dirname(exeDir), 'resources'))
  }
  const archs = [process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64']
  if (archs[0] !== 'x64') archs.push('x64')
  for (const root of roots) {
    for (const arch of archs) {
      push(path.join(root, rel(arch)))
      push(path.join(root, 'app.asar.unpacked', rel(arch)))
    }
  }
  return out
}

function nodeCacheKey(cfg) {
  return `${(cfg && cfg.nodePath) || ''}|${(cfg && cfg.shellDir) || ''}`
}

/**
 * 解析出一个能用的 node.exe：{ path, source, tried }。
 * path 为空表示一个都没找到（source 也为空，tried 里是找过的位置，方便在设置页里说清楚）。
 * 结果缓存 60 秒：设置页 2 秒轮询一次，不能每次都去 where.exe 一遍。
 */
function resolveNode(cfg, maxAgeMs = 60000) {
  const key = nodeCacheKey(cfg)
  const now = Date.now()
  if (uiCache.node && uiCache.nodeKey === key && now - (uiCache.nodeAt || 0) < maxAgeMs) {
    return uiCache.node
  }

  const tried = []
  const consider = (candidate, source) => {
    const p = String(candidate || '').trim()
    if (!p) return null
    tried.push(`${source}：${p}`)
    try {
      if (existsSync(p) && statSync(p).isFile()) return { path: p, source, tried }
    } catch {}
    return null
  }

  let hit = null
  const manual = String((cfg && cfg.nodePath) || '').trim()
  if (manual) hit = consider(manual, '手填')

  if (!hit) {
    for (const candidate of dshBundledNodeCandidates()) {
      hit = consider(candidate, 'DSH 自带')
      if (hit) break
    }
  }
  if (!hit) {
    const where = captureSync('where.exe', ['node'], 4000)
    for (const line of String(where || '').split(/\r?\n/)) {
      hit = consider(line.trim(), '系统 PATH')
      if (hit) break
    }
  }
  if (!hit) {
    const common = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'nodejs', 'node.exe'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'nodejs', 'node.exe'),
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
    ]
    for (const candidate of common) {
      hit = consider(candidate, '系统安装目录')
      if (hit) break
    }
  }
  if (!hit && cfg && cfg.shellDir) {
    for (const candidate of [
      path.join(cfg.shellDir, 'node.exe'),
      path.join(cfg.shellDir, 'runtime', 'node.exe'),
    ]) {
      hit = consider(candidate, 'NapCat 目录')
      if (hit) break
    }
  }

  const result = hit ? { ...hit, tried } : { path: '', source: '', tried }
  uiCache.node = result
  uiCache.nodeKey = key
  uiCache.nodeAt = now
  return result
}

/** node -v 的版本号（缓存 10 分钟；这是个要起进程的操作） */
function nodeVersion(nodeExe) {
  const p = String(nodeExe || '').trim()
  if (!p) return ''
  if (uiCache.nodeVersion && uiCache.nodeVersionPath === p && Date.now() - (uiCache.nodeVersionAt || 0) < 600000) {
    return uiCache.nodeVersion
  }
  const raw = captureSync(p, ['-v'], 5000)
  const version = String(raw || '').trim().split(/\s+/)[0] || ''
  uiCache.nodeVersion = version
  uiCache.nodeVersionPath = p
  uiCache.nodeVersionAt = Date.now()
  return version
}

/** 给设置页 / 状态接口看的 node 摘要 */
function nodePublic(cfg) {
  const found = resolveNode(cfg)
  return {
    path: found.path,
    source: found.source,
    version: found.path ? nodeVersion(found.path) : '',
    tried: found.tried || [],
  }
}

/**
 * Shell 型 NapCat 的入口：只认**顶层**的 napcat.mjs。
 * 注入版把 napcat.mjs 塞在 versions\<版本>\resources\app\napcat\ 下面 ——
 * 那份是等着被 QQ 注入的，用普通 node 去跑只会报找不到 QQ 的原生模块，绝对不能碰。
 */
function findStandaloneNapcatMjs(dir) {
  if (!dir) return ''
  const direct = path.join(dir, 'napcat.mjs')
  try {
    if (existsSync(direct) && statSync(direct).isFile()) return direct
  } catch {}
  return ''
}

/** 无窗口壳 .vbs 的路径（跟日志放同一个目录） */
function taskWrapperPath(cfg) {
  const dir = path.dirname(cfg.launcherLog || path.join(keeperDir(), 'launch.log'))
  return path.join(dir, 'launch.vbs')
}

/** 「记住密码」时生成的那个 bat：设好环境变量，再 call 真正的启动脚本 */
function envBatPath(cfg) {
  const dir = path.dirname(cfg.launcherLog || path.join(keeperDir(), 'launch.log'))
  return path.join(dir, 'env.bat')
}

/** 密码是否真的在生效（三个条件缺一不可） */
function passwordActive(cfg) {
  return Boolean(cfg && cfg.rememberPassword && cfg.quickPassword && cfg.launchAccount)
}

function md5Hex(text) {
  return createHash('md5').update(String(text), 'utf8').digest('hex')
}

/**
 * bat 里 `set "K=V"` 的转义：引号在 set 语法里没法安全出现，直接剔除；
 * `%` 会被 cmd 展开，双写；`^` 在引号内不特殊，剩下的都靠外层引号包住。
 */
function batValue(value) {
  return String(value == null ? '' : value)
    .replace(/[\r\n]/g, '')
    .replace(/"/g, '')
    .replace(/%/g, '%%')
}

/** 中间层 bat 的内容（writeEnvBat 与「提权交接」脚本共用，保证两边一模一样） */
function envBatLines(cfg, target) {
  return [
    '@echo off',
    'rem dsh-napcat-keeper: 自动生成，改了也会被覆盖；关掉「记住密码」这个文件会被删掉',
    `set "ACCOUNT=${batValue(cfg.launchAccount)}"`,
    `set "NAPCAT_QUICK_PASSWORD=${batValue(cfg.quickPassword)}"`,
    `set "NAPCAT_QUICK_PASSWORD_MD5=${md5Hex(cfg.quickPassword)}"`,
    `call "${target}"${cfg.launchArgs ? ` ${cfg.launchArgs}` : ''}`,
    '',
  ]
}

/**
 * 写「带密码」的启动壳。
 * 为什么不直接改用户的 napcat.quick2.bat：那是人家自己的文件，插件只生成自己的中间层，
 * 关掉「记住密码」时把这个文件删掉就干净了；任务计划里也只出现这个中间层的路径，不出现密码。
 */
function writeEnvBat(cfg, bat) {
  const target = bat || resolveLauncherPath(cfg)
  if (!passwordActive(cfg) || !target) return ''
  const file = envBatPath(cfg)
  const lines = envBatLines(cfg, target)
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, lines.join('\r\n'), 'utf8')
    return file
  } catch (error) {
    log(cfg, `env bat 写不出来（${String((error && error.message) || error)}），这次退回不带密码的启动`)
    return ''
  }
}

function removeEnvBat(cfg) {
  const file = envBatPath(cfg)
  try {
    if (existsSync(file)) {
      unlinkSync(file)
      log(cfg, `env bat removed: ${file}`)
    }
  } catch {}
}

/** 真正要跑的那条 cmd 命令 */
function taskCommandLine(cfg, bat) {
  // 记住密码时改走中间层（set 环境变量 → call 原脚本），其余情况原样直跑
  const viaEnv = passwordActive(cfg) ? writeEnvBat(cfg, bat) : ''
  const target = viaEnv || bat
  return (
    `cmd.exe /c chcp 65001 >nul & cd /d "${cfg.shellDir}" & call "${target}" ` +
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
  // 关掉「记住密码」时清掉旧的中间层，免得密码继续留在磁盘上
  if (!passwordActive(cfg)) removeEnvBat(cfg)
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
  if (passwordActive(cfg)) {
    log(
      cfg,
      `自动登录已武装：账号 ${cfg.launchAccount}，token 失效时 NapCat 会用密码重新登录（密码不进日志）`,
    )
  }
  const ps =
    `$ErrorActionPreference='SilentlyContinue';` +
    `$t=Get-ScheduledTask -TaskName '${cfg.taskName.replace(/'/g, "''")}';` +
    `if($t){$s=$t.Settings;$s.ExecutionTimeLimit='PT0S';$s.DisallowStartIfOnBatteries=$false;` +
    `$s.StopIfGoingOnBatteries=$false;Set-ScheduledTask -TaskName '${cfg.taskName.replace(/'/g, "''")}' -Settings $s | Out-Null}`
  void runPs(ps)
  return { ok: true, created: true }
}

/**
 * 计划任务的动作是写死的绝对路径（wscript.exe "<vbs>"）。文件搬了家、或者日志目录换了，
 * 任务就指向一个不存在的脚本 —— 开机静默失败，人还以为是别的原因。
 *
 * 这里只在「动作里的路径已经不是当前该用的那个」时改一次，用 /change 就地改：
 * 不动 /end，正在跑的那条 QQ 进程链不会被踢下来。
 */
function repairTaskActions(cfg) {
  if (!cfg.taskName) return { ok: true, skipped: true }
  if (state.taskActionsChecked) return { ok: true, skipped: true }
  let xml = ''
  try {
    xml = captureSync('schtasks.exe', ['/query', '/tn', cfg.taskName, '/xml'], 8000)
  } catch {
    xml = ''
  }
  // 任务不存在（或查不动）：不用管，真要建是 ensureTask 的活
  if (!xml || !xml.trim()) return { ok: true, skipped: true }
  const bat = resolveLauncherPath(cfg)
  if (!bat) return { ok: true, skipped: true }
  const wanted = cfg.hideConsole !== false ? taskWrapperPath(cfg) : passwordActive(cfg) ? envBatPath(cfg) : bat
  state.taskActionsChecked = true
  if (xml.includes(wanted)) return { ok: true, skipped: true }
  try {
    let inner = ''
    if (cfg.hideConsole !== false) {
      const vbs = writeTaskWrapper(cfg, bat, true)
      inner = `wscript.exe "${vbs}"`
    } else {
      inner = taskCommandLine(cfg, bat)
    }
    execFileSync('schtasks.exe', ['/change', '/tn', cfg.taskName, '/tr', inner], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 15000,
    })
    state.taskReady = undefined
    log(cfg, `task "${cfg.taskName}" 动作已改指到 ${wanted}`)
    return { ok: true, repaired: true }
  } catch (error) {
    state.taskActionsChecked = false
    return { ok: false, error: String((error && error.message) || error) }
  }
}

/* ── 提权交接：插件不自己去要管理员，改成给你一个双击就行的脚本 ──────────────
 *
 * 为什么要这样：DSH 自己是普通权限进程。插件偶尔要做几件「可能要管理员」的事
 * （往 Program Files 里的 NapCat 目录补启动脚本、建计划任务、给 OneBot 端口开防火墙），
 * 而插件既不该、也没法替人按下 UAC 里那个「是」。
 *
 * 所以改成这样：
 *   1. 插件把要做的每一步写进 plan.json（步骤由插件自己生成，来源可信）；
 *   2. 生成 apply.ps1：先数一遍「这些步骤里有没有真需要管理员的」，
 *      没有就直接干；有才 Start-Process -Verb RunAs 自我提权 ——
 *      UAC 弹窗就是用户亲手点的那一下确认；
 *   3. 生成 apply-admin.cmd：双击入口，省得用户去右键「以管理员身份运行」；
 *   4. 每步结果写 result.json，设置页读回来说清楚哪条成了、哪条没成；
 *   5. 另外给一个 undo-admin.cmd，反着把插件建过的东西删掉。
 *
 * 所有产物只在 ~/.dsh/dsh-napcat-keeper/setup 一个目录里，整个删掉就等于撤回。
 */

const SETUP_NEEDS = {
  launcher: {
    label: '补一个启动脚本',
    hint: '往 Shell 目录写 napcat.quick.auto.bat，直接调 NapCatWinBootMain.exe（目录里没有别的 bat 时才需要）',
  },
  envbat: {
    label: '写「记住密码」中间层',
    hint: 'napcat-keeper-env.bat：账号与密码走环境变量交给 NapCat，密码只落这一个文件',
  },
  task: {
    label: '建 / 重建计划任务',
    hint: '开机不靠 DSH 也能拉起 QQ；用户级任务，通常不需要管理员',
  },
  firewall: {
    label: '放行 OneBot 端口（入站）',
    hint: '别的设备要连这个端口时才需要；这条一定会弹 UAC',
  },
}

function setupPaths() {
  const dir = path.join(keeperDir(), 'setup')
  migrateLegacyFiles()
  return {
    dir,
    ps1: path.join(dir, 'apply.ps1'),
    cmd: path.join(dir, 'apply-admin.cmd'),
    undoCmd: path.join(dir, 'undo-admin.cmd'),
    plan: path.join(dir, 'plan.json'),
    result: path.join(dir, 'result.json'),
    runLog: path.join(dir, 'run.log'),
    readme: path.join(dir, 'README.txt'),
  }
}

/** 目录能不能写：自己不存在就往上看，找一个存在的祖先试（免得把「没建过」当成「不可写」） */
function dirWritable(dir) {
  if (!dir) return false
  let probe = dir
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(probe)) {
      try {
        accessSync(probe, fsConstants.W_OK)
        return true
      } catch {
        return false
      }
    }
    const up = path.dirname(probe)
    if (up === probe || !up) break
    probe = up
  }
  return false
}

/** findBootMain 会递归翻目录，设置页每次刷新都调太贵 —— 缓存 60 秒，换了 Shell 目录就重算 */
function cachedBootMain(cfg, maxAgeMs = 60000) {
  const key = cfg.shellDir || ''
  const now = Date.now()
  if (
    uiCache.bootMain !== undefined &&
    uiCache.bootMainKey === key &&
    now - (uiCache.bootMainAt || 0) < maxAgeMs
  ) {
    return uiCache.bootMain
  }
  let found = ''
  if (key) {
    try {
      found = findBootMain(key)
    } catch {
      found = ''
    }
  }
  uiCache.bootMain = found
  uiCache.bootMainKey = key
  uiCache.bootMainAt = now
  return found
}

/** 没有别的启动脚本时用的那个 bat：直接调 NapCatWinBootMain.exe */
function launcherBatLines(cfg, boot) {
  const account = batValue(cfg.launchAccount)
  const args = String(cfg.launchArgs || '').trim()
  return [
    '@echo off',
    'chcp 65001 >nul',
    'rem dsh-napcat-keeper 自动生成：目录里没有别的启动脚本时才用它，直接调 NapCatWinBootMain.exe',
    'cd /d "%~dp0"',
    `set "ACCOUNT=${account}"`,
    `start "" "${boot}"${account ? ` ${account}` : ''}${args ? ` ${args}` : ''}`,
    '',
  ]
}

/** 任务里那条命令（纯字符串版本：不写盘，供「脚本」复用 taskCommandLine 的规则） */
function taskCommandLinePure(cfg, bat) {
  const target = passwordActive(cfg) && bat ? envBatPath(cfg) : bat
  return (
    `cmd.exe /c chcp 65001 >nul & cd /d "${cfg.shellDir}" & call "${target}" ` +
    `>> "${cfg.launcherLog}" 2>&1`
  )
}

/** 给设置页看的清单：每个需要能不能做、要不要管理员 */
function needCatalog(cfg) {
  const boot = (() => {
    try {
      return cachedBootMain(cfg)
    } catch {
      return ''
    }
  })()
  const bat = resolveLauncherPath(cfg)
  return Object.entries(SETUP_NEEDS).map(([id, meta]) => {
    let ready = true
    let why = ''
    let needAdmin = false
    if (id === 'launcher') {
      ready = Boolean(boot)
      if (!boot) why = 'Shell 目录里没找到 NapCatWinBootMain.exe'
      needAdmin = Boolean(boot) && !dirWritable(cfg.shellDir)
      if (needAdmin) why = 'Shell 目录当前不可写（大概在 Program Files 里，要管理员）'
    } else if (id === 'envbat') {
      ready = passwordActive(cfg) && Boolean(bat)
      if (!passwordActive(cfg)) why = '先打开「记住密码」并填好账号'
      else if (!bat) why = '先在 Shell 目录里找到启动脚本'
      needAdmin = Boolean(ready) && !dirWritable(path.dirname(envBatPath(cfg)))
    } else if (id === 'task') {
      ready = Boolean(cfg.taskName) && Boolean(bat)
      if (!cfg.taskName) why = '先填计划任务名'
      else if (!bat) why = '先填 Shell 目录（找得到启动脚本才建任务）'
    } else if (id === 'firewall') {
      ready = Boolean(cfg.onebotPort)
      if (!ready) why = '先填 OneBot 端口'
      needAdmin = true
    }
    return { id, label: meta.label, hint: meta.hint, ready, why, needAdmin }
  })
}

/** 把「要做的事」摊成步骤数组（plan.json 里的 steps） */
function buildSetupSteps(cfg, wants) {
  const picked = Array.isArray(wants) && wants.length ? wants : Object.keys(SETUP_NEEDS)
  const want = new Set(picked.filter((id) => SETUP_NEEDS[id]))
  const steps = []
  const bat = resolveLauncherPath(cfg)

  if (want.has('launcher')) {
    const boot = (() => {
      try {
        return cachedBootMain(cfg)
      } catch {
        return ''
      }
    })()
    if (boot) {
      const file = path.join(cfg.shellDir, 'napcat.quick.auto.bat')
      steps.push({
        id: 'launcher',
        label: '补启动脚本 napcat.quick.auto.bat',
        kind: 'writeFile',
        path: file,
        admin: !dirWritable(cfg.shellDir),
        note: '直接调 NapCatWinBootMain.exe，账号走环境变量',
        contentBase64: Buffer.from(launcherBatLines(cfg, boot).join('\r\n'), 'utf8').toString('base64'),
      })
    }
  }

  if (want.has('envbat') && passwordActive(cfg) && bat) {
    const file = envBatPath(cfg)
    steps.push({
      id: 'envbat',
      label: '写「记住密码」中间层 napcat-keeper-env.bat',
      kind: 'writeFile',
      path: file,
      admin: !dirWritable(path.dirname(file)),
      note: '只在本机磁盘里，关掉「记住密码」或点「清除密码」就删',
      secret: true,
      contentBase64: Buffer.from(envBatLines(cfg, bat).join('\r\n'), 'utf8').toString('base64'),
    })
  }

  if (want.has('task') && cfg.taskName && bat) {
    const requires = []
    let inner = ''
    if (cfg.hideConsole !== false) {
      const vbs = taskWrapperPath(cfg)
      const cmdLine = taskCommandLinePure(cfg, bat).replace(/"/g, '""')
      const body = [
        'Option Explicit',
        'Dim sh',
        'Set sh = CreateObject("WScript.Shell")',
        `sh.Run "${cmdLine}", 0, False`,
        '',
      ].join('\r\n')
      steps.push({
        id: 'task-wrapper',
        label: '写无窗口壳 launch.vbs',
        kind: 'writeFile',
        path: vbs,
        admin: !dirWritable(path.dirname(vbs)),
        note: '计划任务跑它，桌面才不会挂一个黑框',
        contentBase64: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]).toString(
          'base64',
        ),
      })
      requires.push('task-wrapper')
      inner = `wscript.exe "${vbs}"`
    } else {
      inner = taskCommandLinePure(cfg, bat)
    }
    if (passwordActive(cfg)) requires.push('envbat')
    steps.push({
      id: 'task',
      label: `建计划任务「${cfg.taskName}」`,
      kind: 'scheduledTask',
      admin: false,
      note: '用户级任务，一般不需要管理员；系统策略挡着时脚本会把错误原样告诉你',
      requires,
      name: cfg.taskName,
      command: inner,
    })
  }

  if (want.has('firewall') && cfg.onebotPort) {
    const port = Number(cfg.onebotPort) || 3000
    steps.push({
      id: 'firewall',
      label: `放行 TCP ${port} 入站`,
      kind: 'firewallRule',
      admin: true,
      note: '只有别的设备要连 OneBot 端口时才需要；这条一定会弹 UAC',
      name: `dsh-napcat-keeper OneBot ${port}`,
      port,
    })
  }
  return steps
}

/** apply.ps1 的全文：这段是插件的固定产物，跟 plan.json 一起决定脚本会干什么 */
function applyPs1Source() {
  return `# dsh-napcat-keeper 提权交接脚本（插件自动生成，改了也会被覆盖）
# 双击同目录的 apply-admin.cmd 干活；想撤干净就双击 undo-admin.cmd。
param([switch]$Elevated, [switch]$Undo)
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$planPath = Join-Path $here 'plan.json'
$resultPath = Join-Path $here 'result.json'
$runLog = Join-Path $here 'run.log'
# run.log 只追加不滚动会长到没人看：超过 256KB 就换新的一份
try {
  if ((Test-Path -LiteralPath $runLog) -and ((Get-Item -LiteralPath $runLog).Length -gt 262144)) {
    Remove-Item -LiteralPath $runLog -Force -ErrorAction SilentlyContinue
  }
} catch {}

function Say($text) {
  $line = ('[{0}] {1}' -f (Get-Date -Format 'HH:mm:ss'), $text)
  Write-Host $line
  try { Add-Content -LiteralPath $runLog -Value $line -Encoding UTF8 } catch {}
}

function Wait-Key {
  if ($env:NPK_NO_PAUSE -eq '1') { return }
  Write-Host ''
  Write-Host '按任意键关掉这个窗口。'
  try { $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown') } catch {}
}

if (-not (Test-Path -LiteralPath $planPath)) {
  Say 'plan.json 不在了 —— 回 DSH 设置页重新生成一次。'
  Wait-Key
  exit 2
}

$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$steps = @($plan.steps)
$mode = 'apply'
if ($Undo) {
  $mode = 'undo'
  $rev = @()
  for ($i = $steps.Count - 1; $i -ge 0; $i--) { $rev += $steps[$i] }
  $steps = $rev
}

Say ('开始（' + $mode + '）：' + $steps.Count + ' 步')

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$needAdmin = @($steps | Where-Object { $_.admin -eq $true }).Count -gt 0

if ((!$Undo) -and $needAdmin -and (-not $admin) -and (-not $Elevated)) {
  Say '这批步骤里有要管理员才行的，马上弹 UAC —— 请点「是」；点「否」就什么都不改。'
  $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-Elevated')
  try {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argList
    Say '已经把活交给提权那个窗口了，跑完看同目录的 result.json。'
  } catch {
    Say '没拿到管理员权限（UAC 被拒或这台机器不给提权），这次什么都没改。'
  }
  Wait-Key
  exit 0
}

$results = @()
$failed = @{}
foreach ($s in $steps) {
  $entry = [ordered]@{ id = $s.id; label = $s.label; ok = $false; skipped = $false; message = '' }
  if ((!$Undo) -and $s.requires) {
    $miss = @($s.requires | Where-Object { $failed.ContainsKey($_) })
    if ($miss.Count -gt 0) {
      $entry.skipped = $true
      $entry.message = '前一步没成（' + ($miss -join '、') + '），这步跳过'
      Say ('跳过 ' + $s.label + '：' + $entry.message)
      $results += $entry
      continue
    }
  }
  try {
    switch ($s.kind) {
      'writeFile' {
        if ($Undo) {
          if (Test-Path -LiteralPath $s.path) {
            Remove-Item -LiteralPath $s.path -Force
            $entry.message = '已删除'
          } else {
            $entry.message = '本来就没有'
          }
        } else {
          $dir = Split-Path -Parent $s.path
          if ($dir -and (-not (Test-Path -LiteralPath $dir))) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
          $bytes = [Convert]::FromBase64String($s.contentBase64)
          [IO.File]::WriteAllBytes($s.path, $bytes)
          if ($s.secret) { $entry.message = '已写入（内容不外显）' } else { $entry.message = '已写入' }
        }
        $entry.ok = $true
      }
      'mkdir' {
        if (-not $Undo) {
          New-Item -ItemType Directory -Force -Path $s.path | Out-Null
          $entry.message = '已建目录'
        } else {
          $entry.message = '不用撤'
        }
        $entry.ok = $true
      }
      'scheduledTask' {
        if ($Undo) {
          $null = & schtasks.exe /delete /tn $s.name /f 2>&1
          $entry.message = '任务已删（本来没有也算）'
        } else {
          # 先结束同名旧任务（正在跑时 /f 覆盖会被拒）；/st 00:00 会带一句
          # 「时间已过」的自我提醒，成功时不必让用户看见，失败时才把原始输出抛出来
          $null = & schtasks.exe /end /tn $s.name 2>&1
          $createOut = (& schtasks.exe /create /tn $s.name /tr $s.command /sc ONCE /st 00:00 /f 2>&1 | Out-String)
          if ($LASTEXITCODE -ne 0) { throw ('schtasks 失败（退出码 ' + $LASTEXITCODE + '）：' + $createOut.Trim()) }
          $entry.message = '任务已就绪'
        }
        $entry.ok = $true
      }
      'firewallRule' {
        if ($Undo) {
          Get-NetFirewallRule -DisplayName $s.name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
          $entry.message = '规则已删（本来没有也算）'
        } else {
          Get-NetFirewallRule -DisplayName $s.name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
          New-NetFirewallRule -DisplayName $s.name -Direction Inbound -Action Allow -Protocol TCP -LocalPort ([int]$s.port) -Profile Private, Domain -ErrorAction Stop | Out-Null
          $entry.message = ('已放行 TCP ' + [int]$s.port)
        }
        $entry.ok = $true
      }
      default {
        $entry.message = ('不认识的步骤类型 ' + $s.kind)
      }
    }
  } catch {
    $entry.ok = $false
    $entry.message = '出错：' + $_.Exception.Message
  }
  if (-not $entry.ok) { $failed[$s.id] = $true }
  if ($entry.ok) { Say ('好了 ' + $s.label) } else { Say ('没成 ' + $s.label + '：' + $entry.message) }
  $results += $entry
}

$bad = @($results | Where-Object { -not $_.ok })
$payload = [ordered]@{
  at = (Get-Date).ToString('o')
  mode = $mode
  elevated = $admin
  adminNeeded = $needAdmin
  ok = ($bad.Count -eq 0)
  results = $results
}
try {
  $json = $payload | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText($resultPath, $json, (New-Object System.Text.UTF8Encoding($false)))
  Say ('收工：' + $bad.Count + ' 步没成；结果已写回 result.json，回 DSH 设置页点「读结果」就行。')
} catch {
  Say ('结果没写出来：' + $_.Exception.Message)
}
Wait-Key
`
}

/** 双击入口 .cmd：内容全 ASCII，cmd 才不会把它显示成乱码 */
function setupCmdSource() {
  return [
    '@echo off',
    'rem dsh-napcat-keeper - elevation handoff (auto-generated; edits get overwritten)',
    'rem Double-click this file. PowerShell asks for admin only if the plan really needs it.',
    'title dsh-napcat-keeper setup',
    'cd /d "%~dp0"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply.ps1"',
    'if errorlevel 1 pause',
    '',
  ].join('\r\n')
}

function setupUndoCmdSource() {
  return [
    '@echo off',
    'rem dsh-napcat-keeper - undo what this plan created (reverse order)',
    'title dsh-napcat-keeper undo',
    'cd /d "%~dp0"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply.ps1" -Undo',
    'if errorlevel 1 pause',
    '',
  ].join('\r\n')
}

/** 说明文件：给人看的，写清楚会动哪些文件、怎么撤回 */
function setupReadmeText(cfg, plan) {
  const lines = [
    'dsh-napcat-keeper 提权交接目录',
    '',
    '这是什么：',
    '  DSH 自己是普通权限进程，插件偶尔要做几件「可能要管理员」的事。',
    '  插件不自己去要管理员，而是把要做的事写在这里，由你双击一下、在 UAC 上点「是」。',
    '',
    '怎么用：',
    '  1) 双击 apply-admin.cmd；',
    '  2) 如果这批步骤需要管理员，会弹 UAC —— 点「是」；点「否」就什么都不会改；',
    '  3) 跑完回 DSH 设置页点「读结果」，能看到每一步成没成。',
    '',
    '想撤回：双击 undo-admin.cmd（按相反顺序把这次建的东西删掉）。',
    '',
    `生成时间：${plan.createdAt}`,
    `Shell 目录：${cfg.shellDir || '(未配置)'}`,
    `这批步骤${plan.needAdmin ? '需要' : '不需要'}管理员权限。`,
    '',
    '会动的文件 / 规则：',
    ...plan.steps.map((s, i) => {
      const where = s.path || s.name || s.kind
      return `  ${i + 1}. [${s.kind}] ${where}${s.admin ? '（要管理员）' : ''}`
    }),
    '',
    '这几个文件里没有密码明文说明：napcat-keeper-env.bat 里有（那是给 NapCat 用的），',
    '所以这个目录别往外发；关掉「记住密码」或在设置页点「清除密码」就会删掉它。',
    '',
  ]
  return lines.join('\r\n')
}

/** 生成整套脚本，返回给设置页用的摘要（不含任何 secret 内容） */
function writeSetupBundle(cfg, wants) {
  if (process.platform !== 'win32') {
    return { ok: false, error: '这套脚本只对 Windows 有意义' }
  }
  const steps = buildSetupSteps(cfg, wants)
  if (!steps.length) {
    return { ok: false, error: '这次一条可做的步骤都没有（先把 Shell 目录 / 账号 / 任务名填上）' }
  }
  const p = setupPaths()
  const plan = {
    plugin: 'dsh-napcat-keeper',
    version,
    createdAt: new Date().toISOString(),
    shellDir: cfg.shellDir || '',
    account: cfg.launchAccount || '',
    needAdmin: steps.some((s) => s.admin === true),
    steps,
  }
  try {
    mkdirSync(p.dir, { recursive: true })
    writeFileSync(p.plan, `${JSON.stringify(plan, null, 2)}\n`, 'utf8')
    // ps1 必须带 BOM：PowerShell 5.1 没有 BOM 会按 ANSI 解，中文全变乱码
    writeFileSync(
      p.ps1,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(applyPs1Source(), 'utf8')]),
    )
    writeFileSync(p.cmd, setupCmdSource(), 'utf8')
    writeFileSync(p.undoCmd, setupUndoCmdSource(), 'utf8')
    writeFileSync(
      p.readme,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(setupReadmeText(cfg, plan), 'utf8')]),
    )
    try {
      if (existsSync(p.result)) unlinkSync(p.result)
    } catch {}
    log(cfg, `setup bundle 写好了：${p.dir}（${steps.length} 步，needAdmin=${plan.needAdmin}）`)
  } catch (error) {
    const msg = String((error && error.message) || error)
    log(cfg, `setup bundle 写不出来：${msg}`)
    return { ok: false, error: msg }
  }
  return {
    ok: true,
    dir: p.dir,
    cmd: p.cmd,
    ps1: p.ps1,
    undoCmd: p.undoCmd,
    needAdmin: plan.needAdmin,
    steps: steps.map(({ contentBase64, ...rest }) => rest),
  }
}

/** 读脚本写回来的结果（不存在就是「还没跑」） */
function readSetupResult() {
  const p = setupPaths()
  try {
    if (!existsSync(p.result)) return null
    const text = readFileSync(p.result, 'utf8').replace(/^\uFEFF/, '')
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    let results = parsed.results
    if (!Array.isArray(results)) results = results ? [results] : []
    let mtimeMs = 0
    try {
      mtimeMs = statSync(p.result).mtimeMs
    } catch {}
    return {
      at: String(parsed.at || ''),
      mode: String(parsed.mode || 'apply'),
      elevated: Boolean(parsed.elevated),
      ok: Boolean(parsed.ok),
      mtimeMs,
      results: results.map((r) => ({
        id: String((r && r.id) || ''),
        label: String((r && r.label) || ''),
        ok: Boolean(r && r.ok),
        skipped: Boolean(r && r.skipped),
        message: String((r && r.message) || ''),
      })),
    }
  } catch {
    return null
  }
}

/** 上一次生成的那份计划（给设置页显示「你上次要它做什么」） */
function readSetupPlan() {
  const p = setupPaths()
  try {
    if (!existsSync(p.plan)) return null
    const parsed = JSON.parse(readFileSync(p.plan, 'utf8').replace(/^\uFEFF/, ''))
    if (!parsed || typeof parsed !== 'object') return null
    const steps = Array.isArray(parsed.steps) ? parsed.steps : []
    return {
      createdAt: String(parsed.createdAt || ''),
      needAdmin: Boolean(parsed.needAdmin),
      steps: steps.map((s) => ({
        id: String((s && s.id) || ''),
        label: String((s && s.label) || ''),
        kind: String((s && s.kind) || ''),
        where: String((s && (s.path || s.name)) || ''),
        admin: Boolean(s && s.admin),
      })),
    }
  } catch {
    return null
  }
}

function setupState(cfg) {
  const p = setupPaths()
  let exists = false
  try {
    exists = existsSync(p.cmd)
  } catch {}
  return {
    dir: p.dir,
    cmdPath: p.cmd,
    ps1Path: p.ps1,
    undoCmdPath: p.undoCmd,
    exists,
    needs: needCatalog(cfg),
    plan: readSetupPlan(),
    lastRun: readSetupResult(),
  }
}

/** 在资源管理器里选中那个 cmd（不是只打开目录，免得用户还得自己找） */
function openSetupFolder() {
  const p = setupPaths()
  try {
    mkdirSync(p.dir, { recursive: true })
    const hasCmd = existsSync(p.cmd)
    const child = spawn('explorer.exe', [hasCmd ? `/select,${p.cmd}` : p.dir], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.unref()
    return { ok: true, dir: p.dir, cmd: p.cmd, selected: hasCmd }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error), dir: p.dir }
  }
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
  const out = runPs(ps)
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
  // cscript 这条退路也要认「记住密码」：走中间层，否则密码白存
  const viaEnv = passwordActive(cfg) ? writeEnvBat(cfg, batPath) : ''
  const runBat = viaEnv || batPath
  try {
    writeFileSync(
      cmdFile,
      '@echo off\r\n' +
        'chcp 65001 >nul\r\n' +
        `cd /d "${cfg.shellDir}"\r\n` +
        `call "${runBat}" >> "${cfg.launcherLog}" 2>&1\r\n`,
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
  log(cfg, `LAUNCH ok: ${runBat}${reason ? ` (${reason})` : ''} (launch #${state.launchCount})`)
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
    'Get-Process QQ,NapCatWinBootMain,node | ' +
    `Where-Object { $_.Path -like '${root}*' -and $_.StartTime -gt $cut } | ` +
    'ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }'
  await runPs(script)
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
    "Get-Process QQ,NapCatWinBootMain,node -ErrorAction SilentlyContinue | " +
    `Where-Object { $_.Path -like '${root}*' } | ` +
    'ForEach-Object { try { Stop-Process -Id $_.Id -Force -ErrorAction Stop } catch {} }'
  await runPs(script)
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
    await runPs(script)
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
  // 每轮都从配置文件重读一次：改完配置（换目录/换启动脚本）不用重启 DSH 就能生效
  try {
    const fresh = resolveConfig(state.patchConfig || {})
    if (fresh && fresh.enabled === cfg.enabled) cfg = fresh
  } catch {}
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

/**
 * DSH NEXT 已经不带 @deepseek-ai/dsh-tools 了（旧版有），所以这里不再硬依赖它：
 * 拿得到就用它的 defineTool，拿不到就把定义原样交给 ctx.tools.register —— 跟
 * dsh-memory-evolve / dsh-cost-meter 一个 shape（name / description / parameters /
 * output.schema+render / execute）。之前缺这个包就直接放弃注册，napcat_status 和
 * napcat_restart 两个工具在设置页里看不见、agent 也调不到。
 */
function normalizeToolDefinition(def) {
  const parameters =
    def.parameters && typeof def.parameters === 'object'
      ? def.parameters
      : { type: 'object', properties: {} }
  if (!parameters.type) parameters.type = 'object'
  if (!parameters.properties) parameters.properties = {}
  return { ...def, parameters }
}

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
  if (!ctx || !ctx.tools || typeof ctx.tools.register !== 'function') {
    log(cfg, 'tools: unavailable, watchdog-only mode')
    return
  }
  const rawDefine = loadDefineTool()
  // 有 dsh-tools 就走它；没有就直接用裸定义（这才是现在 DSH NEXT 的常态）
  const defineTool = (def) => normalizeToolDefinition(rawDefine ? rawDefine(def) : def)
  const offs = []
  const push = (off) => {
    if (typeof off === 'function') offs.push(off)
  }
  // 一个工具注册失败（例如热重载时重名）不该把另外两个也带走
  const tools = {
    register: (def) => {
      try {
        return ctx.tools.register(def)
      } catch (error) {
        log(cfg, `tools: ${def && def.name} register failed: ${String((error && error.message) || error)}`)
        return undefined
      }
    },
  }
  try {
    push(
      tools.register(
        defineTool({
          name: 'napcat_status',
          description:
            '看 NapCat(QQ) 看门狗此刻的状态：OneBot 是否在线、登录的是哪个号、进程链数量（有无重复链）、二维码是否在等人扫（含副本路径）、dsh-qq-bridge 的轮询有多久没更新、这次用的是哪份 Node 运行时（DSH 自带 / 系统 / 手填），以及最近看门狗日志。',
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
                node: nodePublic(cfg),
                qr,
                bridge: bridgeAge(cfg),
                autoLogin: {
                  rememberPassword: cfg.rememberPassword,
                  passwordActive: passwordActive(cfg),
                  account: cfg.launchAccount,
                  envBat: passwordActive(cfg) ? envBatPath(cfg) : '',
                },
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
                    ? passwordActive(cfg)
                      ? '离线，且在等扫码——但「记住密码」是开着的：看一眼日志里“快速登录错误”后面是不是仍回退到二维码（密码登录可能被腾讯要求验证）。'
                      : '离线，且二维码是新的：需要手机扫码（或在设置里打开「记住密码」让 NapCat 自己用密码登录）。文件在 qrCopyPath。'
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
      tools.register(
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
      tools.register(
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
    nodePath: cfg.nodePath,
    launchAccount: cfg.launchAccount,
    launchArgs: cfg.launchArgs,
    rememberPassword: cfg.rememberPassword,
    /** 只回「存没存、几位」，明文密码永远不出这个函数 */
    hasPassword: Boolean(cfg.quickPassword),
    passwordLength: cfg.quickPassword ? String(cfg.quickPassword).length : 0,
    passwordPath: passwordActive(cfg) ? envBatPath(cfg) : '',
    passwordActive: passwordActive(cfg),
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
  const want = Math.max(1, Math.min(400, lines))
  try {
    const size = statSync(cfg.logPath).size
    // 只读文件尾巴（≤128KB）：日志攒到几 MB 以后全量读会把事件循环按住
    const take = Math.min(size, 131072)
    const fd = openSync(cfg.logPath, 'r')
    let text = ''
    try {
      const buf = Buffer.alloc(take)
      readSync(fd, buf, 0, take, size - take)
      text = buf.toString('utf8')
    } finally {
      closeSync(fd)
    }
    if (size > take) {
      const nl = text.indexOf('\n')
      if (nl >= 0) text = text.slice(nl + 1)
    }
    return text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-want)
  } catch {
    return []
  }
}

/* ---- 设置界面缓存层 ---------------------------------------------------
 * 设置面板每 1.5s 轮询 /state，而 probeProcs 每次要新开一个 powershell.exe
 * （≈300ms CPU / 几十 MB 内存）。面板一旦因为别的原因重挂载，就是一场
 * PowerShell 风暴，会把同一个进程里的 GUI + 全部插件一起拖死。
 * 所以：探测结果缓存 3s + 同刻只允许一个子进程；目录探测 60s 缓存；
 * 磁盘列表 30s 缓存；日志 2s 缓存；schtasks 只读缓存、异步补齐。
 * -------------------------------------------------------------------- */
const uiCache = {
  procs: null,
  procsAt: 0,
  procsInflight: null,
  drives: null,
  drivesAt: 0,
  bootMain: undefined,
  bootMainKey: '',
  bootMainAt: 0,
  setup: null,
  setupAt: 0,
  qr: null,
  qrAt: 0,
  log: null,
  logAt: 0,
  logLines: 0,
  fullInflight: null,
}

/** 带缓存的进程探测，single-flight：并发请求共用同一次子进程。 */
function cachedProcs(cfg, maxAgeMs = 3000) {
  if (uiCache.procs && Date.now() - uiCache.procsAt <= maxAgeMs) {
    return Promise.resolve(uiCache.procs)
  }
  if (uiCache.procsInflight) return uiCache.procsInflight
  uiCache.procsInflight = probeProcs(cfg)
    .then((p) => {
      uiCache.procs = p
      uiCache.procsAt = Date.now()
      return p
    })
    .catch(() => uiCache.procs || { boot: 0, qq: 0, chains: 0, dup: false })
    .finally(() => {
      uiCache.procsInflight = null
    })
  return uiCache.procsInflight
}

/** 盘符列表缓存：插拔移动盘后由 /action 的 drives 动作主动作废 */
function cachedDrives(maxAgeMs = 60000) {
  if (uiCache.drives && Date.now() - uiCache.drivesAt <= maxAgeMs) return uiCache.drives
  try {
    uiCache.drives = listDrives()
  } catch {
    uiCache.drives = uiCache.drives || []
  }
  uiCache.drivesAt = Date.now()
  return uiCache.drives
}

function cachedQr(cfg, maxAgeMs = 3000) {
  if (uiCache.qr && Date.now() - uiCache.qrAt <= maxAgeMs) return uiCache.qr
  uiCache.qr = qrInfo(cfg)
  uiCache.qrAt = Date.now()
  return uiCache.qr
}

function cachedLog(cfg, lines = 40, maxAgeMs = 2000) {
  if (uiCache.log && uiCache.logLines >= lines && Date.now() - uiCache.logAt <= maxAgeMs) {
    return uiCache.log
  }
  uiCache.log = logTail(cfg, lines)
  uiCache.logLines = lines
  uiCache.logAt = Date.now()
  return uiCache.log
}

/** schtasks 只读缓存：首次不再同步阻塞 8s，改为后台补齐 + 下次请求就能读到。 */
function taskReadyCached(cfg) {
  if (!cfg.taskName) return false
  if (state.taskReady !== undefined) return state.taskReady
  if (!state.taskReadyRefreshing) {
    state.taskReadyRefreshing = true
    runCapture('schtasks.exe', ['/query', '/tn', cfg.taskName], 8000)
      .then((out) => {
        state.taskReady = Boolean(out && out.trim())
      })
      .catch(() => {
        state.taskReady = false
      })
      .finally(() => {
        state.taskReadyRefreshing = false
      })
  }
  return null
}

/**
 * 设置界面用的状态快照。
 * light=true 走轮询用的轻量档：不新开 PowerShell、不扫目录、不发同步子进程，
 * 只带扫描进度 / 运行态 / 已有缓存，用它替代每 1.5s 一次的重量级 /state。
 */
async function uiState(cfg, options = {}) {
  const light = Boolean(options && options.light)
  const health = await probe(cfg)
  const procs = light ? uiCache.procs || null : await cachedProcs(cfg)
  const known = Boolean(procs)
  const p = procs || { boot: 0, qq: 0, chains: 0, dup: false }
  const qr = cachedQr(cfg)
  const bridge = bridgeAge(cfg)
  return {
    ok: true,
    version,
    light,
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
      procs: { boot: p.boot, qq: p.qq, chains: p.chains, dup: p.dup, known },
      qr: qr,
      bridge: bridge,
      procRoot: light ? '' : procRootRaw(cfg),
      launcherFound: light ? '' : resolveLauncherPath(cfg),
      node: light ? uiCache.node || nodePublic(cfg) : nodePublic(cfg),
      taskName: cfg.taskName,
      taskReady: taskReadyCached(cfg),
    },
    scan: scanPublic(),
    drives: cachedDrives(),
    setup: cachedSetup(cfg, light),
    log: cachedLog(cfg, 40),
  }
}

/** 提权交接那块的状态：light（轮询）时放宽缓存，免得每 2 秒去翻一次 NapCat 目录 */
function cachedSetup(cfg, light) {
  const maxAgeMs = light ? 10000 : 2000
  if (uiCache.setup && Date.now() - (uiCache.setupAt || 0) < maxAgeMs) return uiCache.setup
  try {
    uiCache.setup = setupState(cfg)
  } catch {
    uiCache.setup = uiCache.setup || null
  }
  uiCache.setupAt = Date.now()
  return uiCache.setup
}

/** 并发 /state 合并成一次：崩溃重挂载时不会叠加成一串请求。 */
function uiStateFull(cfg) {
  if (uiCache.fullInflight) return uiCache.fullInflight
  uiCache.fullInflight = uiState(cfg, { light: false }).finally(() => {
    uiCache.fullInflight = null
  })
  return uiCache.fullInflight
}

/** 保存配置：写文件 → 重新解析 → 热应用（不用重启 DSH） */
function saveAndApply(ctx, patch) {
  const home = dshHome()
  const fileCfg = { ...readConfigFile(home) }
  for (const [key, value] of Object.entries(patch || {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue
    if (key === 'quickPassword') {
      // 设置页不回显密码：空字符串 = 别动它（要清空走 clearPassword 动作）
      const text = String(value == null ? '' : value).replace(/[\r\n]/g, '')
      if (text) fileCfg.quickPassword = text
      continue
    }
    if (key === 'rememberPassword') {
      fileCfg.rememberPassword = value !== false && value !== 'false'
      continue
    }
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
  // 密码相关的改动要落到「计划任务 / 中间层 bat」上，否则只是改了配置文件
  const passwordChanged =
    prev &&
    (prev.rememberPassword !== next.rememberPassword ||
      prev.quickPassword !== next.quickPassword ||
      prev.launchAccount !== next.launchAccount)
  if (passwordChanged) {
    if (passwordActive(next)) {
      const made = next.taskName ? ensureTask(next) : { ok: true }
      log(
        next,
        made.ok
          ? '记住密码已开启：下次拉起会带 ACCOUNT / NAPCAT_QUICK_PASSWORD，token 失效自动用密码登录'
          : `记住密码已写入配置，但任务重建失败（${made.error || ''}），下次拉起可能仍走扫码`,
      )
    } else {
      removeEnvBat(next)
      if (next.taskName) ensureTask(next)
      log(next, '记住密码已关闭：中间层 bat 已删除，任务回到不带密码的启动方式')
    }
  }
  armTimer(next)
  if (next.enabled) {
    tick(next).catch((error) => log(next, `tick after save error: ${String((error && error.message) || error)}`))
  }
  return next
}

async function doAction(ctx, cfg, action, payload) {
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
    case 'clearPassword': {
      // 把密码从本机彻底删掉：配置文件两条 + 中间层 bat，再让任务回到不带密码的样子
      const home = dshHome()
      const fileCfg = { ...readConfigFile(home) }
      fileCfg.rememberPassword = false
      fileCfg.quickPassword = ''
      writeConfigFile(home, fileCfg)
      const next = resolveConfig(state.patchConfig || {})
      state.cfg = next
      removeEnvBat(next)
      const made = next.taskName ? ensureTask(next) : { ok: true }
      await tick(next)
      return {
        said: made.ok
          ? '密码已从本机配置和启动脚本里删掉；之后 token 失效就得手机扫码'
          : `密码已删，但任务重建失败：${made.error || ''}`,
      }
    }
    case 'makeSetup': {
      // 生成「提权交接」脚本：插件自己不动系统，把活写成脚本，由人点一下
      let wants = []
      if (payload && Array.isArray(payload.needs)) wants = payload.needs
      else if (payload && typeof payload.needs === 'string' && payload.needs.trim()) {
        wants = payload.needs.split(',').map((s) => s.trim()).filter(Boolean)
      }
      // 显式传了空数组 = 一条都没勾，别当成「全要」
      if (payload && Array.isArray(payload.needs) && payload.needs.length === 0) {
        return { said: '没勾任何要做的事 —— 先在「需要你点一下的脚本」里勾一条，再点生成' }
      }
      const made = writeSetupBundle(cfg, wants)
      uiCache.setup = null
      uiCache.setupAt = 0
      if (!made.ok) return { said: `没生成：${made.error}`, setup: made }
      if (payload && payload.open) openSetupFolder()
      const adminNote = made.needAdmin ? '（这批要点 UAC 的「是」）' : '（这几步不需要管理员，双击就跑）'
      return {
        said: `脚本写好了：${made.dir} —— 双击 apply-admin.cmd ${adminNote}，跑完回来点「读结果」`,
        setup: made,
      }
    }
    case 'openSetup': {
      const r = openSetupFolder()
      uiCache.setup = null
      uiCache.setupAt = 0
      return { said: r.ok ? `已打开 ${r.dir}` : `打开失败：${r.error}`, opened: r }
    }
    case 'setupResult': {
      uiCache.setup = null
      uiCache.setupAt = 0
      const r = readSetupResult()
      if (!r) return { said: '还没跑过（目录里没有 result.json）' }
      const bad = r.results.filter((x) => !x.ok)
      const skipped = r.results.filter((x) => x.skipped)
      const head = r.mode === 'undo' ? '撤回结果' : '执行结果'
      return {
        said:
          `${head}：${r.results.length - bad.length}/${r.results.length} 步成` +
          (bad.length
            ? `，没成：${bad.map((x) => `${x.label}（${x.message}）`).join('；')}`
            : '') +
          (skipped.length ? `，跳过 ${skipped.length} 步` : '') +
          (r.elevated ? '｜拿到管理员' : '｜没用管理员'),
        setupRun: r,
      }
    }
    case 'checkNode': {
      // 清掉缓存再解析一次：用户刚装完 node / 刚改了路径时，想让结果立刻变
      uiCache.node = null
      uiCache.nodeKey = ''
      uiCache.nodeAt = 0
      uiCache.nodeVersion = ''
      const info = nodePublic(cfg)
      if (!info.path) {
        const shellNote = findStandaloneNapcatMjs(cfg.shellDir)
          ? '而且这个 Shell 目录是 node 型的（顶层有 napcat.mjs），没 node 就拉不起来'
          : '（当前的 NapCat 是注入型，跑在 QQ 自带的 Node 里，其实不需要它）'
        return {
          said: `没找到 node.exe。找过这些地方：${info.tried.join('；') || '（无）'}${shellNote}`,
          node: info,
        }
      }
      log(cfg, `node runtime: ${info.version || '(版本未知)'} ← ${info.source} ${info.path}`)
      return {
        said:
          `找到 node ${info.version || ''}（${info.source}）：${info.path}` +
          (findStandaloneNapcatMjs(cfg.shellDir) ? '｜Shell 型安装会用它跑 napcat.mjs' : ''),
        node: info,
      }
    }
    case 'drives': {
      // 重新读盘：作废缓存后直接问系统。插上移动盘 / 映射了新网络盘之后不用重启 DSH。
      uiCache.drives = null
      uiCache.drivesAt = 0
      const list = cachedDrives(0)
      return {
        said: list.length
          ? `读到 ${list.length} 块盘：${list.join(' ')}`
          : '一块盘都没读到（PowerShell 起不来？）',
      }
    }
    case 'scan': {
      const r = await startScan(cfg, (payload && (payload.drive || payload.scope)) || '')
      return { said: r.said, scanStarted: Boolean(r.ok) }
    }
    case 'scanStop': {
      if (!scan.running) return { said: '现在没有在扫' }
      scan.cancelled = true
      return { said: '已让它停，扫完当前这个目录就收工' }
    }
    case 'useShell': {
      const target = String((payload && (payload.shellDir || payload.path)) || '')
        .trim()
        .replace(/"/g, '')
      if (!target) return { said: '没给目录' }
      const next = saveAndApply(ctx, { shellDir: target, launcherScript: '' })
      await tick(next)
      return { said: `已切到 ${target}${next.launcherScript ? `，启动脚本 ${next.launcherScript}` : ''}` }
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
    // ?light=1 = 轮询用的轻量档（不开子进程）；不带参数就按完整档（带缓存 + 并发合并）
    const light = /[?&]light=1/.test(String(req.url || ''))
    const payload = light ? await uiState(state.cfg, { light: true }) : await uiStateFull(state.cfg)
    sendJson(res, 200, payload)
  })

  route('/save', async (req, res) => {
    const body = await readBody(req)
    const next = saveAndApply(ctx, body && body.patch ? body.patch : body)
    sendJson(res, 200, await uiState(next))
  })

  route('/action', async (req, res) => {
    const body = await readBody(req)
    const result = await doAction(ctx, state.cfg, body.do, body)
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
  const node = nodePublic(cfg)
  log(
    cfg,
    `boot: watchdog v${version} (enabled=${cfg.enabled}, port=${cfg.onebotPort}, every ${cfg.probeIntervalSec}s, ` +
      `scanTimeout=${cfg.scanTimeoutSec}s, shell=${cfg.shellDir || '(未配置)'}, task=${cfg.taskName || '(不用)'}, ` +
      `node=${node.path ? `${node.version || '?'}(${node.source})` : '(没找到)'})`,
  )
  if (lastMigrated) {
    log(cfg, `已把 ${lastMigrated} 个文件从 ~/.dsh 根上搬进 ${keeperDir()}（老版本的散装布局）`)
  }
  if (cfg.taskName) {
    const repaired = repairTaskActions(cfg)
    if (repaired.ok && repaired.repaired) log(cfg, '计划任务已跟着文件位置改好')
  }
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
  doAction,
  detectLauncher,
  resolveLauncherPath,
  resolveNode,
  nodePublic,
  nodeVersion,
  findStandaloneNapcatMjs,
  dshBundledNodeCandidates,
  listDrives,
  startScan,
  scanOneDrive,
  shellEvidence,
  looksLikeShellDirLoose,
  scanPublic,
  scan,
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
  passwordActive,
  writeEnvBat,
  removeEnvBat,
  envBatPath,
  md5Hex,
  SETUP_NEEDS,
  setupPaths,
  needCatalog,
  buildSetupSteps,
  writeSetupBundle,
  readSetupResult,
  readSetupPlan,
  setupState,
  openSetupFolder,
  applyPs1Source,
  dirWritable,
  cachedBootMain,
  state,
}
