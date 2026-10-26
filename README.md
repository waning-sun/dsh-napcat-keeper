# dsh-napcat-keeper

发现没有能够随着dsh打开自动启动napcat的插件，遂使用大肥鱼制作此插件，建议搭配[Yuuyuko-uu 的 dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge)使用~

给 [NapCat](https://napneko.github.io/)（QQ 协议端）配一个看门狗：**DSH 在，QQ 就在**。

端口不通就拉起来，进程重复就杀掉多余的，卡在扫码就重来，扫完码以后又掉线也会自己恢复。
所有需要人填的东西都在 **DSH → 设置 → napcat桥** 一个页面里，保存即生效，不用重启。

> 常配套 `dsh-qq-bridge`（把 QQ 和 DSH 会话接通）：那个负责「说话」，这个负责「别掉线」。
> 也可以单独用——只要你想让 NapCat 一直活着。


声明：基本纯让我家大肥鱼跑的，内容我只粗略检查了一下，本人也只是个半吊子学生，有隐性bug大概率也看不出来，这GitHub我也第一次用，之前光下别的大佬的好东西了，有大佬愿意的话欢迎随时指点我、提建议等等都行，爱你♥️

吐槽：这傻鱼写的啥readme啊，我得自己改一下。

---

## 它到底管什么

| 情况 | 看门狗怎么做 |
| --- | --- |
| OneBot 端口不通、也没有 NapCat 进程 | 拉起来（默认 cscript；只有填了计划任务名才走任务） |
| 刚拉起、端口还没通 | 给宽限期（默认 150s），期间不重复拉 |
| 拉到一半卡在扫码 | 记一笔 `need-scan`；超过 `scanTimeoutSec` 就杀掉重来，重试 `maxScanRetries` 次后放弃并写日志 |
| 有两条 QQ 进程链（客户端互踢的根源） | 按启动时间聚类判重，只杀晚出现的那几条，保留正在服务的那条 |
| 进程在、端口不通、也没有任何新信号 | 判为卡死，杀掉重来 |
| 一切正常 | 只记心跳（默认 10 分钟一行），并顺手检查 `dsh-qq-bridge` 的轮询是否还新鲜 |

看门狗自己不会把 DSH 启动搞崩：外部调用都有超时、异常都吞掉写日志、跨进程还有一把锁防止两个 DSH 实例同时拉。

## 前置：先把 NapCat 装好

1. 装 [NapCat.Shell](https://github.com/NapNeko/NapCatQQ/releases)（Windows 有一键安装包，会顺带装 QQ）。
2. 打开 NapCat 的 WebUI → **网络配置** → 加一个 **HTTP 服务器**：
   - host `127.0.0.1`，port `3000`（或你喜欢的端口）
   - 需要的话设一个 token，记下来
3. 手动跑一次、扫码登录一次（之后有登录缓存就不用再扫，缓存时限在几十分钟左右吧）。

## 安装

```bash
# 从 npm 装
dsh plugin --profile <profile> add dsh-napcat-keeper

```

装完重启一次 DSH（第一次装载才生效），然后去 **设置 → napcat桥**。

## 首次配置：其实就三个空

| 填什么 | 说明 |
| --- | --- |
| **NapCat Shell 目录** | 用下面的「分盘扫描」找：napcat装哪块盘就点哪块，扫到后点「用这个」直接填进去；也能手填，例如 `C:/Users/NapCat/OneKey/NapCat.Shell` |
| **要快登的 QQ 号** | 填了它，插件优先挑「填的这个号」的启动脚本；连脚本都没有时，自动生成一个直接调 `NapCatWinBootMain.exe <号>` 的脚本 |
| **OneBot HTTP 端口** | 跟 NapCat 网络配置里的 httpServers 一致（默认 3000） |

点 **保存设置** → 存到 `~/.dsh/napcat-keeper-config.json`，立刻热生效。
回「状态」看：在线会显示昵称和 QQ 号；离线就点「拉起 NapCat」。

## 分盘扫描：装在哪都能找到

从 2.2.2 起插件**不再自己猜** NapCat 装在哪：`shellDir` 留空就是空，不会悄悄填一个可能填错的目录。
设置页第一组是 **分盘扫描**，目录由你来选：

- 本机有几块盘就列几个按钮（盘符取自系统 `DriveInfo`，光驱、移动盘、上锁的卷都会列），点哪个扫哪个；
  有「全部盘（慢）」；扫的时候可以点「停止」；插了新盘点「重新读盘」，不用重启 DSH。
- 扫描会跳过 `Windows`、回收站、`System Volume Information`、`node_modules`、`Temp` 这类目录，
  深度上限 7 层，单盘最多看 25 万个目录、最多 90 秒（全部盘时每盘 45 秒）。
- 命中判据：目录名带 `napcat`，或目录里有 `NapCatWinBootMain.exe`，且带有 `.bat` 启动脚本。
  命中后不再往它下面钻（QQ 目录里几千个文件，钻进去只会变慢）。
- **命中之后再分真假**：目录里只要有 `versions/`、`QQ.exe`、`napcat.mjs` 里的任意一样，就是**真 Shell**
  （标绿 `✓ 像真 Shell：versions/ · QQ.exe`，按钮「用这个」）；三样都没有的标黄
  `⚠ 没看到 versions/QQ.exe/napcat.mjs`，按钮是「仍要用这个」（肥鱼说精简版布局可能没有这三样，但我自己重装了一边napcat就没这仨了，不管了bro）。
  真 Shell 一律排在前面，不受磁盘遍历顺序影响。
- **为什么会有多个可能的shell**：OneKey 安装器会先把壳模板解到 `NapCat\OneKey\bootmain`（只有 `NapCatWinBootMain.exe`
  + `napcat.quick.bat`，**没有 QQ 本体**），再把真正的版本装成 `NapCat\<版本>.Shell`（有 `versions/` 和 `QQ.exe`）。
  一次安装留下两个目录，只有后者能拉起来。
- 每命中一条就列一行：路径、挑出来的启动脚本、是否含 `NapCatWinBootMain.exe`、真假判定，右边按钮一键填入。
- 到时间/到数量上限会明确写「结果可能不全」，不会闷头扫一小时。

## 页面上的按钮

| 按钮 | 作用 |
| --- | --- |
| 扫 C: / 扫 D: … | 分盘深扫（深度 7 层，跳过系统目录，单盘 90 秒），边扫边报进度，命中就列出来 |
| 重新读盘 | 立刻重新问系统要盘符（插了移动盘 / 映射了网络盘之后点，不用重启 DSH） |
| 全部盘（慢） | 把本机每块盘都扫一遍（每盘 45 秒预算），装在冷门位置时用这个 |
| 用这个 | 在扫描结果里点：直接把这个目录存成 `shellDir`，并重新挑启动脚本 |
| 重新探活 | 立刻跑一轮 tick（探端口 + 探进程）；跟「找 NapCat 目录」无关 |
| 拉起 NapCat | 手动下达拉起指令 |
| 杀掉重拉 | 干净地杀掉整条链再拉一条（杀不干净就不拉，避免互踢） |
| 去重复链 | 只杀掉晚出现的那几条链，保留最早那条 |
| 建计划任务 | 现在就把计划任务建好（用户级，不需要管理员） |
| 收起黑框 | 把已经在跑的控制台窗口藏起来（不用重启 QQ） |
| 全部杀掉 | 只杀，不拉 |
| 生成脚本并打开文件夹 | 把勾好的「需要你点一下的脚本」写成 `apply.ps1` + 双击入口，同时弹资源管理器选中它 |
| 打开文件夹 | 只打开那个目录（脚本已经生成过时用，不用重新生成一遍） |
| 读结果 | 读回 `result.json`：上次跑成没成、哪一步失败、用没用上管理员 |

## 要动系统的部分：交给你点一下的脚本

DSH 自己是普通权限。插件要碰「装系统的位置」（往防火墙加规则、往别人的目录里写启动脚本……）时，
它不去偷偷提权，也不要你「以管理员身份重启 DSH」，而是把要做的事**写成一份脚本交给你**：

1. 设置页「需要你点一下的脚本」里勾上要做的事 → 点 **生成脚本并打开文件夹**；
2. 资源管理器会跳出来并选中 `apply-admin.cmd`，双击它；
3. 里面若含管理员步骤，会弹一次 UAC —— **那个「是」就是你自己按的确认键**；一条都不含就直接跑完，不弹任何窗；
4. 回面板点 **读结果**，逐条显示成没成、为什么没成；
5. 想全撤，双击同目录的 `undo-admin.cmd`。

可勾的四件事：

| 事 | 会做什么 | 要不要管理员 |
| --- | --- | --- |
| 自动启动脚本 | 在 `shellDir` 里补一个 `napcat.quick.auto.bat`（写死账号和 `NapCatWinBootMain.exe` 路径） | 看那个目录你能不能写，不能写才需要 |
| 中间层 | 写 `napcat-keeper-env.bat`：把密码塞进环境变量再 call 启动脚本 | 不需要 |
| 计划任务 | 用 `schtasks` 建用户级任务（要不要隐藏黑框跟着设置走） | 不需要 |
| 防火墙放行 | `New-NetFirewallRule` 放行 OneBot 端口入站 | 需要 |

`plan.json` 里存着这次要做的每一步（要写的文件内容以 base64 存 —— **开了「记住密码」时这里面就是那份密码**，
别把这个目录发出去、别丢进同步盘）；`result.json` 是上次跑的结果，`run.log` 是脚本自己记的流水账。
不用管理员就能做完的批次，`apply.ps1` 一条 `admin: true` 都数不到，于是原地跑完、绝不弹 UAC。

## 桌面上那个黑框

cscript / cmd 直接拉 NapCat，会多出一个控制台窗口挂在桌面上。默认行为是**不显示**：
计划任务的动作写的是 `wscript.exe "<dsh家目录>\napcat-keeper-launch.vbs"`，这个壳里用
`sh.Run cmd, 0, False` 把真正的 cmd 以隐藏窗口启动（`0` = SW_HIDE）。壳文件用 UTF-16LE 存，中文路径也认。

不想要隐藏就把「拉起时不显示黑框」关掉，任务会退回直接跑 `cmd.exe`；已经跑起来的那条链想收窗口，
点「收起黑框」（`action=hideConsole`）即可。

## 记住密码：默认关，开了要自己认风险

NapCat 的**快速登录令牌会失效**（实测几小时左右），失效后启动脚本只会停在扫码，QQ 就一直离线，
`dsh-qq-bridge` 那边则是刷屏的 `ECONNREFUSED 127.0.0.1:3000`。想让它自己能爬起来，就得给它密码。

设置页「自动登录（可不填）」里勾 **记住密码** 时会先弹一段风险提示，要你自己点「我知道风险，仍然开启」才会生效。开启前请确认你接受这几条：

1. 密码以**明文**存进 `~/.dsh/napcat-keeper-config.json` 和插件生成的 `napcat-keeper-env.bat`，不加密。
2. 任何能读你用户目录的程序都能捡走：同步盘、备份工具、其它软件、远控、临时借电脑的人。
3. QQ 密码往往和 QQ 邮箱、部分游戏、微信登录入口共用一套身份，泄漏面不止一个号。
4. 插件不打印密码，`/state` 也只回「存没存 + 长度」，但那只是少开一个口子，不等于安全。
5. 随时可以点「清除密码」收回，配置和 bat 里的密码会被删掉。

密码不写成命令行参数（`NapCatWinBootMain.exe <号> <密码>` 那样会进进程列表和 Windows 事件日志），
而是走环境变量 `NAPCAT_QUICK_PASSWORD` / `NAPCAT_QUICK_PASSWORD_MD5`，且只有本机 `127.0.0.1:3000` 回连时才注入。

## 拉起方式：默认跟着 DSH 生灭

这个插件的用途就一句话：**DSH 起来以后，把 QQ 接上**。所以默认用 `cscript` 直接拉，
QQ 那条进程链挂在本 DSH 实例下面——DSH 开着它就在，DSH 关掉它就跟着走，下次开 DSH 再拉一条新的。

「刚重启 DSH，QQ 就掉了」不是毛病，是这个默认行为：新实例会自己重新拉起，扫不上就自动密码登录。

要是反过来想要「DSH 关了 QQ 还活着」，才去填「计划任务名」（比如 `NapCat-Keeper-Launch` 留空 = 不用计划任务）+ 勾「自动创建计划任务」，
那时插件改用 `schtasks /run` 拉，父进程是任务计划服务，DSH 重启牵连不到它。

## 用哪份 Node：默认借 DSH 自带的

插件要跑一段 JS 时才需要 Node，取的顺序是（找到第一个能用的就停）：

1. 设置页里手填的 `nodePath`；
2. **DSH 自带**：`<DSH NEXT>\resources\runtime\<arch>\primary-runtime\dependencies\node\bin\node.exe`（`DSH_NODE_PATH` / `DSH_NODE` 环境变量也认）；
3. 系统 `PATH` 里的 `node`；
4. 常见安装目录（`Program Files\nodejs`、`%LOCALAPPDATA%\Programs\nodejs`）；
5. NapCat 目录里附带的 `node.exe` 兜底。

所以正常情况下**不用装 Node、也不用管版本**，跟着 DSH 走就行。状态条里会直接写着用的是哪一份、什么版本；设置页有「测一下 node」按钮可以当场验一次。

两种 NapCat 装法的区别：

- **Shell 型**（官方 `NapCat.Shell` 包、目录**顶层**有 `napcat.mjs`）：插件会用上面这份 Node 生成 `~/Dsh/napcat-autogen-node.bat` 去跑 `node napcat.mjs` —— 这是 Node 运行时真正派上用场的地方；
- **注入型**（OneKey 那种）：NapCat 跑在 `QQ.exe` 自己的 Node service 里（`--type=utility --utility-sub-type=node.mojom.NodeService`），磁盘上根本没有 `node.exe`，外面的 Node 也替不了它。这条链路插件只负责调 `NapCatWinBootMain.exe`，跟 Node 无关。

> 顺带一提：`versions\*\resources\app\napcat\napcat.mjs` 那份**不会**被当成入口——它是等 QQ 注入用的，拿普通 Node 直接跑必崩。

## 给 agent 用的三个工具

| 工具 | 作用 |
| --- | --- |
| `napcat_status` | 端口/登录态、进程链、二维码副本路径、桥接心跳、日志尾部 |
| `napcat_restart` | 干净地杀掉整条链并重拉，然后等它上线 |
| `napcat_dedupe` | 只在真有重复链时才杀（没重复就什么都不做） |

## 配置项

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `true` | 总开关；关掉只保留状态观察，不自动拉也不自动杀 |
| `shellDir` | 空（只认人选） | NapCat Shell 目录（启动脚本所在目录）；留空就表示还没选，插件不会替你猜 |
| `launcherScript` | 空（由 shellDir 找） | 启动脚本名或绝对路径 |
| `launchAccount` | 空 | 想快登的 QQ 号 |
| `launchArgs` | 空 | 追加给启动脚本的参数 |
| `nodePath` | 空（自动） | 指定 `node.exe`；留空按「DSH 自带 → 系统 PATH → 常见安装目录 → NapCat 目录」找，见上一节 |
| `rememberPassword` | `false` | 记住 QQ 密码、令牌失效时自动密码登录（**明文落盘，详见上节**） |
| `quickPassword` | 空 | QQ 密码；只在保存时写入，接口不回显、日志不打印 |
| `onebotPort` | `3000` | OneBot 11 HTTP 端口 |
| `accessToken` | 空 | OneBot access token |
| `taskName` | 空（= 用 cscript，QQ 跟着 DSH 生灭） | 想脱离 DSH 才填计划任务名 |
| `autoCreateTask` | `false` | 填了 `taskName` 且任务不存在时自动创建 |
| `probeIntervalSec` | `45` | 复查间隔 |
| `launchGraceSec` | `150` | 拉起后的宽限期 |
| `scanTimeoutSec` | `300` | 扫码等待上限 |
| `maxScanRetries` | `2` | 扫码重试上限 |
| `stuckSec` | `420` | 卡死判定 |
| `chainGapSec` | `120` | 重复链判定窗口 |
| `procPathMatch` | 空（由 shellDir 推两层） | 只在这个路径前缀下找 QQ/NapCat 进程 |
| `bridgeStaleSec` | `180` | `qq-bridge` 的 state 多久没更新就警告 |

## 文件都在哪

```
~/.dsh/napcat-keeper.log           看门狗日志（超 1MB 自动滚动）
~/.dsh/napcat-keeper-launch.log    启动脚本的原始输出（扫码提示都在这）
~/.dsh/napcat-keeper-config.json   设置页保存的配置
~/.dsh/napcat-keeper-env.bat       只在「记住密码」开启时生成：把密码塞进环境变量给启动脚本
~/.dsh/napcat-keeper-state.json    每轮 tick 的状态快照
~/.dsh/napcat-qr.png               最近一张二维码副本（扫码时会更新）
~/.dsh/napcat-keeper-setup/        提权交接目录：plan.json / apply.ps1 / apply-admin.cmd
                                   / undo-admin.cmd / result.json / run.log / README.txt
```

## 出事了先跑体检：`npm run check`

插件整个没加载、DSH 日志里连一个字都不提它、QQ 掉线后再没人拉起来 —— 十有八九是 `package.json` 被动过：BOM、双重编码乱码、或者 JSON 语法坏掉。清单读不动，DSH 连插件代码都不会 import，看门狗自然一起消失。

`npm run check` 是两道体检，一次跑完：

```bash
npm run check                      # 清单体检 + 隐私体检
npm run check:manifest             # 只查清单
npm run check:manifest -- --fix    # 顺手抹掉 BOM（只动 BOM，不动内容）
npm run check:privacy              # 只查隐私（发版前必跑）
```

**清单体检**查这几样：清单能不能 `JSON.parse`、有没有 BOM、是不是合法 UTF-8、有没有出现「鐔欑殑澶ц偉楸」这种双重编码乱码、入口文件在不在、清单版本和 `lib/index.js` 里的 `export const version` 同不同步。JSON 坏掉时直接告诉你第几行第几列，并用 `^` 指到那个字符上（位置 899 那种报错不用再数换行）。

另外三个自测：`npm run smoke:client`（把 `lib/client.js` 塞进假 React 渲染一遍）、`npm run selftest:scan`（造假树验扫盘判定）、`npm run selftest:setup`（临时目录里真跑一遍 apply / 重跑 / undo）。都不依赖本机路径，clone 下来就能跑。

> **改这个插件的文件的规矩**：别用 `Get-Content` 读、`Set-Content -Encoding utf8` 写 —— PowerShell 5.1 会按 ANSI 读、再按 UTF-8 写，一趟往返中文全变乱码，BOM 还照写。用编辑器另存为「UTF-8 无 BOM」。
> `[IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`。

## 常见问题

**「离线」但进程明明还在？**
端口没通。看 `napcat-keeper-launch.log`多半是卡在扫码，或者 QQ 弹了验证窗。

**刚关掉 DSH，QQ 就跟着退了？**
正常，默认就是这样：QQ 挂在 DSH 下面，DSH 一走它就走。下次开 DSH 会重新拉一条。
想反过来（DSH 关了napcat还活着）去填「计划任务名」+ 勾「自动创建计划任务」。

**两个 QQ 客户端互相踢？**
去重会兜住，但根因通常是有人又点了一次 `napcat.bat`。点「去重复链」立刻收敛。

**换端口了？**
改「OneBot HTTP 端口」保存即可；如果同时换了 Shell 目录，跨进程锁会自动清掉。

**老是掉线、每次都要扫码？**
令牌过期了。要么每次手机扫，要么开「记住密码」让它自己用密码登（先看上上节的风险）。
`napcat_status` 会直接告诉你现在是 `password` 还是 `token` 在撑、以及密码文件在不在。

**密码改成带特殊字符的行不行？**
行。`%` 会写成 `%%`（bat 里转义）、`"` 会被去掉，中文路径和中文密码也认。

**能在 Linux / macOS 上用吗？**
看门狗本身是 node 实现，但「进程路径探测 / 计划任务 / cscript」这几处是为 Windows 写的；其它平台目前只保证「探端口 + 判活」。

**设置页点开一片空白，连别的插件设置也不见了？**
2.2.1 之前是 `settings.section` 钩子签名对不上新版 DSH（抛 `Cannot add property N, object is not extensible`），异常冒到设置面板层，整个面板一起白。升级后重开 DSH 即可。
另外设置页会轮询 `/state`，2.2.1 起热路径有 300 秒进程快照缓存，不再每次都新起 PowerShell；如果你自己写脚本调这个接口，加 `?light=1` 只读缓存、不扫描进程。

## License

MIT
