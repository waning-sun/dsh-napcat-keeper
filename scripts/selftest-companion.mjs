/**
 * 「和 dsh-onebot-qq 共存」回归自检。
 *
 * 要守的两件事：
 *   1) 认得出对面这个插件 —— 装没装（profile/package.json 的 dependencies）、
 *      挂没挂（dsh.profile.bundles + cordis.patch.yml 里的 id: dsh-onebot）、
 *      它自己配成什么样（mode/port/url/token）。认错挂载状态就会去探一个根本不存在的端口。
 *   2) 跟随要有分寸 —— 自己填的端口通了就绝不动它；没通才改看对面的反向 WS 端口；
 *      对面没挂、是正向模式、或者用户把「跟随」关了，都必须老老实实不跟。
 *
 * 全程离线：临时 DSH_HOME + 本地假 426 服务器，不碰真配置、不碰真 NapCat、不碰真 dsh-onebot-qq。
 *   node scripts/selftest-companion.mjs
 */
import http from 'node:http'
import net from 'node:net'
import fs from 'node:fs'
import os from 'node:os'
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

/* 临时家目录：必须在 import 插件之前设好（dshHome() 每次调用都读环境变量） */
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'npk-companion-'))
process.env.DSH_HOME = HOME

const loadInternals = async () => (await import('../lib/index.js?t=' + Date.now())).__internals
const {
  detectCompanion,
  parseCompanionConfig,
  companionPublic,
  companionTokenMatch,
  probe,
  normalizeConfig,
  COMPANION_DEFAULTS,
  // dsh-qq-bridge 那一套
  detectBridge,
  bridgePublic,
  bridgeCheck,
  readBridgeConfig,
  urlPort,
  BRIDGE_DEFAULTS,
  BRIDGE_PACKAGE,
  profileHits,
} = await loadInternals()

const mkProfile = (name, { deps = {}, bundles = null, patch = '' } = {}) => {
  const dir = path.join(HOME, 'profiles', name)
  fs.mkdirSync(dir, { recursive: true })
  const pkg = { name: 'dsh-profile-' + name, dependencies: deps }
  if (bundles) pkg.dsh = { profile: { bundles } }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  if (patch !== null) fs.writeFileSync(path.join(dir, 'cordis.patch.yml'), patch)
  return dir
}

const dropPkg = (profile, pkgName, version) => {
  const dir = path.join(HOME, 'profiles', profile, 'node_modules', pkgName)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: pkgName, version }))
}

const dropPackageJson = (profile, version = '0.9.6') => dropPkg(profile, 'dsh-onebot-qq', version)

/** 起一个只收 WebSocket 的假服务器（普通 HTTP 请求换 426），模拟 dsh-onebot-qq 的反向 WS */
const serveUpgradeOnly = () =>
  new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain' })
      res.end('Upgrade Required')
    })
    srv.listen(0, '127.0.0.1', () =>
      resolve({
        port: srv.address().port,
        close: () => new Promise((r) => srv.close(r)),
      }),
    )
  })

/** 找个没人用的端口，用来模拟「用户填的那个端口是空的」 */
const deadPort = () =>
  new Promise((resolve) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port
      srv.close(() => resolve(port))
    })
  })

/* 1. 对面的配置长什么样 ------------------------------------------------ */
console.log('1) 解析 dsh-onebot-qq 的 config 块')
{
  const block = parseCompanionConfig(
    [
      'plugins:',
      '  - insert:',
      '      - id: dsh-onebot',
      "        name: 'dsh-onebot-qq'",
      '        config:',
      '          mode: reverse',
      '          host: 127.0.0.1',
      '          port: 9527',
      "          accessToken: 'secret-token'",
      '',
    ].join('\n'),
  )
  ok(block && block.port === 9527, '缩进块里挖出 port（当数字）', JSON.stringify(block))
  ok(block && block.mode === 'reverse', '挖出 mode')
  ok(block && block.accessToken === 'secret-token', '挖出令牌（去掉引号）')
  ok(block && block.host === '127.0.0.1', '挖出 host')

  const inline = parseCompanionConfig(
    "  - id: dsh-onebot\n    name: 'dsh-onebot-qq'\n    config: { mode: reverse, port: 8888 }\n",
  )
  ok(inline && inline.port === 8888 && inline.mode === 'reverse', '行内 {…} 写法也认', JSON.stringify(inline))

  const other = parseCompanionConfig(
    [
      'plugins:',
      '  - id: dsh-purge',
      '    config:',
      '      port: 1234',
      '  # - id: dsh-onebot',
      '  #   config: { port: 7777 }',
      '',
    ].join('\n'),
  )
  ok(other === null || other.port !== 1234, '别的插件 / 注释掉的行不算', JSON.stringify(other))

  const js = parseCompanionConfig('  - id: dsh-onebot\n    config:\n      port: !!js process.env.PORT\n')
  ok(!js || js.port === undefined, '!!js 表达式不当真（宁可当没配）', JSON.stringify(js))
}

/* 2. 认不认得出「装了 / 挂了」 ------------------------------------------ */
console.log('\n2) detectCompanion：装没装、挂没挂')
{
  // 2a. 装了 + 挂进 bundles + 没改过配置 → 用它的默认 8643
  mkProfile('alpha', { deps: { 'dsh-onebot-qq': '^0.9.6' }, bundles: ['dsh-napcat-keeper', 'dsh-onebot-qq'] })
  dropPackageJson('alpha')
  let comp = detectCompanion({ force: true })
  ok(comp.found === true, '认得出装了 dsh-onebot-qq', JSON.stringify(comp))
  ok(comp.mounted === true, '在 bundles 里 → 判为已挂载')
  ok(comp.port === 8643, '没配过就用它的默认端口 8643', String(comp.port))
  ok(comp.mode === 'reverse', '它默认是反向模式', comp.mode)
  ok(comp.packageVersion === '0.9.6', '读到它自己的版本号', String(comp.packageVersion))
  ok(COMPANION_DEFAULTS.port === 8643, 'COMPANION_DEFAULTS.port 是 8643')

  // 2b. 装了 + 只写 patch（不在 bundles）→ 仍算挂载，端口用 patch 里的
  mkProfile('beta', {
    deps: { 'dsh-onebot-qq': '^0.9.6' },
    bundles: ['dsh-napcat-keeper'],
    patch: [
      'plugins:',
      '  - insert:',
      '      - id: dsh-onebot',
      "        name: 'dsh-onebot-qq'",
      '        config:',
      '          mode: reverse',
      '          port: 9123',
      "          accessToken: 'abc'",
      '',
    ].join('\n'),
  })
  dropPackageJson('beta')
  fs.rmSync(path.join(HOME, 'profiles', 'alpha'), { recursive: true, force: true })
  comp = detectCompanion({ force: true })
  ok(comp.mounted === true, 'patch 里出现 id: dsh-onebot → 判为已挂载')
  ok(comp.port === 9123, '端口取 patch 里配的 9123', String(comp.port))
  ok(comp.tokenKnown === true, '读得到令牌 → tokenKnown')
  ok(companionPublic(comp).token === undefined, '对外的公开信息里不带令牌明文')

  // 2c. 只在 dependencies 里、没进 bundles、patch 里也没有 → 没挂载
  mkProfile('gamma', { deps: { 'dsh-onebot-qq': '^0.9.6' }, bundles: ['dsh-napcat-keeper'], patch: 'plugins: []\n' })
  dropPackageJson('gamma')
  fs.rmSync(path.join(HOME, 'profiles', 'beta'), { recursive: true, force: true })
  comp = detectCompanion({ force: true })
  ok(comp.found === true, '装是装了的', JSON.stringify(comp))
  ok(comp.mounted === false, '没进 bundles 也没进 patch → 判为未挂载（端口不会开）')

  // 2d. 压根没装
  fs.rmSync(path.join(HOME, 'profiles', 'gamma'), { recursive: true, force: true })
  mkProfile('delta', { deps: { 'dsh-napcat-keeper': '^2.8.0' }, bundles: ['dsh-napcat-keeper'], patch: 'plugins: []\n' })
  comp = detectCompanion({ force: true })
  ok(comp.found === false, '没装时 found = false', JSON.stringify(comp))
  ok(comp.mounted === false, '没装自然也没挂载')
}

/* 3. 令牌对不对得上 ---------------------------------------------------- */
console.log('\n3) 令牌一致性')
{
  ok(companionTokenMatch({ accessToken: 'a' }, { tokenKnown: true, token: 'a' }) === true, '一样 → true')
  ok(companionTokenMatch({ accessToken: 'a' }, { tokenKnown: true, token: 'b' }) === false, '不一样 → false')
  ok(companionTokenMatch({ accessToken: 'a' }, { tokenKnown: false, token: '' }) === null, '对面读不到 → null（未知 ≠ 不一致）')
}

/* 4. 跟随行为 ---------------------------------------------------------- */
console.log('\n4) probe 会不会跟随对面的反向 WS 端口')
{
  const srv = await serveUpgradeOnly()
  const empty = await deadPort()

  // 4a. 自己填的端口是空的，对面挂着反向 WS → 跟随
  let health = await probe(
    { onebotPort: empty, accessToken: '', probeMode: 'auto', companionFollow: true },
    { companion: { found: true, mounted: true, mode: 'reverse', host: '127.0.0.1', port: srv.port, tokenKnown: false, token: '' } },
  )
  ok(health.followed === true, '自己端口没服务 → 跟随', JSON.stringify({ mode: health.mode, followed: health.followed }))
  ok(health.portUsed === srv.port, 'portUsed 换成对面的端口', String(health.portUsed))
  ok(health.mode === 'reverse', '跟随之后按反向 WS 判', health.mode)
  ok(health.primaryPort === empty, '原来的端口仍然记着', String(health.primaryPort))
  ok(String(health.hint || '').includes(String(srv.port)), '提示里写清跟到了哪个端口', health.hint)

  // 4b. 自己填的端口就是对的 → 不许乱跟
  health = await probe(
    { onebotPort: srv.port, accessToken: '', probeMode: 'auto', companionFollow: true },
    { companion: { found: true, mounted: true, mode: 'reverse', host: '127.0.0.1', port: srv.port, tokenKnown: false, token: '' } },
  )
  ok(health.followed === false, '自己端口通了→不跟随', String(health.followed))
  ok(health.portUsed === srv.port, 'portUsed 还是自己的', String(health.portUsed))

  // 4c. 用户把「跟随」关了 → 不跟
  const off = await probe(
    { onebotPort: empty, accessToken: '', probeMode: 'auto', companionFollow: false },
    { companion: { found: true, mounted: true, mode: 'reverse', host: '127.0.0.1', port: srv.port, tokenKnown: false, token: '' } },
  )
  ok(off.followed === false && off.mode === 'dead', '关了跟随 → 老老实实报 dead', off.mode)

  // 4d. 对面没挂载（端口根本不会开）→ 不跟
  const unmounted = await probe(
    { onebotPort: empty, accessToken: '', probeMode: 'auto', companionFollow: true },
    { companion: { found: true, mounted: false, mode: 'reverse', host: '127.0.0.1', port: srv.port, tokenKnown: false, token: '' } },
  )
  ok(unmounted.followed === false, '对面没挂载 → 不跟随', String(unmounted.followed))

  // 4e. 对面是正向模式（它自己去连 NapCat，不监听端口）→ 不跟
  const forward = await probe(
    { onebotPort: empty, accessToken: '', probeMode: 'auto', companionFollow: true },
    { companion: { found: true, mounted: true, mode: 'forward', host: '127.0.0.1', port: srv.port, url: 'ws://127.0.0.1:3001', tokenKnown: false, token: '' } },
  )
  ok(forward.followed === false, '对面正向模式 → 不跟随', String(forward.followed))

  // 4f. 令牌不一致要说出来
  const mismatch = await probe(
    { onebotPort: empty, accessToken: 'mine', probeMode: 'auto', companionFollow: true },
    { companion: { found: true, mounted: true, mode: 'reverse', host: '127.0.0.1', port: srv.port, tokenKnown: true, token: 'theirs' } },
  )
  ok(mismatch.companionTokenMatch === false, '令牌对不上 → companionTokenMatch = false', String(mismatch.companionTokenMatch))

  await srv.close()
}

/* 5. 配置项归一化 ------------------------------------------------------ */
console.log('\n5) companionFollow 归一化')
{
  ok(normalizeConfig({}).companionFollow === true, '默认开', String(normalizeConfig({}).companionFollow))
  ok(normalizeConfig({ companionFollow: false }).companionFollow === false, '关掉是 false')
  ok(
    normalizeConfig({ companionFollow: 'false' }).companionFollow === false,
    "字符串 'false' → false（和 enabled 那几个布尔项一个路子）",
  )
  ok(normalizeConfig({ companionFollow: true }).companionFollow === true, '开着是 true')
}

/* 5b. resolveConfig：显示了才有默认开 ---------------------------------- *
 * 需求：设置页那一行只有「装了 dsh-onebot-qq 且真挂进 profile（= 启用）」时才出现、
 * 且默认开；没装或没启用就不出现、值恒为关。
 * resolveConfig 里带 detectCompanion（20 秒缓存），所以每个场景换一份新模块实例来测。
 */
console.log('\n5b) 跟随开关：装没装 / 启没启用 决定显不显示、默认开不开')
{
  const cfgFile = path.join(HOME, 'dsh-napcat-keeper', 'config.json')
  const freshInternals = async (tag) =>
    (await import('../lib/index.js?t=' + tag + '-' + Date.now())).__internals
  const cleanProfiles = () => {
    for (const name of ['desktop', 'alpha', 'beta', 'gamma', 'delta', 'omega']) {
      fs.rmSync(path.join(HOME, 'profiles', name), { recursive: true, force: true })
    }
  }
  const setStored = (obj) => {
    fs.mkdirSync(path.dirname(cfgFile), { recursive: true })
    fs.writeFileSync(cfgFile, JSON.stringify(obj || {}, null, 2) + '\n')
  }
  const withCompanionMounted = (mounted) => {
    cleanProfiles()
    mkProfile('desktop', {
      deps: { 'dsh-onebot-qq': '^0.9.6' },
      bundles: mounted ? ['dsh-onebot-qq'] : [],
      patch: 'plugins: []\n',
    })
    dropPkg('desktop', 'dsh-onebot-qq', '0.9.6')
  }

  // 5b-1 压根没装
  cleanProfiles()
  setStored({})
  let m = await freshInternals('none')
  ok(m.companionReady({ found: false, mounted: true }) === false, 'companionReady：没找到 → false')
  ok(m.companionReady({ found: true, mounted: false }) === false, 'companionReady：装了但没挂 → false')
  ok(m.companionReady({ found: true, mounted: true }) === true, 'companionReady：装了且挂了 → true')
  let cfg = m.resolveConfig({})
  ok(cfg.companionReady === false, '没装 → companionReady = false（界面不画这一行）')
  ok(cfg.companionFollow === false, '没装 → 跟随强制关（DEFAULTS 里写着 true 也不作数）', String(cfg.companionFollow))

  // 5b-2 装了、只在 dependencies 里（没挂进 profile）= 没启用
  withCompanionMounted(false)
  setStored({ companionFollow: true })
  m = await freshInternals('dep-only')
  cfg = m.resolveConfig({})
  ok(cfg.companionReady === false, '装了但没挂进 profile → companionReady = false')
  ok(cfg.companionFollow === false, '没启用时存过 true 也按关算（不跟一个起不来的端口）', String(cfg.companionFollow))

  // 5b-3 装了且挂进 profile = 启用 → 默认开
  withCompanionMounted(true)
  setStored({})
  m = await freshInternals('mounted')
  cfg = m.resolveConfig({})
  ok(cfg.companionReady === true, '装了且挂进 profile → companionReady = true（这一行出现）')
  ok(cfg.companionFollow === true, '可用时没存过值 → 默认开', String(cfg.companionFollow))

  // 5b-4 可用时用户显式关过 → 尊重存储值，不许硬掰成开
  setStored({ companionFollow: false })
  cfg = m.resolveConfig({})
  ok(cfg.companionFollow === false, '可用时存了 false → 保持关')

  // 5b-5 可用时 cordis 里显式关 → 也尊重
  setStored({})
  cfg = m.resolveConfig({ companionFollow: false })
  ok(cfg.companionFollow === false, '可用时 cordis 里写 false → 也是关')
  ok(m.resolveConfig({ companionFollow: true }).companionFollow === true, 'cordis 里写 true → 开')

  // 5b-6 companionPublic 的瘦身版没有 found 字段，也得认（面板走的就是这条）
  withCompanionMounted(true)
  setStored({})
  m = await freshInternals('public-shape')
  ok(m.companionReady(m.companionPublic(m.detectCompanion({ force: true }))) === true,
    'companionReady 也吃 companionPublic 那份（没有 found，靠 version/mounted 判）')

  // 5b-7 面板每轮都按最新探测结果校准这一项：中途挂上 / 摘掉不用重启 DSH
  setStored({ onebotPort: 65531 })
  cfg = m.resolveConfig({})
  let ui = await m.uiState(cfg, { light: true })
  ok(ui.runtime.companionReady === true, 'uiState：mounted → runtime.companionReady = true（这一行出现）')
  ok(ui.config.companionFollow === true, 'uiState：mounted 且没存过值 → 面板里是开')

  withCompanionMounted(false)
  setStored({ onebotPort: 65531 })
  m = await freshInternals('ui-unmounted')
  cfg = m.resolveConfig({})
  ui = await m.uiState(cfg, { light: true })
  ok(ui.runtime.companionReady === false, 'uiState：没挂进 profile → runtime.companionReady = false（这一行消失）')
  ok(ui.config.companionFollow === false, 'uiState：没挂进 profile → 面板里是关')

  // 清场：别把这份临时配置留给后面的组
  cleanProfiles()
  setStored({})
}

/* 6. dsh-qq-bridge 也认得出 -------------------------------------------- */
console.log('\n6) dsh-qq-bridge：装没装、挂没挂、桥接指向哪')
{
  // 清场：前面几组造的 profile 全删掉，这一组只看自己造的
  for (const name of ['alpha', 'beta', 'gamma', 'delta', 'desktop']) {
    fs.rmSync(path.join(HOME, 'profiles', name), { recursive: true, force: true })
  }

  ok(urlPort('http://127.0.0.1:3000') === 3000, 'urlPort 抠端口', String(urlPort('http://127.0.0.1:3000')))
  ok(urlPort('https://napcat.example.com') === 443, '没写端口 + https → 443', String(urlPort('https://napcat.example.com')))
  ok(urlPort('不是地址') === 0, '认不出 → 0（不瞎猜）', String(urlPort('不是地址')))
  ok(BRIDGE_DEFAULTS.napcat === 'http://127.0.0.1:3000', '它的默认 NapCat 地址端口是 3000')

  // 6a. 压根没装
  fs.rmSync(path.join(HOME, 'qq-bridge-config.json'), { force: true })
  let b = detectBridge({ force: true })
  ok(b.found === false, '没装时 found = false', JSON.stringify(b))
  ok(bridgePublic(b) === null, '没装时对外是 null（界面据此说「没检测到」）')
  ok(bridgeCheck({ mode: 'http', portUsed: 3000 }, b).state === 'absent', '没装时交叉检查是 absent')

  // 6b. 装了 + 在 bundles 里 + 配置文件齐全
  mkProfile('desktop', {
    deps: { 'dsh-qq-bridge': '^1.0.7' },
    bundles: ['dsh-napcat-keeper', 'dsh-qq-bridge'],
    patch: 'plugins: []\n',
  })
  dropPkg('desktop', BRIDGE_PACKAGE, '1.0.7')
  fs.writeFileSync(
    path.join(HOME, 'qq-bridge-config.json'),
    JSON.stringify({ 总开关: true, 试运行: false, NapCat: 'http://127.0.0.1:4000', 令牌: 'x', 绑定: [{}, {}] }, null, 2),
  )
  b = detectBridge({ force: true })
  ok(b.found === true && b.mounted === true, '装了且在 bundles 里 → 已挂载', JSON.stringify({ found: b.found, mounted: b.mounted }))
  ok(b.packageVersion === '1.0.7', '读到它的版本号', String(b.packageVersion))
  ok(readBridgeConfig().known === true, '读得到 ~/.dsh/qq-bridge-config.json（摊在根上，不在 profile 里）')
  ok(b.napcatPort === 4000, '桥接指向 4000', String(b.napcatPort))
  ok(b.enabled === true && b.dryRun === false, '总开关开、试运行关', JSON.stringify({ enabled: b.enabled, dryRun: b.dryRun }))
  ok(b.tokenKnown === true && b.bindings === 2, '令牌配了、绑定 2 条', JSON.stringify({ tokenKnown: b.tokenKnown, bindings: b.bindings }))
  ok(bridgePublic(b).token === undefined, '公开信息里不带令牌')

  // 6c. 桥接指着反向 WS 端口：HTTP 客户端敲 WebSocket 端口，敲不通
  let check = bridgeCheck({ mode: 'reverse', portUsed: 4000 }, b)
  ok(check.state === 'bridge-hits-reverse', '桥接连的是反向 WS 端口 → 指出来', check.state)
  ok(String(check.note).includes('4000'), '提示里带上端口号', check.note)

  // 6d. 端口对不上
  check = bridgeCheck({ mode: 'http', portUsed: 3000 }, b)
  ok(check.state === 'port-mismatch', '两边端口不一样 → 指出来', check.state)

  // 6e. 对得上 → 没意见
  check = bridgeCheck({ mode: 'http', portUsed: 4000 }, b)
  ok(check.state === 'ok' && check.note === '', '对得上 → ok 且不多嘴', check.state)

  // 6f. 总开关关着
  fs.writeFileSync(
    path.join(HOME, 'qq-bridge-config.json'),
    JSON.stringify({ 总开关: false, 试运行: true, NapCat: 'http://127.0.0.1:3000' }),
  )
  b = detectBridge({ force: true })
  ok(b.enabled === false, '总开关关 → enabled = false')
  ok(bridgeCheck({ mode: 'http', portUsed: 3000 }, b).state === 'disabled', '交叉检查说 disabled')

  // 6g. 开着但试运行
  fs.writeFileSync(
    path.join(HOME, 'qq-bridge-config.json'),
    JSON.stringify({ 总开关: true, 试运行: true, NapCat: 'http://127.0.0.1:3000' }),
  )
  b = detectBridge({ force: true })
  ok(bridgeCheck({ mode: 'http', portUsed: 3000 }, b).state === 'dry-run', '试运行 → dry-run')

  // 6h. 装了但没挂进 profile：先报没挂，别先去怪端口
  mkProfile('beta', { deps: { 'dsh-qq-bridge': '^1.0.7' }, bundles: ['dsh-napcat-keeper'], patch: 'plugins: []\n' })
  dropPkg('beta', BRIDGE_PACKAGE, '1.0.7')
  fs.rmSync(path.join(HOME, 'profiles', 'desktop'), { recursive: true, force: true })
  b = detectBridge({ force: true })
  ok(b.mounted === false, '只写在 dependencies 里 → 未挂载')
  ok(bridgeCheck({ mode: 'http', portUsed: 3000 }, b).state === 'not-mounted', '未挂载优先报 not-mounted')

  // 6i. 同一套扫描对两个插件都成立
  mkProfile('desktop', {
    deps: { 'dsh-onebot-qq': '^0.9.6' },
    bundles: ['dsh-napcat-keeper', 'dsh-onebot-qq'],
    patch: 'plugins: []\n',
  })
  dropPkg('desktop', 'dsh-onebot-qq', '0.9.6')
  const hits = profileHits('dsh-onebot-qq', 'dsh-onebot')
  ok(hits.length === 1 && hits[0].mounted === true, 'profileHits 认得出 onebot', JSON.stringify(hits.map((h) => h.profile)))
  ok(
    profileHits(BRIDGE_PACKAGE, 'qq-bridge').some((h) => !h.mounted),
    '同一套扫描对 bridge 也适用（含未挂载那条）',
  )

  // 6j. probe 会把桥接的交叉检查一起带出来
  const srv2 = await serveUpgradeOnly()
  const health = await probe(
    { onebotPort: srv2.port, accessToken: '', probeMode: 'auto', companionFollow: true },
    {
      companion: null,
      bridge: {
        ...b,
        found: true,
        mounted: true,
        napcatUrl: 'http://127.0.0.1:' + srv2.port,
        napcatPort: srv2.port,
        configKnown: true,
        enabled: true,
        dryRun: false,
      },
    },
  )
  ok(
    health.bridge && health.bridge.check === 'bridge-hits-reverse',
    'probe 返回里带上桥接交叉检查',
    JSON.stringify(health.bridge && health.bridge.check),
  )
  ok(Boolean(health.bridge && health.bridge.note), '而且带一句人话提示')
  await srv2.close()
}

fs.rmSync(HOME, { recursive: true, force: true })
console.log(`\n结果：${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
