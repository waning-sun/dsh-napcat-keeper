// 一次性 smoke test：把 lib/client.js 塞进假 React 里渲染，确认没崩、盘数按钮跟 drives 走。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 相对脚本自身定位：换台机器、换个 clone 目录都跑得起来
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'client.js');
const code = readFileSync(SRC, 'utf8');

let states = [];
let idx = 0;
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity), __el: true }),
  useState: (init) => {
    const i = idx++;
    if (!(i in states)) states[i] = typeof init === 'function' ? init() : init;
    return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v; }];
  },
  useEffect: () => {},
  useLayoutEffect: () => {},
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (v) => ({ current: v }),
};

let factory = null;
globalThis.window = { __ModuleLoader__: { load: (def) => { factory = def.factory; } } };
globalThis.fetch = () => Promise.resolve({ json: () => Promise.resolve(null) });
new Function('window', 'fetch', code)(globalThis.window, globalThis.fetch);

const mod = factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});

let Section = null;
mod.apply({ get: (k) => (k === 'slots' ? { inject: (n, fn) => fn(), register: (m, c) => { Section = c; return c; } } : undefined) });
if (!Section) throw new Error('Section 没拿到');

function render() { idx = 0; return Section({}); }
function collect(tree) {
  const buttons = [];
  const boxes = [];
  const selects = [];
  const texts = [];
  const links = [];
  (function walk(n) {
    if (n === null || n === undefined || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') { texts.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.__el) {
      if (n.type === 'button') buttons.push(n.children.filter((c) => typeof c === 'string').join(''));
      if (n.type === 'a') {
        links.push({
          text: n.children.filter((c) => typeof c === 'string').join(''),
          href: String((n.props && n.props.href) || ''),
        });
      }
      if (n.type === 'input' && n.props && n.props.type === 'checkbox') {
        boxes.push({ name: String(n.props.name || ''), checked: Boolean(n.props.checked), disabled: Boolean(n.props.disabled) });
      }
      if (n.type === 'select') {
        selects.push({
          value: String(n.props && n.props.value),
          options: n.children.filter((c) => c && c.__el && c.type === 'option').map((o) => String(o.props.value)),
        });
      }
      n.children.forEach(walk);
    }
  })(tree);
  return { buttons, boxes, selects, links, text: texts.join(' ') };
}

render(); // 第一次：态=null 的 loading 分支
states[0] = {
  ok: true,
  version: '2.7.0',
  config: {
    configPath: 'C:/Users/x/.dsh/dsh-napcat-keeper/config.json', logPath: 'C:/Users/x/.dsh/dsh-napcat-keeper/keeper.log',
    shellDir: 'C:/Users/x/NapCat/OneKey/NapCat.52230.Shell', launcherScript: 'napcat.quick2.bat',
    launchAccount: '1000000000', launchArgs: '', onebotPort: 3000, accessToken: '',
    taskName: 'NapCat-Keeper-Launch', rememberPassword: true, autoCreateTask: true,
    probeIntervalSec: 45, launchGraceSec: 150, scanTimeoutSec: 300, maxScanRetries: 2,
    stuckSec: 420, chainGapSec: 120, procPathMatch: '', bridgeStaleSec: 180, enabled: true,
  },
  runtime: {
    online: true, nickname: 'n', userId: 1, phase: 'online', launchCount: 0, dedupeCount: 0,
    scanRetries: 0, procs: { boot: 1, qq: 4, chains: 1, dup: false, known: true },
    qr: { ageSec: 10 }, bridge: { ageSec: 0 }, procRoot: 'C:/p', launcherFound: 'C:/l.bat',
    taskName: 'T', taskReady: true, error: '',
  },
  scan: { running: false, found: [], drives: ['C:'], visited: 0, elapsedMs: 0, limitHit: false, cancelled: false },
  drives: ['C:', 'D:', 'E:'],
  log: ['line1'],
};

let bad = 0;
function check(name, ok, extra) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (ok || !extra ? '' : ' → ' + extra));
  if (!ok) bad++;
}

const base = collect(render());
check('没有「自动探测」', !base.text.includes('自动探测'));
check('「重新探活」（不是重新探测）', base.buttons.includes('重新探活') && !base.buttons.includes('重新探测'));
check('有「重新读盘」按钮', base.buttons.includes('重新读盘'));
check('三块盘三个按钮', ['扫 C:', '扫 D:', '扫 E:'].every((b) => base.buttons.includes(b)));
check('盘数提示 3 块', /读到 3 块盘：C:、D:、E:/.test(base.text));
check('shellDir 指向分盘扫描', base.text.includes('不想手填就用上面「分盘扫描」'));

// 反向 WebSocket：下拉得在、默认 auto、四项齐；runtime 报反向态时状态条得换词
const modeSel = base.selects[0];
check('有「在线探测方式」下拉，默认 auto', Boolean(modeSel) && modeSel.value === 'auto', JSON.stringify(modeSel));
check('下拉四项齐全', Boolean(modeSel) && ['auto', 'http', 'reverse', 'process'].every((v) => modeSel.options.includes(v)),
  JSON.stringify(modeSel && modeSel.options));
states[0].runtime.mode = 'reverse';
states[0].runtime.portStatus = 426;
states[0].runtime.clients = 2;
const rev = collect(render());
check('反向 WS 时状态条说「反向 WS 已连接」', rev.text.includes('反向 WS 已连接'));
check('反向 WS 时显示客户端数', /客户端 2/.test(rev.text));
check('反向 WS 时显示探测方式与 HTTP 状态', rev.text.includes('反向 WebSocket') && rev.text.includes('HTTP 426'));
// 扫码页：要扫码时顶上得冒黄横幅，链接指向插件自己的小端口（DSH 路由对外 403，只能当兜底）
{
  states[0].runtime.online = true;
  states[0].runtime.phase = 'online';
  states[0].qrPanel = { enabled: true, port: 8899, running: true, url: 'http://127.0.0.1:8899/', path: '/dsh-napcat-keeper/qr', note: '', error: '' };
  const calm = collect(render());
  check('没要扫码时不画扫码横幅', !calm.text.includes('要手机扫码登录'));
  check('平时也有「打开扫码页」链接', calm.links.some((l) => l.text.includes('打开扫码页')));

  states[0].runtime.online = false;
  states[0].runtime.phase = 'need-scan';
  states[0].runtime.qr = { file: 'q.png', ageSec: 20, copy: '' };
  const scan = collect(render());
  check('要扫码时顶上出黄横幅', scan.text.includes('要手机扫码登录'));
  check('横幅里有「点开扫码页」', scan.links.some((l) => l.text.includes('点开扫码页')));
  check('扫码页链接走小端口而不是 DSH 路由',
    scan.links.filter((l) => l.text.includes('扫码页')).every((l) => l.href === 'http://127.0.0.1:8899/'),
    JSON.stringify(scan.links));

  states[0].qrPanel = { enabled: true, port: 8899, running: false, url: '', path: '/dsh-napcat-keeper/qr', note: '端口 8899 被占了（改一个 qrPanelPort，或关掉占它的程序）', error: '' };
  const fallback = collect(render());
  check('小端口没起来时退回 DSH 路由',
    fallback.links.filter((l) => l.text.includes('扫码页')).every((l) => l.href === '/dsh-napcat-keeper/qr'),
    JSON.stringify(fallback.links));
  check('小端口没起来时把 note 写出来', fallback.text.includes('被占了'));

  states[0].runtime.online = true;
  states[0].runtime.phase = 'online';
  delete states[0].runtime.qr;
  states[0].qrPanel = { enabled: true, port: 8899, running: true, url: 'http://127.0.0.1:8899/', path: '/dsh-napcat-keeper/qr', note: '', error: '' };
}

states[0].runtime.mode = 'auth';
states[0].runtime.online = false;
states[0].runtime.portStatus = 401;
delete states[0].runtime.clients;
const auth = collect(render());
check('401 时显示「端口要求鉴权」', auth.text.includes('端口要求鉴权'));

// 和 dsh-onebot-qq 共存：没装时说没检测到；装了要说清版本 / 挂没挂 / 端口 / 令牌
states[0].runtime.mode = 'reverse';
states[0].runtime.online = true;
states[0].runtime.portStatus = 426;
const noComp = collect(render());
check('没装共存插件时也有「共存插件」那行', noComp.text.includes('共存插件'));
check('没装时写「没检测到 dsh-onebot-qq」', noComp.text.includes('没检测到 dsh-onebot-qq'));
check('没装时设置页不画「跟随 dsh-onebot-qq」这一行', !noComp.text.includes('只在 dsh-onebot-qq 装了'));
states[0].runtime.companion = { version: '0.9.6', profile: 'desktop', mounted: true, mode: 'reverse', host: '127.0.0.1', port: 8643, url: 'ws://127.0.0.1:3001', tokenKnown: true };
states[0].runtime.companionReady = true;
states[0].runtime.companionTokenMatch = false;
states[0].runtime.portUsed = 8643;
states[0].runtime.followed = true;
const comp = collect(render());
check('装了会说版本与「已启用」', comp.text.includes('dsh-onebot-qq 0.9.6') && comp.text.includes('已启用'));
check('反向模式写出监听端口', /反向 WS :8643/.test(comp.text));
check('令牌不一致要标出来', comp.text.includes('令牌不一致'));
check('跟随了就说跟到了哪个端口', comp.text.includes('端口 8643') && comp.text.includes('跟随 dsh-onebot-qq'));
check('装了且启用时才画「跟随 dsh-onebot-qq」这一行', comp.text.includes('只在 dsh-onebot-qq 装了'));
states[0].runtime.companion.mounted = false;
states[0].runtime.companionReady = false;
states[0].runtime.companionTokenMatch = null;
states[0].runtime.followed = false;
const notMounted = collect(render());
check('没挂进 profile 时说清楚（免得以为在生效）', notMounted.text.includes('已安装但没挂进 profile'));
check('没启用时那一行也不画', !notMounted.text.includes('只在 dsh-onebot-qq 装了'));
check('共存那行顺带说明「跟随」开关不会出现', notMounted.text.includes('「跟随」那个开关不会出现'));
delete states[0].runtime.companion;
delete states[0].runtime.companionReady;
delete states[0].runtime.companionTokenMatch;

// 和 dsh-qq-bridge 共存：它是「客户端」，要能看出装没装、挂没挂、连的端口对不对
const noBridge = collect(render());
check('没装桥接时也有「桥接插件」那行', noBridge.text.includes('桥接插件'));
check('没装时写「没检测到 dsh-qq-bridge」', noBridge.text.includes('没检测到 dsh-qq-bridge'));
states[0].runtime.bridgePlugin = {
  version: '1.0.7',
  profile: 'desktop',
  mounted: true,
  enabled: true,
  dryRun: false,
  napcatUrl: 'http://127.0.0.1:8643',
  napcatPort: 8643,
  tokenKnown: false,
  bindings: 0,
  configKnown: true,
  check: 'bridge-hits-reverse',
  note: 'dsh-qq-bridge 连的是 http://127.0.0.1:8643，而那个端口现在是反向 WebSocket',
};
const withBridge = collect(render());
check('装了会说版本与状态', withBridge.text.includes('dsh-qq-bridge 1.0.7') && withBridge.text.includes('已启用'));
check('在发 / 试运行 要分得清', withBridge.text.includes('在发'));
check('连的是反向 WS 端口要标出来', withBridge.text.includes('连的是反向 WS 端口'));
check('提示文案单独一行给出来', withBridge.text.includes('桥接提示：') && withBridge.text.includes('反向 WebSocket'));
states[0].runtime.bridgePlugin = {
  ...states[0].runtime.bridgePlugin,
  mounted: false,
  enabled: false,
  dryRun: true,
  check: 'not-mounted',
  note: '',
};
const bridgeOff = collect(render());
check('没挂进 profile 时说清楚', bridgeOff.text.includes('已安装但没挂进 profile'));
check('总开关关着要说出来', bridgeOff.text.includes('总开关关着'));

delete states[0].runtime.bridgePlugin;

// 盘数跟 drives 走：1 块 / 5 块 / 0 块
for (const drives of [['C:'], ['C:', 'D:', 'E:', 'F:', 'G:'], []]) {
  states[0].drives = drives;
  const out = collect(render());
  const scanBtns = out.buttons.filter((b) => b.startsWith('扫 '));
  const ok = drives.length
    ? scanBtns.length === drives.length && drives.every((d) => out.buttons.includes('扫 ' + d))
    : scanBtns.length === 0 && out.text.includes('没读到盘');
  check(`drives=${JSON.stringify(drives)} → ${scanBtns.length} 个「扫 X:」按钮`, ok, JSON.stringify(scanBtns));
}

// 扫的时候要能停
states[0].drives = ['C:', 'D:', 'E:'];
states[0].scan = { running: true, drive: 'D:', found: [{ path: 'D:/a', launcher: 'b.bat', boot: true }], visited: 1234, elapsedMs: 5000, limitHit: false, cancelled: false };
const running = collect(render());
check('扫描中显示「停止」', running.buttons.includes('停止'));
check('扫描中显示进度', /已看 1234 个目录/.test(running.text));
check('扫描中「重新读盘」被禁用位存在', (running.buttons.includes('重新读盘')));

// 扫到的结果要分「真 Shell」和「壳模板」
states[0].scan = {
  running: false,
  drive: 'C:',
  visited: 9000,
  elapsedMs: 1200,
  limitHit: false,
  cancelled: false,
  found: [
    { path: 'C:/u/NapCat/OneKey/NapCat.52230.Shell', name: 'NapCat.52230.Shell', launcher: 'napcat.quick2.bat', boot: true, shell: true, evidence: ['versions/', 'QQ.exe'], drive: 'C:' },
    { path: 'C:/u/NapCat/OneKey/bootmain', name: 'bootmain', launcher: 'napcat.quick.bat', boot: true, shell: false, evidence: [], drive: 'C:' },
  ],
};
const foundOut = collect(render());
check('真 Shell 那条标 ✓', foundOut.text.includes('✓ 像真 Shell：versions/ · QQ.exe'));
check('壳模板那条标 ⚠', foundOut.text.includes('多半是 OneKey 装完留下的壳模板'));
check('真 Shell 按钮是「用这个」', foundOut.buttons.includes('用这个'));
check('壳模板按钮是「仍要用这个」', foundOut.buttons.includes('仍要用这个'));

// 服务端还是旧版（没 shell 字段）时不能把人误导成「壳模板」
states[0].scan = { running: false, drive: 'E:', visited: 10, elapsedMs: 900, limitHit: false, cancelled: false, found: [{ path: 'E:/old/napcat', launcher: 'a.bat', boot: true }] };
const legacyOut = collect(render());
check('老后端不给判定时不误标壳模板', !legacyOut.text.includes('多半是 OneKey 装完留下的壳模板'));
check('老后端时提示要重启 DSH', legacyOut.text.includes('重启 DSH'));

// 2.9.1：提权交接（生成脚本那份）整块删了 —— 面板里不该再有它的按钮/勾选框，
// 服务端旧状态里还带着 setup 字段时也不能炸。
states[0].scan = { running: false, found: [], drives: ['C:'], visited: 0, elapsedMs: 0, limitHit: false, cancelled: false };
states[0].setup = {
  dir: 'C:/Users/x/.dsh/dsh-napcat-keeper/setup',
  needs: [{ id: 'launcher', label: '自动启动脚本', ready: true }],
  plan: { steps: [{ id: 'a', label: '建计划任务' }] },
  lastRun: { mode: 'apply', ok: true, elevated: false, results: [] },
};
const setupGone = collect(render());
check('不再有「生成脚本并打开文件夹」', !setupGone.buttons.includes('生成脚本并打开文件夹'));
check('不再有「打开文件夹」「读结果」',
  !setupGone.buttons.includes('打开文件夹') && !setupGone.buttons.includes('读结果'));
check('不再有 need 勾选框', setupGone.boxes.filter((b) => b.name.startsWith('npk-need-')).length === 0,
  String(setupGone.boxes.length));
check('不再出现「需要你点一下的脚本」这一组', !setupGone.text.includes('需要你点一下的脚本'));
check('旧状态里带 setup 字段也不炸', setupGone.text.includes('napcat桥') || setupGone.text.length > 200);
delete states[0].setup;

// 「进程」那行：按安装形态换词（boot 恒 0 不代表没进程）
const keepRuntime = states[0].runtime;
const 进程行 = (runtimePatch) => {
  states[0].runtime = { ...keepRuntime, ...runtimePatch };
  return collect(render()).text;
};
const nodeText = 进程行({ layout: 'node', procs: { boot: 0, qq: 2, chains: 1, dup: false, known: true } });
check('node 型写「主/工作进程 2（node）」而不是 NapCatWinBootMain 0', nodeText.includes('主/工作进程 2（node）'), nodeText.slice(0, 80));
check('node 型不再出现「NapCatWinBootMain 0」这种说法', !nodeText.includes('NapCatWinBootMain 0'), nodeText.slice(0, 80));
const bootText = 进程行({ layout: 'boot', procs: { boot: 1, qq: 4, chains: 1, dup: false, known: true } });
check('boot 型写「快登壳 1 ｜ QQ 4」', bootText.includes('快登壳 1 ｜ QQ 4 ｜ 链 1'), bootText.slice(0, 80));
const legacyText = 进程行({ layout: undefined, procs: { boot: 0, qq: 2, chains: 1, dup: false, known: true } });
check('老服务端没给 layout → 退回原来三项', legacyText.includes('NapCatWinBootMain 0 ｜ QQ 2 ｜ 链 1'), legacyText.slice(0, 80));
const lyingText = 进程行({ layout: 'boot', procs: { boot: 0, qq: 2, chains: 1, dup: false, known: true } });
check('服务端还说是 boot、可壳是 0 个 → 按实际在跑的 node 说', lyingText.includes('主/工作进程 2（node）'), lyingText.slice(0, 80));
const unknownText = 进程行({ layout: 'node', procs: { boot: 0, qq: 0, chains: 0, dup: false, known: false } });
check('还没探测时说「（还没探测）」', unknownText.includes('（还没探测）'), unknownText.slice(0, 80));
const dupText = 进程行({ layout: 'node', procs: { boot: 0, qq: 2, chains: 2, dup: true, known: true } });
check('有重复链要标出来', dupText.includes('⚠ 有重复链'), dupText.slice(0, 80));
states[0].runtime = keepRuntime;

process.exit(bad ? 1 : 0);
