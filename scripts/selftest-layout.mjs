/**
 * 「进程」那行按安装形态换词的回归自检。
 *
 * 守的坑：node 型（无头 Shell / napcat.mjs 包）安装下根本没有快登壳进程，
 * `procs.boot` 恒为 0，老版本一律写「NapCatWinBootMain 0 ｜ QQ 2 ｜ 链 1」——
 * 看着像「一个进程都没有」，其实 QQ 好好跑在 node.exe 里。
 * 现在 procsLayout() 分三种：node / boot / unknown，设置页照它换词。
 *
 * 顺带守两件事：
 *   - 判形态先看「谁在跑」，进程表说话优先于目录形态；目录形态只作兜底；
 *   - 目录判形有 60 秒缓存（面板 1.5 秒一轮，别每次都 readdir）；
 *   - taskCommandLine / taskCommandLinePure 共用同一条模板（改一处两边一起对）。
 *
 * 全程只用临时目录，不碰真配置、不碰真 NapCat。
 *   node scripts/selftest-layout.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

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

const root = mkdtempSync(path.join(tmpdir(), 'npk-layout-'))
// 插件自己的家也跟着搬到临时目录：免得自检往真 keeper 目录里写 env.bat
process.env.DSH_HOME = root

const mk = (name, files) => {
  const dir = path.join(root, name)
  mkdirSync(dir, { recursive: true })
  for (const f of files) {
    const full = path.join(dir, f)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, '')
  }
  return dir
}

const nodeDir = mk('node-shell', ['node.exe', 'index.js', 'napcat.bat', 'napcat/napcat.mjs'])
const bootDir = mk('boot-shell', ['NapCatWinBootMain.exe', 'napcat.quick.bat'])
const emptyDir = mk('empty', [])
// 真机上的坑：node 型目录里也躺着这个模板，但它没被调用
const nestedDir = mk('nested-template', ['napcat/NapCatWinBootMain.exe', 'index.js'])
const missingDir = path.join(root, 'does-not-exist')

const { procsLayout, taskCommandLine, taskCommandLinePure } = (await import('../lib/index.js?t=' + Date.now())).__internals

console.log('1) 有进程在跑：按「谁在跑」说话')
ok(procsLayout({ shellDir: nodeDir }, { boot: 1, qq: 4 }) === 'boot', 'boot=1 → boot（壳在跑）')
ok(procsLayout({ shellDir: bootDir }, { boot: 0, qq: 3 }) === 'node', 'boot=0、qq=3 → node（node 在跑）')
ok(procsLayout({ shellDir: missingDir }, { boot: 0, qq: 2 }) === 'node', '进程在跑时目录不存在也照样判 node')

console.log('2) 都没在跑：只能看 Shell 目录形态')
ok(procsLayout({ shellDir: nodeDir }, { boot: 0, qq: 0 }) === 'node', 'node.exe + index.js → node')
ok(procsLayout({ shellDir: bootDir }, { boot: 0, qq: 0 }) === 'boot', '顶层有 NapCatWinBootMain.exe → boot')
ok(procsLayout({ shellDir: emptyDir }, { boot: 0, qq: 0 }) === 'unknown', '空目录 → unknown')
ok(procsLayout({ shellDir: nestedDir }, { boot: 0, qq: 0 }) === 'unknown', '只有 napcat/ 子目录里的模板 → unknown（不当判据）')
ok(procsLayout({}, { boot: 0, qq: 0 }) === 'unknown', 'shellDir 没填 → unknown')
ok(procsLayout({ shellDir: missingDir }, { boot: 0, qq: 0 }) === 'unknown', '目录不存在 → unknown（不抛）')
ok(procsLayout(null, { boot: 0, qq: 0 }) === 'unknown', 'cfg 为 null 也不抛')

console.log('3) 目录判形有 60 秒缓存')
const cacheDir = mk('cache', [])
ok(procsLayout({ shellDir: cacheDir }, { boot: 0, qq: 0 }) === 'unknown', '第一次：空目录 → unknown')
writeFileSync(path.join(cacheDir, 'node.exe'), '')
writeFileSync(path.join(cacheDir, 'napcat.mjs'), '')
ok(procsLayout({ shellDir: cacheDir }, { boot: 0, qq: 0 }) === 'unknown', '刚放进去的 node.exe 还没到 60 秒 → 仍返回缓存里的 unknown')
ok(procsLayout({ shellDir: cacheDir + path.sep }, { boot: 0, qq: 0 }) === 'node', '目录名变了（换个 key）→ 立刻重新判成 node')

console.log('4) 任务命令行：两条路共用一条模板')
const plain = { shellDir: 'C:\\napcat', launcherLog: path.join(root, 'launch.log'), launchArgs: '' }
ok(taskCommandLine(plain, 'C:\\napcat\\napcat.quick.bat') === taskCommandLinePure(plain, 'C:\\napcat\\napcat.quick.bat'), '没开记住密码时两者一字不差')
ok(taskCommandLine(plain, 'b.bat').includes('chcp 65001') && taskCommandLine(plain, 'b.bat').includes('cd /d "C:\\napcat"'), '模板含 chcp 与切目录')
const secret = { ...plain, rememberPassword: true, quickPassword: 'p@ss', launchAccount: '10001' }
const viaEnv = taskCommandLinePure(secret, 'C:\\napcat\\napcat.quick.bat')
ok(viaEnv.includes('env.bat'), '开了记住密码 → 走中间层 env.bat')
const withWrite = taskCommandLine(secret, 'C:\\napcat\\napcat.quick.bat')
ok(withWrite === viaEnv, 'writeEnvBat 那版落盘后与纯字符串版一致')
ok(existsSync(path.join(root, 'env.bat')), '中间层 bat 真写到 launcherLog 旁边了')

rmSync(root, { recursive: true, force: true })
console.log('')
console.log(`结果：${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
