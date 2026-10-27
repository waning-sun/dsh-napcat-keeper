# Changelog

## 2.8.1 — 认得出两个共存插件（dsh-onebot-qq 跟它的端口，dsh-qq-bridge 替它对端口）
- 2.8.0 解决了「反向 WS 下不再误判离线、不再无限重启」，但端口还是得你自己抄：`dsh-onebot-qq` 默认监听 `8643`，你 `onebotPort` 里填的却是 `3000`，那就一直「没客户端连进来」。
- 现在会读 `dsh-onebot-qq` 自己的配置：扫 `~/.dsh/profiles/*` 的 `package.json`（`dependencies` + `dsh.profile.bundles`）和 `cordis.patch.yml` / `cordis.yml` 里它那一段，得出「装没装 / 挂没挂 / 反向还是正向 / 监听哪个端口 / 有没有配令牌」。不认识 `!!js` 这类表达式，认不出的宁可当没配。
- **跟随（`companionFollow`，默认开）**：你填的端口**不通**、而它确实挂着反向 WS 时，自动改看它那个端口 —— 状态条写「端口 N（跟随 dsh-onebot-qq）」，日志说明「你填的 X 上没有服务，已跟随 Y」。你自己填的端口一旦通了，它绝不插手。
- 三种情况**不跟**，并在提示里说明为什么：它没挂进 profile（端口根本不会开）、它是正向模式（它自己去连 NapCat，不监听端口）、你把「跟随」关了。
- 设置页多一行「共存插件」：`dsh-onebot-qq 0.9.6 · 已启用 · 反向 WS :8643 · 令牌一致`；没装就写「没检测到」；它配了令牌而你这边填得不一样，会标 ⚠ 不一致。
- **新：把 `dsh-qq-bridge` 也认进来了**。它是「客户端」（拿 HTTP 去连 NapCat，再把消息接进 QQ），跟 `dsh-onebot-qq`（提供接口）正好相反，最容易崩的就是端口对不上。现在会读它的配置 —— 注意它**不在 profile 里**，摊在 `~/.dsh/qq-bridge-config.json`（中文键名 `NapCat` / `总开关` / `试运行` / `令牌` / `绑定`）。
- 交叉检查五种结论写进设置页新的「桥接插件」行 + `napcat_status`：**装了但没挂进 profile**（只在 `dependencies` 里，桥接根本没跑）/ **连的是反向 WS 端口**（HTTP 客户端敲 WebSocket 端口，必然 426 或 401）/ **端口对不上**（桥接端口 ≠ 本插件看到的 OneBot 端口）/ **总开关关着**（在跑但一句不发）/ **试运行中**（只记账）。全对得上就什么都不说。
- 这层检查只看配置，不碰桥接的进程、不改它的文件，纯提示。
- 两个插件共用同一套 profile 扫描（`profileHits`）：挂载 = 在 `dsh.profile.bundles` 里，或 patch 里出现 `id: <bundle id>`；只装在 `dependencies` 而没进 bundles 的，一律判「装了但没挂」，不会假装它在生效。
- `napcat_status` 的 `companion` 改成 `{ onebot: …, bridge: … }`（这个字段上一版才加、没发布，直接换结构，不留旧形状）。
- `selftest:companion` 从 39 项扩到 **66 项**：新增桥接那一段 —— 地址抠端口、读中文配置、挂没挂、五种交叉检查各一条、未挂载优先于端口问题、以及 `probe` 会把检查结果一起带出来。`smoke-client` 加了 8 项桥接渲染断言（没装 / 装了在发 / 连错端口 / 总开关关着），共 52 项。
- 探测仍然**只走 HTTP + 系统连接表，不做 WebSocket 握手**：它的反向 WS 是「后来者顶掉前人」的，拿真令牌握手会把 NapCat 自己那条挤掉。
- **改：「跟随 dsh-onebot-qq」这一行不再是个摆设开关**。以前它在任何机器上都画出来、还默认勾着，可多数时候对面压根没挂进 profile，跟了也是白跟。现在它跟着探测结果走 —— 只有检测到 `dsh-onebot-qq` 装了、并且真挂进 profile（= 已启用）时才出现，且默认开；没装或只躺在 `dependencies` 里没挂载，这一行**整行不画**，`resolveConfig` 里值也直接按关算（`companionReady=false`），跟 `probe()` 里「没挂载就不跟」那条前提对齐。
- 你显式关过一次就一直是关：`resolveConfig` 只在存储/cordis 里**没有**这个键时才套用动态默认值，不会因为你升级或重启又偷偷掰回开。
- 配套挡住一个隐形的坑：设置页「保存」原本是把整份草稿全量发过去，界面上没画出来的项会带着旧值一起写进 `config.json`。现在只发真有变化的键，`saveAndApply` 那边也加了一道 —— 对面没启用时 `patch` 里就算带着 `companionFollow` 也不落盘，免得把用户以前的选择盖掉。
- `selftest:companion` 66 → **83 项**（新增 17 项：`companionReady` 三种组合、没装 / 装了没挂 / 挂了 profile 三种场景下的 `companionReady` 与 `companionFollow`、可用时默认开、以及「存了 false / cordis 写 false 都保持关」；`companionPublic` 那份瘦身结果也认；再加 `uiState` 每轮校准的两组断言）；`smoke-client` 52 → **56 项**（没装不画这一行、挂了 profile 才画、没启用时不画、共存那行说明开关不会出现）。
- 面板每轮都来问一次状态，`uiState` 顺手按**最新**探测结果校准这一项：你把 `dsh-onebot-qq` 中途挂进 profile（或者摘掉），那一行立刻跟着出现 / 消失，值也跟着变，不用重启 DSH 等 `apply` 重跑（探测本身有 20 秒缓存，最多慢这么久）。
- `companionReady` 两种入参都吃：`detectCompanion()` 的完整结果（带 `found`）和 `companionPublic()` 的瘦身版（没有 `found`，只带 `version` / `profile` / `mounted`）—— 面板拿到的正是后面这种，早先只认 `found` 的话会一直判「不可用」。
- 顺带清掉一处历史脏值：`config.json` 里那条由整包保存写进去的 `"companionFollow": "false"` 已删除（删前备份到 `legacy/config.before-cf-default-fix.json`），所以这台机器一旦启用 `dsh-onebot-qq`，这一行会按新默认值出现并勾上。

## 2.8.0 — 认得出反向 WebSocket（和 dsh-onebot-qq 共存）
- **修的什么**：装了 `dsh-onebot-qq` 这类插件、把 NapCat 配成**反向 WebSocket** 连过来的机器上，本插件永远判「离线」，然后无限重启。原因是探测只用 HTTP 打 `get_login_info`，而反向 WS 的端口根本不吃 HTTP（换来 401 / 426）；老代码只看返回的 body、不看 HTTP 状态码，于是把「端口明明在回话」当成「端口不通」→ 卡死判定 → 杀掉重拉 → 循环。
- 现在 `postOneBot` 会把 HTTP 状态码带回来，`probe()` 据此分清四种情况：能问到 `login_info`（普通 HTTP）、只收 WebSocket（反向 WS）、端口要求鉴权（多半是令牌不对）、端口没开。
- 新增「在线探测方式」（`probeMode`）：`auto`（默认，先按 HTTP 问，问不通再看是不是反向 WS）/ `http` / `reverse` / `process`（只看进程，不碰端口）。设置页「连接」那组里能直接选。
- 反向 WS 模式下「在线」的判定改成：端口上有**客户端连进来**（`Get-NetTCPConnection` 数客户端那一侧的连接）。关键的一条是**进程在 + 端口有服务就别杀** —— 端口回 401/426 说明服务活着，重拉解决不了任何问题，只会把正在连的那条链踹下去。
- 真等不来客户端时也不再每轮都杀：先按 `stuckSec` 等，超时才**温和重拉**一次，最多两次，还不成就进 `reverse-giveup`，在日志和状态条里说清楚该去 NapCat 里把反向 WS 地址填成 `ws://127.0.0.1:<端口>`。
- 顺带加了拉起退避：连续拉不起来时宽限期按 2 的幂放大（最多 8 倍），不会再 45 秒一次地反复拉。
- 状态条能显示「反向 WS 已连接 / 客户端 N」，端口回 401 时显示「需鉴权」，并把该改哪里写在提示里。
- 补了 `pnpm selftest:probe`（27 项）：本地起假服务器分别模拟正常 OneBot / 426 无客户端 / 426 有客户端 / 401 / 端口没开，另加 `probeMode` 的强制值归一化。全程环回 + 临时端口，不碰真配置。

## 2.7.3 — 修「设置页保存不进去」+ README 补「装不上」的两条排障
- **修了个真 bug，2.7.0 起就有**：设置页点「保存」、「用这个」、或者「清除密码」，值当场弹回原样，什么都没存下来。起因是 2.7.0 把插件自己的文件收进 `~/.dsh/dsh-napcat-keeper/` 时，只把**读取**改成了新目录，**写入**还留在老地方 `~/.dsh/config.json` —— 于是存进一个没人读的文件，界面重新渲染时拿到的还是旧值。2.7.0 / 2.7.1 / 2.7.2 都中招。
- 现在读和写认同一个目录（`saveAndApply` 与「清除密码」都改走 `keeperDir()`）。
- **老版本留下的那份被误写的配置会被自动认领**：启动时如果发现 `~/.dsh/config.json` 里有 `shellDir` / `onebotPort` 这类自家字段、而且比插件目录里的配置新，就把它的内容并进真配置（多半正是你当初点了保存却没生效的那次），原文归档进 `legacy/config.adopted-*.json`，认领前的旧配置备份成 `legacy/config.before-adopt.json`。不像插件配置的 `config.json` 一概不碰，也不会拿旧文件顶掉更新的配置。
- 补了 `pnpm selftest:save`（12 项）：保存真的落到新目录、认领逻辑、keeper 更新时不认领、别人的 `config.json` 不动。
- **没发版，顺带补了 README 两条排障**：有人从 GitHub 装插件报 `'git' is not recognized as an internal or external command`，查下来是对方机器没装 Git —— `github:` 规格要 pnpm 调外部 `git ls-remote`，插件一个字节都还没下载，跟插件本身无关（npm 上的 2.7.2 一直正常）。
- 「安装」那节加了一句：**别加 `github:` 前缀**，用 npm 名装全程不碰 git。
- 「常见问题」补一条，三条路：npm 名装 / 装 Git 后**彻底重启 DSH**（子进程继承 DSH 启动时的 PATH，不重启照旧报错）/ 无 git 时走 `codeload` 的 tarball。
- 又有人报 `无法识别这个包名或地址：not a package name the registry accepts`：那是 DSH「设置 → 插件 → 添加插件」输入框的**规格校验**，跟插件和网络都无关 —— 他把整条命令（或 `add dsh-napcat-keeper` 这种）粘进了只认「包名 / 仓库地址 / 本地目录」的那一栏。桌面版安装目录里根本没有 `dsh` 命令，用户只能走界面，于是把命令行原样贴进去。
- README「安装」改成**先桌面版点界面、再命令行**两条路，并点明那一栏只填 `dsh-napcat-keeper`；「常见问题」再加一条，用表格列清楚哪些写法会被拒（整条命令 / 多出的 `add` / 大写 / 全角标点）。
- 已经在 2.7.0~2.7.2 上装过的，升级到 2.7.3 就行：配置会被自动认领回来，不用手改任何文件。

## 2.7.2 — 根上一点不留
- **修的什么**：2.7.0 的搬迁兜底扫描会跳过「规范老名字」（`napcat-keeper-state.json` 这种已经安排好去处的），本意是别把刚搬完的东西又归一次档。但碰上**目标位已经有同名文件**的情况（新目录里先躺着一份 `state.json`），根上那份老的既搬不走、也不归档，就永远留在 `~/.dsh` 根上了 —— 正是这次要收拾的那种乱。
- 现在兜底扫描不再挑名字：只要还留在根上、名字对得上插件的老命名，一律归档进 `legacy/`；被别的进程攥着搬不动的，下次启动再搬。跑完根上一个不剩。
- 顺带删掉因此没用了的 `CANONICAL_LEGACY` 常量。升级不用改配置。

## 2.7.1 — 搬迁时不留半截副本
- **修的什么**：2.7.0 的自动搬迁里，「rename 失败就复制再删」这两步原先裹在同一个 `try` 里。碰上源文件正被别的进程攥着（比如 QQ 那条 cmd 还在往 `launch.log` 里追加），`copyFileSync` 会成功、`unlinkSync` 会失败 —— 结果目标位落了个**残缺副本**，而且因为「目标已存在就跳过」，以后每次启动都不会再搬它，残缺文件就一直留在那儿。
- 现在两步分开：删不掉源文件就把刚复制的撤掉，返回「没搬成」，下次启动再试一遍。真正搬不动的文件原地不动，不污染新目录。
- 行为没别的变化，升级不用改配置。

## 2.7.0 — 插件自己的文件收进 `~/.dsh/dsh-napcat-keeper/`
- **为什么要动这个**：以前插件产生的东西全都摊在 `~/.dsh` 根上（配置、日志、状态、二维码、生成的 bat/vbs、提权脚本），和 DSH 自己的 `AGENT.md`、`profiles/`、一堆别的插件的文件混在一起，压根看不出哪些是它写的。现在一个目录装完自己的全部家当。
- **新布局**（`~/.dsh/dsh-napcat-keeper/`）：

  | 文件 | 是什么 | 老名字 |
  | --- | --- | --- |
  | `config.json` | 设置页存下来的配置 | `napcat-keeper-config.json` |
  | `keeper.log` | 看门狗自己的日志 | `napcat-keeper.log` |
  | `launch.log` | 拉起 QQ 那一路的输出 | `napcat-keeper-launch.log` |
  | `state.json` | 给人看的运行状态快照 | `napcat-keeper-state.json` |
  | `lock.json` | 跨进程拉起锁 | `napcat-keeper.lock.json` |
  | `qr.png` | 待扫二维码的副本 | `napcat-qr.png` |
  | `env.bat` | 「记住密码」中间层（含密码明文） | `napcat-keeper-env.bat` |
  | `launch.vbs` | 无窗口壳，计划任务调它 | `napcat-keeper-launch.vbs` |
  | `autogen.bat` / `autogen-node.bat` | 自动生成的启动脚本 | `napcat-autogen*.bat` |
  | `setup/` | 提权交接脚本（apply.ps1 等） | `napcat-keeper-setup/` |
  | `legacy/` | 老版本遗留的配置备份等，不参与运行 | —（原来散在根上） |

- **自动搬迁**：`migrateLegacyFiles()` 在启动解析配置时跑一次，能 rename 就 rename（同卷原子），跨卷才退回复制再删；目标已存在时不动旧文件，旧文件自己会落到 `legacy/`。已经搬过就不再重复（按目录记住）。
- **计划任务跟着改**：任务动作里写死的是 `wscript.exe "<vbs>"` 这种绝对路径，文件搬家后指向不存在的脚本 = 开机静默失败。新增 `repairTaskActions()`：只在动作对不上时用 `schtasks /change /tr` 就地改一次，**不 `/end`**，正在跑的 QQ 不会被踢下线。
- **不搬的**：`qq-bridge-state.json` 属于 `dsh-qq-bridge`（我们只是读一下它的时间戳），`profiles/`、`package.json` 属于 DSH 自身，全都留在原地。
- **验证**：`npm run smoke:client` PASS、`selftest:scan` 15/15、`selftest:setup` 45 通过 0 失败、`npm run check`（清单 + 隐私）双绿；真实环境里跑一次搬迁，配置/日志/二维码/中间层全部落到新目录，`napcat_status` 仍在线。
- 版本 2.7.0。

## 2.6.0 — 清死代码 + README 与代码对齐
- **删掉的死代码**（都确认过没有任何调用点，删了行为不变）：
  - v2.2.2 起停用的目录自动探测三件套 `looksLikeShellDir()` / `findShellDirs()` / `detectShellDir()` —— 从那次起 `shellDir` 只认用户在设置页选的，这几个函数只被彼此和调试用的 `__internals` 引用；
  - `napcatRoot(cfg)` —— 只在声明处出现过一次；
  - `__internals` 里同步摘掉 `detectShellDir`。
  合计 `lib/index.js` 从 3332 行降到 3262 行。
- **PowerShell 调用收口**：新增 `psArgs()` / `runPs()` / `runPsSync()` 三个薄封装，原先 7 个调用点各自手抄一份 `['-NoProfile', '-NonInteractive', '-Command', …]`（漏一个参数就难查）。`where`/`tasklist`/`schtasks` 这些非 PowerShell 的调用保持原样。
- **措辞跟现状对齐**：3 处还写着「自动探测」的注释/字段说明改成「在目录里挑」「点分盘扫描找」；`detectLauncher` 的注释原先和函数挤在同一行，拆开。
- **README 统一**（这段是这回发版的主因）：
  - 安装代码块末尾多出的空行去掉；
  - 「真假判定」那段把「可能误判」从括号里拿出来正着说，兼修「一边 → 一遍」；
  - 「多个可能的 shell」标题与正文口径对齐（不再写死「两个目录」）；
  - 计划任务那一栏「留空 = 不用计划任务」语义是反的，改成「留空 = 走 cscript，跟着 DSH 生灭；填了才脱离 DSH」；
  - `npm run check:privacy` 那条命令原先悬空（解释隐私体检的段落被删了），补回一整段说明；
  - 块引用里孤零零一行 `[IO.File]::WriteAllText(...)` 补上引导语；
  - Shell 型自动生成脚本的路径写错（`~/Dsh/…`），改成实际落点 `~/.dsh/napcat-autogen-node.bat`；文件清单同时补上 `napcat-autogen.bat`；
  - 配置表补齐 `hideConsole` / `qrFreshSec` / `heartbeatSec` / `maxQqPerChain` / `maxLogBytes`，并注明路径类字段默认落在 `~/.dsh/`。
- **验证**：`npm run smoke:client` PASS、`selftest:scan` 15/15、`selftest:setup` 45 通过 0 失败、`npm run check`（清单 + 隐私）双绿。
- 版本 2.6.0。

## 2.5.1 — README 按维护者口径重写（只有文档改动）
- **为什么发这一版**：npm 上的 README 是发布那一刻的快照，改 GitHub 不会跟着变 —— 只有发一个新版本号，npm 页面才会重新抓。代码一行没动，纯为了把两个人看的那份对齐。
- **README 改了什么**（作者手改，我照搬）：去掉「从本地目录装」那条只对开发者有意义的路径；分盘扫描的真假判定、多个 shell 并存这两段按实际重装经历改写；快速登录令牌失效时间改成实测的「几小时左右」；记住密码的风险清单删掉 MD5 那句；计划任务两处说明改成「留空 = 不建任务」的说法；开头补了一句吐槽。
- **顺手修的一处**：手填示例路径里的用户名原来写成了一个具体目录名，`check-privacy` 会把它当成真实家目录拦下来，改成占位 `你`。
- 版本 2.5.1。

## 2.5.0 — 统一用 DSH 自带的 Node 运行时
- **为什么改**：以前凡是「要跑一段 JS」的地方，都默认那台机器上装过 node，或者干脆蹭 NapCat / QQ 的私有环境。换台机器、换个装法就哑火 —— 不通用。
- **新增 `resolveNode()`**，顺序固定、结果缓存 60 秒：
  1. 手填的 `nodePath`（设置页「Node 运行时」）；
  2. **DSH 自带**：`<DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe`（DSH_NODE_PATH / DSH_NODE 环境变量也认；插件本身就跑在 node 里时直接用 `process.execPath`）；
  3. 系统 `PATH`（`where node`）；
  4. 常见安装目录（`Program Files\nodejs`、`%LOCALAPPDATA%\Programs\nodejs`）；
  5. NapCat 目录里自带的 `node.exe` 兜底。
- **补上「Shell 型」NapCat**：目录**顶层**有 `napcat.mjs` 的（官方 NapCat.Shell 包那种），现在会用上面这份 node 生成 `~/.dsh/napcat-autogen-node.bat` 去跑 `node napcat.mjs`；以前只认 `NapCatWinBootMain.exe`，遇到 node 型安装直接报「找不到启动脚本」。注入版 `versions\*\resources\app\napcat\napcat.mjs` **不会**被当成入口（那份是等 QQ 注入的，普通 node 跑必崩）。
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
