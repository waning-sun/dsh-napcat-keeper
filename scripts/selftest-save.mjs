/**
 * 「保存设置」回归自检。
 *
 * 守的是 2.7.0 引入、2.7.3 修掉的那个 bug：saveAndApply 写的是 $DSH_HOME/config.json，
 * 而所有读取都走 <keeperDir>/config.json，于是设置页点保存/点「用这个」之后值立刻弹回空。
 *
 * 全程在临时 DSH_HOME 里跑，不碰真实配置。
 *   node scripts/selftest-save.mjs
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs'
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
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}

const freshHome = (tag) => {
  const home = mkdtempSync(path.join(tmpdir(), `npk-save-${tag}-`))
  process.env.DSH_HOME = home
  return { home, dir: path.join(home, 'dsh-napcat-keeper') }
}

const loadInternals = async () => (await import('../lib/index.js?t=' + Date.now())).__internals

const fakeCtx = { effect: (fn) => fn(), logger: null, tools: { register() {} } }
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))

/* 1. 保存必须落到 keeperDir/config.json，回读一致 --------------------------- */
console.log('1) saveAndApply 真的写进 keeperDir 了吗')
{
  const { home, dir } = freshHome('write')
  const { resolveConfig, saveAndApply } = await loadInternals()
  const target = 'D:/fake/NapCat.Shell'
  const next = saveAndApply(fakeCtx, { shellDir: target, onebotPort: 3011 })
  ok(next.shellDir === target, 'saveAndApply 返回值里就有新值', JSON.stringify(next.shellDir))
  ok(existsSync(path.join(dir, 'config.json')), 'keeperDir/config.json 被写出来了')
  ok(readJson(path.join(dir, 'config.json')).shellDir === target, '落盘内容对得上')
  ok(!existsSync(path.join(home, 'config.json')), '根上没再冒出 config.json')
  ok(resolveConfig({}).shellDir === target, '重新 resolveConfig 读回新值（重启 DSH 后也生效）')
}

/* 2. 老版本误写的那份要被认领回来 ------------------------------------------- */
console.log('\n2) 认领 2.7.0~2.7.2 误写到根上的 config.json')
{
  const { home, dir } = freshHome('adopt')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ shellDir: '', onebotPort: 3000 }, null, 2) + '\n')
  // 根上那份是「用户最后一次点保存」的内容，比 keeper 的新
  const stray = path.join(home, 'config.json')
  writeFileSync(stray, JSON.stringify({ shellDir: 'E:/NapCat.Shell', onebotPort: 3000, launchAccount: '10001' }, null, 2) + '\n')
  const old = (Date.now() - 60000) / 1000
  utimesSync(path.join(dir, 'config.json'), old, old)

  const { resolveConfig } = await loadInternals()
  ok(resolveConfig({}).shellDir === 'E:/NapCat.Shell', '认领后读到的就是用户当初想存的那份')
  ok(!existsSync(stray), '根上那份已归档，不会下次又被认领一遍')
  const leg = readdirSync(path.join(dir, 'legacy'))
  ok(leg.some((f) => f.startsWith('config.adopted-')), '原文留在 legacy/ 里（可回滚）', leg.join(','))
}

/* 3. keeper 更新时不许被根上那份覆盖 ---------------------------------------- */
console.log('\n3) keeper 比根上新时不认领（别把新配置写旧）')
{
  const { home, dir } = freshHome('noadopt')
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ shellDir: 'F:/good', onebotPort: 3000, launchAccount: '1' }, null, 2) + '\n')
  const stray = path.join(home, 'config.json')
  writeFileSync(stray, JSON.stringify({ shellDir: 'G:/stale', onebotPort: 3000, launchAccount: '1' }, null, 2) + '\n')
  const old = (Date.now() - 120000) / 1000
  utimesSync(stray, old, old)

  const { resolveConfig } = await loadInternals()
  ok(resolveConfig({}).shellDir === 'F:/good', 'keeper 里的值没被旧文件顶掉')
  ok(existsSync(stray), '不认领就不动它')
}

/* 4. 不是自家的 config.json 不许抢 ----------------------------------------- */
console.log('\n4) 根上的 config.json 若不像插件的，一概不碰')
{
  const { home, dir } = freshHome('foreign')
  mkdirSync(dir, { recursive: true })
  const stray = path.join(home, 'config.json')
  writeFileSync(stray, JSON.stringify({ theme: 'dark', language: 'zh-CN' }, null, 2) + '\n')
  const { resolveConfig } = await loadInternals()
  resolveConfig({})
  ok(existsSync(stray), '别人的 config.json 原样留着')
  ok(!existsSync(path.join(dir, 'config.json')), '也没凭空造一份 keeper 配置')
}

console.log(`\n结果：${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
