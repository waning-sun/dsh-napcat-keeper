// 扫盘判定自测：真 Shell 与 OneKey 留下的壳模板必须分得开。
// 造一棵假树真跑 scanOneDrive，不碰真实磁盘上的 NapCat。
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 相对脚本自身定位：换台机器、换个 clone 目录都跑得起来
const ENTRY = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'index.js')
const mod = await import(pathToFileURL(ENTRY).href)
const it = mod.__internals

let bad = 0
const ok = (name, cond, extra) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (cond || !extra ? '' : ' → ' + extra))
  if (!cond) bad++
}

const root = mkdtempSync(path.join(tmpdir(), 'npk-scan-'))
const mk = (rel, files = [], dirs = []) => {
  const d = path.join(root, rel)
  mkdirSync(d, { recursive: true })
  for (const f of files) writeFileSync(path.join(d, f), 'x')
  for (const s of dirs) mkdirSync(path.join(d, s), { recursive: true })
  return d
}

// 三种典型形态：壳模板 / 真 Shell / 精简版（名字带 napcat，没有强证据）
mk('OneKey/bootmain', ['NapCatWinBootMain.exe', 'NapCatWinBootHook.dll', 'napcat.bat', 'napcat.quick.bat', 'ReadMe.txt'])
mk('OneKey/NapCat.1.Shell', ['QQ.exe', 'NapCatWinBootMain.exe', 'napcat.quick2.bat', 'msvcp140.dll'], ['versions'])
mk('lite/napcat-custom', ['napcat.bat'])
mk('plain/whatever', ['readme.txt', 'data.bin'])

it.scan.found.length = 0
it.scan.visited = 0
await it.scanOneDrive(root, { maxDepth: 6 })
const found = it.scanPublic().found
const byName = (n) => found.find((f) => f.name === n)

ok('扫到 3 个候选', found.length === 3, JSON.stringify(found.map((f) => f.name)))
ok('普通目录不算候选', !found.some((f) => f.name === 'whatever'))
ok('三个目录都带启动脚本', found.every((f) => Boolean(f.launcher)), JSON.stringify(found.map((f) => f.launcher)))

const real = byName('NapCat.1.Shell')
ok('真 Shell 被认出来', Boolean(real && real.shell), JSON.stringify(real))
ok('真 Shell 证据含 versions/ 与 QQ.exe', Boolean(real && real.evidence.includes('versions/') && real.evidence.includes('QQ.exe')), JSON.stringify(real && real.evidence))
ok('真 Shell 启动脚本挑到 quick2', Boolean(real && real.launcher === 'napcat.quick2.bat'), real && real.launcher)

const shellTpl = byName('bootmain')
ok('壳模板不算真 Shell', Boolean(shellTpl && shellTpl.shell === false), JSON.stringify(shellTpl))
ok('壳模板没有强证据', Boolean(shellTpl && shellTpl.evidence.length === 0), JSON.stringify(shellTpl && shellTpl.evidence))
ok('壳模板仍然算「候选」（可以被人工选中）', Boolean(shellTpl && shellTpl.boot === true))

const lite = byName('napcat-custom')
ok('精简版名字像 napcat 也算候选', Boolean(lite))
ok('精简版同样标成「存疑」', Boolean(lite && lite.shell === false))

ok('真 Shell 排在壳模板前面', found[0].shell === true, found.map((f) => `${f.name}:${f.shell}`).join(' | '))

// shellEvidence 单元级：只有目录里的 versions 才认
const fs = await import('node:fs')
const evReal = it.shellEvidence(fs.readdirSync(path.join(root, 'OneKey/NapCat.1.Shell'), { withFileTypes: true }))
const evTpl = it.shellEvidence(fs.readdirSync(path.join(root, 'OneKey/bootmain'), { withFileTypes: true }))
ok('shellEvidence(真) = shell', evReal.shell === true)
ok('shellEvidence(壳) = 不是 shell', evTpl.shell === false)

rmSync(root, { recursive: true, force: true })
console.log('\n结果：' + (bad ? bad + ' 项失败' : '全部通过（' + 15 + ' 项）'))
process.exit(bad ? 1 : 0)
