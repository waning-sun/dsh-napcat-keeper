/**
 * 「提权交接」自检：在临时目录里造一个假的 NapCat 环境，
 * 走一遍 生成脚本 → 真跑 PowerShell → 读结果 → 撤销 的全流程。
 *
 * 全程不碰真实配置、不碰真实 NapCat 目录，也不需要管理员（这几步本来就不用）。
 *   node scripts/selftest-setup.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const internals = (await import('../lib/index.js')).__internals

const root = mkdtempSync(path.join(tmpdir(), 'npk-selftest-'))
const fakeShell = path.join(root, 'NapCat.Selftest.Shell')
const fakeLogDir = path.join(root, 'logs')
mkdirSync(fakeShell, { recursive: true })
mkdirSync(fakeLogDir, { recursive: true })
// 假 NapCat：一个 bat + 一个 boot exe，够了
writeFileSync(path.join(fakeShell, 'napcat.quick2.bat'), '@echo off\r\necho hi\r\n', 'utf8')
writeFileSync(path.join(fakeShell, 'NapCatWinBootMain.exe'), '', 'utf8')

const cfg = internals.resolveConfig({})
cfg.shellDir = fakeShell
cfg.launcherScript = 'napcat.quick2.bat'
cfg.launcherLog = path.join(fakeLogDir, 'launch.log')
cfg.taskName = 'NapCat-Keeper-Selftest'
cfg.launchAccount = '10001'
cfg.launchArgs = ''
cfg.rememberPassword = true
cfg.quickPassword = 'selftest-pass-123'
cfg.hideConsole = true
cfg.onebotPort = 3000

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) {
    pass += 1
    console.log(`  ✓ ${name}`)
  } else {
    fail += 1
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

console.log(`临时目录：${root}\n`)

/* 1. 需求清单 ------------------------------------------------------------- */
console.log('1) needCatalog')
const catalog = internals.needCatalog(cfg)
ok(Array.isArray(catalog) && catalog.length === 4, '四项需要都在', JSON.stringify(catalog.map((c) => c.id)))
ok(catalog.every((c) => c.id && c.label), '每项都有 id/label')
ok(catalog.every((c) => c.ready), '假环境下四项都能做', JSON.stringify(catalog.filter((c) => !c.ready)))
ok(catalog.find((c) => c.id === 'firewall').needAdmin === true, 'firewall 标了要管理员')
ok(catalog.find((c) => c.id === 'task').needAdmin === false, 'task 不需要管理员')

/* 2. 生成脚本 ------------------------------------------------------------- */
console.log('\n2) writeSetupBundle')
const made = internals.writeSetupBundle(cfg, ['launcher', 'envbat', 'task'])
ok(made.ok === true, '生成成功', made.error || '')
if (!made.ok) {
  console.log('生成失败，后面不用看了')
  process.exit(1)
}
const p = internals.setupPaths()
ok(existsSync(p.ps1), 'apply.ps1 在')
ok(existsSync(p.cmd), 'apply-admin.cmd 在')
ok(existsSync(p.undoCmd), 'undo-admin.cmd 在')
ok(existsSync(p.plan), 'plan.json 在')
ok(existsSync(p.readme), 'README.txt 在')
ok(made.needAdmin === false, '这批步骤不需要管理员', String(made.needAdmin))
ok(!JSON.stringify(made.steps).includes('selftest-pass-123'), '返回给前端的摘要里没有密码明文')

const ps1 = readFileSync(p.ps1)
ok(ps1[0] === 0xef && ps1[1] === 0xbb && ps1[2] === 0xbf, 'apply.ps1 带 UTF-8 BOM')
const ps1Text = ps1.toString('utf8')
ok(ps1Text.includes('Start-Process -FilePath'), '脚本里有自我提权那一句')
ok(ps1Text.includes('ConvertTo-Json'), '脚本会写回 result.json')

const cmdText = readFileSync(p.cmd, 'utf8')
ok(/^[\x00-\x7f]*$/.test(cmdText), 'cmd 是纯 ASCII（不会乱码）')
ok(cmdText.includes('apply.ps1'), 'cmd 指向 apply.ps1')

const plan = JSON.parse(readFileSync(p.plan, 'utf8'))
ok(plan.steps.length === 4, '4 步：wrapper + envbat + launcher + task', String(plan.steps.length))
ok(plan.needAdmin === false, 'plan 里 needAdmin 是 false')
ok(
  plan.steps.some((s) => s.id === 'task' && Array.isArray(s.requires) && s.requires.includes('envbat')),
  'task 依赖 envbat（失败就不建任务）',
)

/* 3. 真跑一遍（不提权） --------------------------------------------------- */
console.log('\n3) 真跑 apply.ps1')
const runPs = () =>
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', p.ps1], {
    encoding: 'utf8',
    env: { ...process.env, NPK_NO_PAUSE: '1' },
    timeout: 120000,
    windowsHide: true,
  })

let ranOut = ''
try {
  ranOut = runPs()
  ok(true, '脚本跑完了（退出码 0）')
} catch (error) {
  ok(false, '脚本报错', String((error && error.stdout) || (error && error.message) || error))
  console.log(String(ranOut))
}

const first = internals.readSetupResult()
const amAdmin = (() => {
  try {
    return (
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim() === 'True'
    )
  } catch {
    return false
  }
})()
ok(Boolean(first), 'result.json 读得回来')
if (first) {
  ok(first.mode === 'apply', 'mode = apply')
  ok(first.ok === true, '每步都成了', JSON.stringify(first.results.filter((r) => !r.ok)))
  ok(
    first.elevated === amAdmin,
    `elevated(${first.elevated}) 与当前进程是否管理员(${amAdmin}) 一致`,
  )
  ok(first.results.length === 4, '4 条结果')
}
ok(existsSync(path.join(fakeShell, 'napcat.quick.auto.bat')), 'launcher: 启动脚本写出来了')
ok(existsSync(path.join(fakeLogDir, 'env.bat')), 'envbat: 中间层写出来了')
ok(existsSync(path.join(fakeLogDir, 'launch.vbs')), 'task-wrapper: vbs 写出来了')

const envBat = readFileSync(path.join(fakeLogDir, 'env.bat'), 'utf8')
ok(envBat.includes('NAPCAT_QUICK_PASSWORD=selftest-pass-123'), 'env bat 里带密码（这是它的用途）')
ok(envBat.includes('call "'), 'env bat 会 call 真启动脚本')

const autoBat = readFileSync(path.join(fakeShell, 'napcat.quick.auto.bat'), 'utf8')
ok(autoBat.includes('NapCatWinBootMain.exe'), '自动启动脚本调的是 boot main')
ok(autoBat.includes('10001'), '自动启动脚本带账号')

try {
  const q = execFileSync('schtasks.exe', ['/query', '/tn', cfg.taskName], {
    encoding: 'utf8',
    windowsHide: true,
  })
  ok(q.includes(cfg.taskName), '计划任务真的建上了')
} catch (error) {
  ok(false, '计划任务没查着', String((error && error.message) || error))
}

/* 4. 再跑一次（幂等） ---------------------------------------------------- */
console.log('\n4) 重复跑一次')
try {
  runPs()
  const again = internals.readSetupResult()
  ok(again && again.ok === true, '第二次也全成（不炸）')
} catch (error) {
  ok(false, '第二次跑报错', String((error && error.message) || error))
}

/* 5. 撤销 --------------------------------------------------------------- */
console.log('\n5) undo')
try {
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', p.ps1, '-Undo'],
    { encoding: 'utf8', env: { ...process.env, NPK_NO_PAUSE: '1' }, timeout: 120000, windowsHide: true },
  )
  ok(true, 'undo 跑完')
} catch (error) {
  ok(false, 'undo 报错', String((error && error.message) || error))
}
const undone = internals.readSetupResult()
ok(undone && undone.mode === 'undo', 'result 里 mode = undo')
ok(undone && undone.ok === true, '撤回每步都成', JSON.stringify(undone && undone.results.filter((r) => !r.ok)))
ok(!existsSync(path.join(fakeShell, 'napcat.quick.auto.bat')), '启动脚本删掉了')
ok(!existsSync(path.join(fakeLogDir, 'env.bat')), '中间层删掉了（密码不留在磁盘）')
ok(!existsSync(path.join(fakeLogDir, 'launch.vbs')), 'vbs 删掉了')
try {
  execFileSync('schtasks.exe', ['/query', '/tn', cfg.taskName], { stdio: 'ignore', windowsHide: true })
  ok(false, '计划任务还在（应该删掉）')
} catch {
  ok(true, '计划任务删掉了')
}

/* 收尾 ---------------------------------------------------------------- */
console.log('\n6) 再生成一次（留着给人点，也算看下真身）')
const final = internals.writeSetupBundle(cfg, ['launcher', 'envbat', 'task'])
ok(final.ok === true, '最后一次生成成功')
ok(internals.readSetupResult() === null, '旧 result 被清掉（不会误读上一次）')

try {
  rmSync(root, { recursive: true, force: true })
} catch {}
console.log(`\n临时目录已清：${root}`)
console.log(`真身留在：${p.dir}`)
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
