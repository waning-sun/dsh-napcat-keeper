# Changelog

## 2.5.0 — 统一用 DSH 自带的 Node 运行时
- **为什么改**：以前凡是「要跑一段 JS」的地方，都默认那台机器上装过 node，或者干脆蹭 NapCat / QQ 的私有环境。换台机器、换个装法就哑火 —— 不通用。
- **新增 `resolveNode()`**，顺序固定、结果缓存 60 秒：
  1. 手填的 `nodePath`（设置页「Node 运行时」）；
  2. **DSH 自带**：`<DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe`（DSH_NODE_PATH / DSH_NODE 环境变量也认；插件本身就跑在 node 里时直接用 `process.execPath`）；
  3. 系统 `PATH`（`where node`）；
  4. 常见安装目录（`Program Files\nodejs`、`%LOCALAPPDATA%\Programs\nodejs`）；
  5. NapCat 目录里自带的 `node.exe` 兜底。
- **补上「Shell 型」NapCat**：目录**顶层**有 `napcat.mjs` 的（官方 NapCat.Shell 包那种），现在会用上面这份 node 生成 `~/Dsh/napcat-autogen-node.bat` 去跑 `node napcat.mjs`；以前只认 `NapCatWinBootMain.exe`，遇到 node 型安装直接报「找不到启动脚本」。注入版 `versions\*\resources\app\napcat\napcat.mjs` **不会**被当成入口（那份是等 QQ 注入的，普通 node 跑必崩）。
- **注入型（OneKey）不变**：NapCat 跑在 `QQ.exe --type=utility --utility-sub-type=node.mojom.NodeService` 里，磁盘上没有 node.exe，外部 node 替不了它 —— 这条链路插件只负责调 bootmain。
- **可见性**：设置页新增「Node 运行时」一栏 + 「测一下 node」按钮；状态条显示「哪份 node / 什么版本 / 路径」；`napcat_status` 返回值里多了 `node` 字段；启动日志 `boot:` 那行带上 node 来源。
- **发版前隐私清洗**：`lib/client.js` 的「接口没响应」提示原来硬编码了本机家目录，改成 `~/.dsh/napcat-keeper.log`；`scripts/selftest-scan.mjs` / `scripts/smoke-client.mjs` 里写死的本机绝对路径改成按脚本自身位置定位；`smoke-client` 的 `launchAccount` fixture 换成合成占位 `1000000000`。现在换台机器 clone 下来，自测脚本照样跑得起来。
- **新增 `scripts/check-privacy.mjs`（0 依赖）**：扫包内文本文件，拦家目录真实用户名、私人邮箱（含 QQ 邮箱）、凭据形状（`ghp_` / `npm_` / `sk-` / `AKIA` / 实体 Bearer）、DSH 会话 id、fixture 里的真号。`npm run check` 现在是「清单体检 + 隐私体检」两道，命中即 exit 1；行内写 `check-privacy:ignore` 可豁免。
- 版本 2.5.0。

## 2.4.1 — 清单被 PowerShell 往返成乱码 + 断引号，同一个位置第二次炸
- **事故**：DSH 加载插件时报 `Bad control character in string literal in JSON at position 899 (line 36 column 23)`。这次不是 BOM，而是 `package.json` 被「按 ANSI 读 → 按 UTF-8 写」往返了一遍：
  - `description` / `author` 变成双层乱码（`鐔欑殑澶ц偉楸`）；
  - `author` 末尾「鱼」的 `E9 B1 BC` 在 GBK 里凑不成整字，最后一个字节把**收尾的引号**一起吃了 → 字符串没闭合，后面的换行就成了字符串里的裸控制字符 —— 报错里的第 36 行第 23 列就是那个换行。
- **后果**：DSH 读清单时就失败，插件整段不加载，看门狗跟着消失（NapCat 那头还活着，端口 3000 通，只是一断开就没人再拉它）。
- **修复**：`package.json` 按 UTF-8（无 BOM）重写、中文如实写回；顺手把版本对齐到 2.4.1 —— 之前清单写着 2.4.0、`lib/index.js` 里还留着 2.3.2。
- **体检脚本升级**（`scripts/check-manifest.mjs`，仍是 0 依赖）：BOM 之外再查 ① 每个文本文件是不是合法 UTF-8；② 有没有出现双重编码乱码；③ JSON 解析失败时给出错行/错列并用 `^` 指到那个字符；④ `package.json` 的 `version` 与 `lib/index.js` 的 `export const version` 同不同步。
- **规矩补一条**：改本插件任何文本文件只用 `write`/`edit` 工具，或 `[IO.File]::WriteAllText(路径, 文本, (New-Object System.Text.UTF8Encoding($false)))`；别用 `Get-Content` 再 `Set-Content -Encoding utf8` 往返（既写 BOM，又把中文变乱码）。
- 版本 2.4.1。

## 2.4.0 — 默认改回「跟着 DSH 生灭」：这插件的用途就是开机接上 QQ
- **默认值翻了**：`taskName: ''`、`autoCreateTask: false`。默认走 `cscript` 直接拉，QQ 链挂在 DSH 下面——DSH 起来才有 QQ，DSH 关掉 QQ 跟着走，下次开 DSH 重拉一条。这正是插件的定位：**DSH 启动后把人接到 QQ 上**，不是替 QQ 续命。
- **计划任务降级成可选项**：想要「DSH 关了 QQ 还活着」这种反过来的用法，才自己填任务名 + 勾自动创建；那时才用 `schtasks /run`，父进程变任务计划服务。
- 本机同步处理：配置里的 `taskName` / `autoCreateTask` 清空，删掉遗留的 `NapCat-Keeper-Launch` 计划任务，并把已经在跑的那条链重拉一次，让它真的挂在 DSH 下面。
- 文档改写：README 那节从「计划任务为什么重要」换成「拉起方式：默认跟着 DSH 生灭」，常见问题里「QQ 会不会跟着 DSH 掉」按新默认如实回答。
- 版本 2.4.0。

## 2.3.2 — 清单带 BOM 会把整个插件打死，加一条体检命令
- **事故**：`package.json` 被写成 UTF-8 **带 BOM**（`EF BB BF`）。DSH 加载插件时要对它做一次干净的 `JSON.parse`，BOM 会让它当场抛 `Unexpected token '﻿', "﻿{ "name"... is not valid JSON` —— 插件代码一行都没跑到，看门狗整个不生效，NapCat 也就不再自启。`lib/index.js` 同时被带 BOM 覆盖（这个 Node 自己会吞掉，不致命）。
- **根因**：本机 `pwsh` 实际是 **PowerShell 5.1**，`Set-Content` / `Out-File -Encoding utf8` 默认**写 BOM**。用它重写 json/js 就等于埋雷。
- **规矩**：改本插件任何 json/js，只用 DSH 的 `write`/`edit` 工具，或 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`；别用 `Set-Content`。
- **新增 `scripts/check-manifest.mjs`（0 依赖）**：查 package.json 有无 BOM / 能否 `JSON.parse`、entry 与 `dsh.bundle.patch` 指向的文件在不在、全目录扫 BOM（`.ps1`/`.txt` 豁免——那两个反而需要 BOM 才不乱码）。红→绿都自测过：带 BOM 时 exit 1 并指名文件，`--fix` 只抹 BOM 不动内容，修完 exit 0。
- 命令：`node scripts/check-manifest.mjs` / `... --fix`；`package.json` 里也挂了 `scripts`（`check` / `check:fix` / `smoke:client` / `selftest:scan` / `selftest:setup`）。
- 版本 2.3.2。

## 2.3.1 — 扫到的目录要分得出真假：真 Shell 排在前面
- **扫描结果会标「像不像真 Shell」。** 判据是目录里有没有 `versions/`、`QQ.exe`、`napcat.mjs` 这三样里的任意一样（有就是真 Shell）。只有 `NapCatWinBootMain.exe` + 一个 .bat 的不算——那多半是 OneKey 装完留下的壳模板。
- **为什么需要这个**：OneKey 安装器会先解一份壳模板到 `NapCat/OneKey/bootmain`（01:02），再把真正的版本装成 `NapCat.52230.Shell`（01:04）。旧判据只看「有 NapCatWinBootMain.exe 或名字带 napcat」+「有 .bat」，两个都命中，于是一次扫描列出两条，看起来像装了两份。其实一份安装，`bootmain` 只是壳、没有 QQ 本体。
- **真 Shell 排前面**：`/state` 返回的 `scan.found` 现在按 `shell` 降序再按路径升序，磁盘遍历顺序不再影响谁排第一。
- **按钮分两种**：真 Shell 标绿「✓ 像真 Shell：versions/ · QQ.exe」、按钮「用这个」；存疑的标黄「⚠ 没看到 versions/QQ.exe/napcat.mjs —— 多半是 OneKey 装完留下的壳模板…」、按钮「仍要用这个」（没禁用，精简布局确实可能没有这三样）。
- 新增 `scripts/selftest-scan.mjs`（15 项）：临时树造壳模板 / 真 Shell / 精简版 / 普通目录，真跑 `scanOneDrive` 验证判定与排序；`scripts/smoke-client.mjs` 加到 29 项（两种标记、两种按钮文案）。
- 版本 2.3.1。

## 2.3.0 — 提权交接：要管理员的事写成脚本，让你自己按那一下

- **新增「需要你点一下的脚本」一组。** 插件自己不去抢管理员：勾上要做的事，点「生成脚本并打开文件夹」，它把每一步写进 `~/.dsh/napcat-keeper-setup/`，你双击 `apply-admin.cmd` —— 只有含管理员步骤的那一批才会弹 UAC，那个「是」是你自己按的；不含的批次双击直接跑完。跑完回面板点「读结果」，逐条列出成没成、为什么没成。
- **4 件可勾的事**：自动启动脚本（`napcat.quick.auto.bat`）、中间层（把密码塞环境变量，仍只在勾了「记住密码」时才有内容）、计划任务（用户级）、防火墙放行（`New-NetFirewallRule`，只有这条真的需要管理员）。
- **一次生成、可撤回。** 同目录还有 `undo-admin.cmd`：跑一遍把脚本建的东西全撤掉（启动脚本、中间层、计划任务），撤完告诉你撤了几项。`plan.json` 记录这次要做哪几步，`result.json` 记录上次结果，`run.log` 是脚本自己写的流水账。
- **不需要管理员时绝不弹 UAC。** `apply.ps1` 先数一遍 `admin: true` 的步骤，一条都没有就直接原地跑；有才 `Start-Process -Verb RunAs` 自我提权一次。
- **密码不进命令行。** 中间层的密码以 base64 落在 `plan.json`（跟 `napcat-keeper-env.bat` 同一份秘密，README 里写了别外传），脚本用 `[IO.File]::WriteAllBytes` 写盘，不拼进任何命令行；`/state` 也绝不把 base64 回给前端。
- **编码的坑都堵了**：`apply.ps1` 与 `README.txt` 存 UTF-8 **带 BOM**（PS 5.1 没 BOM 会按 ANSI 解、中文全乱），`.cmd` 入口保持纯 ASCII（cmd 对 UTF-8 不友好）。
- 新增 `scripts/selftest-setup.mjs`：临时目录里造假 NapCat，真跑一遍 apply / 幂等二跑 / undo，45 项断言；`scripts/smoke-client.mjs` 扩到 27 项（含提权区勾选框、禁用态、结果摘要）。
- `/state` 多回 `setup`（目录、4 条 need 的 ready/why/needAdmin、上次 plan 摘要、上次结果），新增 `action=makeSetup` / `openSetup` / `setupResult`。
- 版本 2.3.0。

## 2.2.2 — 目录只认人选：删掉「自动探测」

- **删：`自动探测` 按钮与整套猜目录逻辑。** 设置页 `shellDir` 旁边不再有「自动探测」；后端 `resolveConfig` 也不再把空值悄悄填成 `detectShellDir()` 的结果。留空就老老实实是空——不再出现「我没选，它自己填了个错目录，然后一直拉不起来」。
- **盘符枚举换实现，有盘就一定列出来。** 原先按 `A:`–`Z:` 逐个 `statSync('X:\\')`，遇上 BitLocker 锁着的卷、无介质光驱、某些虚拟盘会 stat 失败，于是「明明有盘却不显示」。现在先用 `[System.IO.DriveInfo]::GetDrives()` 拿系统真实盘符（正则收 `X:`），一条都没读到才回退旧的 A–Z 试探；本机实测 186ms 拿到 `C: D: E:`。
- **新增「重新读盘」按钮**：作废缓存后立刻重问系统（`{do:'drives'}`），插了移动盘 / 映射了网络盘不用重启 DSH。前端只刷新盘符列表，**不动你正在编辑的草稿**。
- 按钮下方写明「读到 N 块盘：C:、D:、E:」，一眼能看出系统到底给了几块。
- `detectShellDir()` 函数与 `__internals` 导出保留（给测试/老脚本调用），但主流程已无任何调用点；`uiState` 里的 `detect` 字段删除。
- 版本 2.2.2。

## 2.2.1 — 设置页不再把插件全家拖垮

- **修：点开设置页就白屏、整个设置面板卡死。** `lib/client.js` 里的 `settings.section` 钩子还是老签名 `(ctx, id, options)`，新版 DSH 实际传进来的是**数组**，`hooks[hooks.length] = …` 当场抛 `Cannot add property 7, object is not extensible`。这个异常发生在设置面板的渲染期，会把**整个设置面板**（不只是本插件）一起干掉。改成新签名 `(ctx)`，自己从数组里摘 `{ section }`，旧形状仍留兜底。
- **修：`/state` 每次都新起一个 PowerShell（约 300ms）。** NapCat 在线时是 4 个 QQ 进程 + 1 个 launcher，配置页轮询一次就要现查一次进程，等于 PowerShell 风暴（DSH 是单进程同时伺候 GUI 和所有插件，实测被拖到 11% CPU、界面 2.5 秒一帧）。现在加了三层缓冲：热路径 300 秒内复用上一次的进程快照、`?light=1` 完全不扫描只读缓存、同一个 `since` 的并发请求合并成一次。实测首次 16ms、light 1.2ms、连发 5 次共 1ms。
- **修：工具注册消失**（日志里一直写着 `tools: unavailable, watchdog-only mode`）。DSH NEXT 里已经没有 `@deepseek-ai/dsh-tools` 这个包，`defineTool` 永远是 undefined。改成不依赖它：直接给 `tools.register()` 一个 plain object（`{ name, description, parameters, output: { schema }, execute }`），注册前再走一遍 `normalizeToolDefinition` 兜底。
- **修：热重载会漏定时器和进程缓存。** `state` / `procCache` 改挂到 `globalThis[Symbol.for('dsh.napcat-keeper.state')]`，DSH 改一次插件文件就重新 apply 一次，新模块实例拿到的是同一份 shared 状态；`armTimer()` 里先 `clearInterval` 旧的，45 秒巡检不会再越堆越多。
- 版本 2.2.1。`napcat_status` / `napcat_restart` / `napcat_dedupe` 恢复正常注册（活体日志：`tools: napcat_status / napcat_restart / napcat_dedupe registered (v2.2.1)`）。

## 2.2.0 — 分盘扫描：换个盘也能找到 NapCat

- 自动探测不再只盯家目录和几个固定文件夹：常见位置扩展到每个盘的 `NapCat` / `Tools\NapCat` / `Soft\NapCat` / `Program Files\NapCat` / `ProgramData\NapCat`。
- 设置页新增「分盘扫描」一组：本机有几块盘就列几个按钮（`扫 C:` / `扫 D:` …），另有一个「全部盘（慢）」。点了就在后台扫，界面上边扫边报「已看多少目录 / 用时多少秒 / 命中几个」，可随时「停止」。
- 扫描规则：深度 7 层、跳过 `Windows` / `回收站` / `System Volume Information` / `node_modules` / `Temp` 这类目录、单盘 90 秒预算（全部盘时每盘 45 秒）；命中一个像 NapCat Shell 的目录（名字带 napcat，或含 `NapCatWinBootMain.exe`，并且有 `.bat`）就不再往它下面钻。
- 扫到的结果逐条列出路径 + 挑出来的启动脚本 + 是否含 `NapCatWinBootMain.exe`，每条带「用这个」按钮：点一下就把 `shellDir` 存进配置并重新挑启动脚本，不用手打路径。
- 上限保护：单盘最多看 25 万个目录，到点/到量会明确告诉你「结果可能不全」，不会闷着扫一小时。
- `/state` 多返回 `scan`（进度：running / drive / visited / found / elapsedMs / limitHit / cancelled）与 `drives`（本机盘符），设置页靠它轮询。
## 2.1.2

- 与 2.1.1 内容一致；npm 的边发布边排队（202 Accepted）有几分钟延迟，重发一次把 latest 顶上去。

## 2.1.1

- 修：风险清单里的 **明文** 在设置页会原样显示成星号，改成「明文」。

## 2.1.0 — 可选「记住密码」，并先把风险说清楚

- 新增 **`rememberPassword` + `quickPassword`**：勾上后令牌失效时用密码自动登录（NapCat 读环境变量 `NAPCAT_QUICK_PASSWORD` / `NAPCAT_QUICK_PASSWORD_MD5`）。默认关。
- 设置页勾选「记住密码」会先展开风险提示（明文落盘位置、谁能读走、为什么默认关、怎么收回），要点「我知道风险，仍然开启」才生效；入口是「自动登录（可不填）」那一组。
- 密码**不进命令行**（避免出现在进程列表 / 事件日志），只写进 `~/.dsh/napcat-keeper-env.bat` 并由计划任务 wrapper 调它；`/state` 只回 `hasPassword` / `passwordLength` / `passwordPath` / `passwordActive`，日志与工具输出都不打印密码。
- 新增动作 `action=clearPassword` + 页面按钮「清除已保存的密码」，删配置里的密码和那个 bat。
- `napcat_status` 多一段 `自动登录`：`方式`（password / token）、`密码已存`、`生效中`、`密码文件`，并给出「令牌失效只剩扫码」的提示。
- `saveAndApply`：`quickPassword` 传空 = 不改（不会被表单回显冲掉）。

## 2.0.2

- `package.json` 补 `repository` / `homepage` / `bugs`，npm 页面能直接跳 GitHub 仓库。
- 纯元数据变更，功能与 2.0.1 一致。

## 2.0.1 — 桌面不再多一个黑框

- 简介改成：发现没有能够随着 dsh 打开自动启动 napcat 的插件，遂使用大肥鱼制作此插件，建议搭配 Yuuyuko-uu 的 dsh-qq-bridge 使用~；`author` 署名为「熙的大肥鱼」。
- 发布前清洗：包内不含任何本机信息（QQ 号、昵称、用户名、令牌、会话 id 零命中）；示例路径统一写成 `C:/Users/你/NapCat/...`。
- **拉起时不再弹出 cmd 黑窗**：计划任务改成先跑一个 `napcat-keeper-launch.vbs`（`sh.Run cmd, 0, False`），控制台以隐藏窗口启动。`hideConsole` 开关可关掉（默认开）。壳文件写在 `~/.dsh/napcat-keeper-launch.vbs`，UTF-16LE 存盘，中文路径也认。
- 新增动作 `action=hideConsole`，设置页对应按钮「收起黑框」：把已经在跑的 NapCat 控制台窗口收起来（老链条留下的也能收，不用重启 QQ）。
- `ensureTask` 遇到「任务正在运行、`/f` 覆盖被拒」时会先 `/end` 再重建一次。
- 修：`taskWrapperPath` 里错用了不存在的 `homeDir()`（现为 `dshHome()`）。

## 2.0.0 — 可以给别人的通用版

- **新增设置界面「设置 → napcat桥」**（`lib/client.js`）：状态卡 + 全部配置项 + 一键动作 + 日志尾部，保存即热生效（不用重启 DSH）。
- **不再写死任何本机路径**：`shellDir` / `launcherScript` / 进程路径前缀全部改成配置项，留空则自动探测（`~/NapCat`、`Documents/NapCat`、`C:\NapCat`、`%LOCALAPPDATA%\NapCat` …）。
- **只填 QQ 号也能用**：`launchAccount` 填上后，会自动生成调用 `NapCatWinBootMain.exe <号>` 的启动脚本；探测启动脚本时也优先挑「写死了这个号」的那个 bat。
- **自动建计划任务**：`autoCreateTask`，用户级、不需要管理员，并把 `ExecutionTimeLimit` 设成不限，避免长跑被任务计划掐断。
- 新增 HTTP 接口：`/dsh-napcat-keeper/state`、`/save`、`/action`（probe/launch/restart/kill/dedupe/createTask/detect）、`/log`。
- 修：PowerShell `-like` 只认反斜杠，路径前缀换成 `\` 再传，否则杀进程范围永远匹配不到。
- 修：设置页保存的配置（`~/.dsh/napcat-keeper-config.json`）优先级最高，其次 cordis 里的 `config`，最后是内置默认。

## 1.1.2

- `killNapcat` 返回「是否真清干净」；没清干净就不拉新链（再拉会互踢），三个调用点都按这个判断走。
- 在线时每 60s 复查一次重复链，只杀晚启动的那几条（`killNewerChains`）。
- 版本号统一从 `version` 取，日志里不再写死。

## 1.1.1

- 修：`package.json` / `cordis.patch.yml` / `lib/index.js` 带 UTF-8 BOM 时，Node 的 `JSON.parse` 与 YAML 解析直接报 `Unexpected token '﻿'`，插件装不上。全部改成无 BOM。
- 改用计划任务拉起，彻底脱离 DSH 进程树（DSH 重启不再带走 QQ）。

## 1.1.0

- 修：重复拉起 —— 两条 QQ 链并存会互踢、掉进扫码态。改为按启动时间聚类判重 + 跨进程锁。
- 修：卡在扫码不再静默，超时杀掉重来，上限后明确 giveup。
- 修：杀进程的路径前缀多套了一层，会误伤用户目录下任何 `QQ.exe`。
- 加：状态快照、二维码副本、心跳日志。

## 1.0.0

- 首个版本：探 OneBot 端口 → 不通就 `cscript` 拉起 `napcat.bat` → 45s 复查。
