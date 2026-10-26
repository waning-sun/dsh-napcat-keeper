#!/usr/bin/env node
/**
 * check-privacy.mjs —— 发布前隐私体检（0 依赖，纯 Node）
 *
 * 为什么要有这个：这个插件是从一台真机上长出来的。调试用的绝对路径、fixture 里的
 * 真号、临时贴过的令牌，最容易顺着 lib/ 和 scripts/ 一起被打进 npm 包和 GitHub。
 * 发版前跑一遍，把这类东西拦在本地，别指望"我记得清过了"。
 *
 * 查什么：
 *   ① 家目录绝对路径（C:/Users/<名字>、/home/<名字>、/Users/<名字>）——
 *      只放行文档里该用的占位名（你 / x / USERNAME…）；
 *   ② 邮箱（QQ 邮箱、私人邮箱）—— 只放行 GitHub noreply 与 example.*；
 *   ③ 凭据形状（ghp_ / npm_ / sk- / AKIA、Bearer 后跟实串）；
 *   ④ DSH 会话 id（session-xxxxxxxx-…）；
 *   ⑤ fixture 里像真号的 launchAccount 数字 —— 只放行合成占位。
 *
 * 用法：
 *   node scripts/check-privacy.mjs          # 体检当前插件
 *   node scripts/check-privacy.mjs <dir>    # 体检别的插件目录
 *
 * 行内豁免：在那一行写 check-privacy:ignore（比如文档要举例说明什么算泄漏）。
 * 退出码：0 = 干净；1 = 命中。
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT_ARG = process.argv.slice(2).find((a) => !a.startsWith('--'));
const ROOT = ROOT_ARG ? resolve(ROOT_ARG) : resolve(HERE, '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.turbo', '.cache']);
const SKIP_FILES = new Set(['.DS_Store', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
const SKIP_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.zip', '.tgz', '.gz',
  '.exe', '.dll', '.node', '.woff', '.woff2', '.ttf', '.mp4', '.mp3', '.pdf'
]);

/** 文档里合法的占位用户名（大小写不敏感） */
const PLACEHOLDER_USERS = new Set([
  '你', '您的用户名', '用户名', '<user>', '<username>', 'username', 'user', 'yourname',
  'x', 'abc', 'test', 'example', 'public', 'default', 'defaultuser', 'allusers', '%username%'
]);

/** 允许出现的示例邮箱域名 */
const PLACEHOLDER_EMAIL_HOSTS = [
  'users.noreply.github.com',
  'example.com', 'example.org', 'example.net', 'test.local', 'localhost'
];

/** 允许出现的合成账号占位（fixture 专用） */
const PLACEHOLDER_ACCOUNTS = new Set(['1000000000']);

const IGNORE_MARK = 'check-privacy:ignore';

const RULES = [
  {
    id: 'home-path',
    why: '家目录里带着真实用户名 —— 换成「你」/「x」这种占位',
    re: /(?:[A-Za-z]:)[\\/]Users[\\/]([^\\/\s"'`<>|,;:)]+)/g,
    allow: (v) => PLACEHOLDER_USERS.has(v.toLowerCase())
  },
  {
    id: 'home-path-unix',
    why: '家目录里带着真实用户名 —— 换成「你」/「x」这种占位',
    re: /(?:^|[\s'"`(=\[])\/(?:home|Users)\/([A-Za-z0-9_.-]+)/g,
    allow: (v) => PLACEHOLDER_USERS.has(v.toLowerCase())
  },
  {
    id: 'email',
    why: '出现邮箱地址 —— 私人邮箱（含 QQ 邮箱）别进包',
    re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    allow: (v) => {
      const host = v.toLowerCase();
      return PLACEHOLDER_EMAIL_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    }
  },
  {
    id: 'credential',
    why: '看起来像真实凭据/令牌',
    re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/g
  },
  {
    id: 'bearer',
    why: 'Bearer 后面跟了一段实串（源码里应该是 ${变量}）',
    re: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/g
  },
  {
    id: 'session-id',
    why: '出现 DSH 会话 id',
    re: /\bsession-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g
  },
  {
    id: 'fixture-account',
    why: 'fixture 里像真实 QQ 号的账号 —— 换成合成占位',
    re: /\blaunchAccount\s*:\s*['"]?([1-9]\d{8,10})\b/g,
    allow: (v) => PLACEHOLDER_ACCOUNTS.has(v)
  }
];

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (!st) continue;
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(p, out);
      continue;
    }
    if (!st.isFile()) continue;
    if (SKIP_FILES.has(name)) continue;
    if (SKIP_EXT.has(extname(name).toLowerCase())) continue;
    out.push(p);
  }
  return out;
}

/** 读成文本；二进制/超大文件返回 null（不是审计对象） */
function asText(file) {
  const buf = readFileSync(file);
  if (buf.length > 4 * 1024 * 1024) return null;
  if (buf.subarray(0, 4096).includes(0)) return null;
  return buf.toString('utf8');
}

const files = walk(ROOT, []).sort();
const hits = [];
let scanned = 0;

for (const file of files) {
  const text = asText(file);
  if (text == null) continue;
  scanned += 1;
  const lines = text.split(/\r?\n/);
  const rel = file.slice(ROOT.length + 1) || file;
  const seen = new Set();

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text)) !== null) {
      const payload = m[1] == null ? m[0] : m[1];
      if (rule.allow && rule.allow(payload)) continue;
      const before = text.slice(0, m.index);
      const lineNo = before.split('\n').length;
      const lineText = lines[lineNo - 1] || '';
      if (lineText.includes(IGNORE_MARK)) continue;
      const key = rule.id + '@' + lineNo;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        file: rel,
        line: lineNo,
        rule: rule.id,
        why: rule.why,
        sample: payload.length > 60 ? payload.slice(0, 57) + '…' : payload
      });
    }
  }
}

console.log('隐私体检：' + ROOT);
for (const h of hits) {
  console.log('  ✗ ' + h.file + ':' + h.line + '  [' + h.rule + '] ' + h.sample);
  console.log('      → ' + h.why);
}

if (hits.length === 0) {
  console.log('  ✓ 干净：扫了 ' + scanned + ' 个文本文件，0 命中');
  process.exit(0);
}

console.log('');
console.log('  ' + hits.length + ' 处命中（扫了 ' + scanned + ' 个文本文件）。清干净再发版。');
process.exit(1);
