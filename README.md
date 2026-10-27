# dsh-napcat-keeper

发现没有能够随着 DSH 打开自动启动 NapCat 的插件，遂使用大肥鱼制作此插件，建议搭配[Yuuyuko-uu 的 dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge)使用~

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

**桌面版（点界面的）**：设置 → 插件 → **添加插件**，「包名或地址」那一栏只填包名 ——

```
dsh-napcat-keeper
```

> 只填包名，**别把整条命令粘进去**：那一栏是按「包名 / 仓库地址 / 本地目录」解析的，
> 多一个空格、多一个 `add`、多一个大写字母，就会报 `无法识别这个包名或地址：not a package name the registry accepts`。
> 顺带一提，桌面版装完之后 DSH 目录里并没有 `dsh` 命令，所以下面那条命令行不是人人都能跑 —— 用不了就走上面这条路。

**命令行**：

```bash
dsh plugin --profile <profile> add dsh-napcat-keeper
```

> **别加 `github:` 前缀。** 写成 `add github:waning-sun/dsh-napcat-keeper` 走的是 git 通道，pnpm 会去调外部 `git ls-remote`；
> 机器上没装 Git（或者 Git 不在 PATH 里）就当场报 `'git' is not recognized as an internal or external command`。
> 上面这条是 npm 名安装，全程不碰 git。真踩到了看「常见问题」里 `'git' is not recognized` 那条。

装完重启一次 DSH（第一次装载才生效），然后去 **设置 → napcat桥**。

## 首次配置：其实就三个空

| 填什么 | 说明 |
| --- | --- |
| **NapCat Shell 目录** | 用下面的「分盘扫描」找：NapCat 装哪块盘就点哪块，扫到后点「用这个」直接填进去；也能手填，例如 `C:/Users/你/NapCat/OneKey/NapCat.Shell` |
| **要快登的 QQ 号** | 填了它，插件优先挑「填的这个号」的启动脚本；连脚本都没有时，自动生成一个直接调 `NapCatWinBootMain.exe <号>` 的脚本 |
| **OneBot HTTP 端口** | 跟 NapCat 网络配置里的 httpServers 一致（默认 3000） |

点 **保存设置** → 存到 `~/.dsh/dsh-napcat-keeper/config.json`，立刻热生效。
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
  `⚠ 没看到 versions/QQ.exe/napcat.mjs`，按钮是「仍要用这个」。
  这个判据只是经验值，精简版布局有可能三样都不带（我自己重装了一遍 NapCat 就没这仨，不管了 bro），
  所以「标黄」不等于「不能用」，点「仍要用这个」照样能填进去。
  真 Shell 一律排在前面，不受磁盘遍历顺序影响。
- **为什么会有好几个候选**：OneKey 安装器会先把壳模板解到 `NapCat\OneKey\bootmain`（只有 `NapCatWinBootMain.exe`
  + `napcat.quick.bat`，**没有 QQ 本体**），再把真正的版本装成 `NapCat\<版本>.Shell`（有 `versions/` 和 `QQ.exe`）。
  一次安装可能留下多个目录，只有带 QQ 本体的那个能拉起来。
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
| 中间层 | 写 `env.bat`：把密码塞进环境变量再 call 启动脚本 | 不需要 |
| 计划任务 | 用 `schtasks` 建用户级任务（要不要隐藏黑框跟着设置走） | 不需要 |
| 防火墙放行 | `New-NetFirewallRule` 放行 OneBot 端口入站 | 需要 |

`plan.json` 里存着这次要做的每一步（要写的文件内容以 base64 存 —— **开了「记住密码」时这里面就是那份密码**，
别把这个目录发出去、别丢进同步盘）；`result.json` 是上次跑的结果，`run.log` 是脚本自己记的流水账。
不用管理员就能做完的批次，`apply.ps1` 一条 `admin: true` 都数不到，于是原地跑完、绝不弹 UAC。

## 桌面上那个黑框

cscript / cmd 直接拉 NapCat，会多出一个控制台窗口挂在桌面上。默认行为是**不显示**：
计划任务的动作写的是 `wscript.exe "<DSH 家目录>\dsh-napcat-keeper\launch.vbs"`（绝对路径），这个壳里用
`sh.Run cmd, 0, False` 把真正的 cmd 以隐藏窗口启动（`0` = SW_HIDE）。壳文件用 UTF-16LE 存，中文路径也认。

不想要隐藏就把「拉起时不显示黑框」关掉，任务会退回直接跑 `cmd.exe`；已经跑起来的那条链想收窗口，
点「收起黑框」（`action=hideConsole`）即可。

## 记住密码：默认关，开了要自己认风险

NapCat 的**快速登录令牌会失效**（实测几小时左右），失效后启动脚本只会停在扫码，QQ 就一直离线，
`dsh-qq-bridge` 那边则是刷屏的 `ECONNREFUSED 127.0.0.1:3000`。想让它自己能爬起来，就得给它密码。

设置页「自动登录（可不填）」里勾 **记住密码** 时会先弹一段风险提示，要你自己点「我知道风险，仍然开启」才会生效。开启前请确认你接受这几条：

1. 密码以**明文**存进 `~/.dsh/dsh-napcat-keeper/config.json` 和同目录下插件生成的 `env.bat`，不加密。
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

要是反过来想要「DSH 关了 QQ 还活着」，才去填「计划任务名」那一栏（比如 `NapCat-Keeper-Launch`；**留空 = 走 cscript，跟着 DSH 生灭**）+ 勾「自动创建计划任务」，
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

- **Shell 型**（官方 `NapCat.Shell` 包、目录**顶层**有 `napcat.mjs`）：插件会用上面这份 Node 生成 `~/.dsh/dsh-napcat-keeper/autogen-node.bat` 去跑 `node napcat.mjs` —— 这是 Node 运行时真正派上用场的地方；
- **注入型**（OneKey 那种）：NapCat 跑在 `QQ.exe` 自己的 Node service 里（`--type=utility --utility-sub-type=node.mojom.NodeService`），磁盘上根本没有 `node.exe`，外面的 Node 也替不了它。这条链路插件只负责调 `NapCatWinBootMain.exe`，跟 Node 无关。

> 顺带一提：`versions\*\resources\app\napcat\napcat.mjs` 那份**不会**被当成入口——它是等 QQ 注入用的，拿普通 Node 直接跑必崩。

## 反向 WebSocket：和 dsh-onebot-qq 共存

NapCat 连 OneBot 有两条相反的路：

- **正向（HTTP / 正向 WS）**：NapCat 自己开端口（`httpServers`），外面去问它 —— 本插件默认就是这么看它的；
- **反向 WebSocket**：端口由**别人**开着（比如 `dsh-onebot-qq` 插件起的反向 WS 服务，或者你自己写的服务），**NapCat 反过来连进去**。

第二条路上没有 HTTP 接口可问：拿 HTTP 去敲那个端口，换来的是 `401` / `426`。2.7.3 及更早的版本只看返回内容、不看 HTTP 状态码，于是把「端口明明在回话」当成「端口不通」→ 判卡死 → 杀掉重拉 → 无限循环。现在不会了：

| 探测到的情况 | 插件怎么判 | 会不会重启 |
| --- | --- | --- |
| 能问到 `get_login_info` | 在线（普通 HTTP） | 不会 |
| 端口回 `426`（只收 WebSocket） | **反向 WS 模式** | 不重启；等 NapCat 连进来 |
| 端口回 `401` | 需鉴权（多半是令牌不对） | 不重启，提示你去对 `accessToken` |
| 端口开着、也有客户端连进来 | 在线（反向 WS） | 不会 |
| 端口连不上、进程也不在 | 离线 | 拉起（带退避） |

配置上只要两步：

1. 把 `onebotPort` 填成**反向 WS 服务监听的端口**（不是 NapCat 里那个 `httpServers` 的端口——反向模式下 NapCat 根本不监听）；
2. 「在线探测方式」留 `auto` 就行；想明确指定就选 `反向 WebSocket`。

然后在 NapCat 那边把反向 WS 地址填成 `ws://127.0.0.1:<上面那个端口>`，令牌对上 `accessToken`。

### 装了 dsh-onebot-qq 的，端口可以不用自己填

从 2.8.x 起，本插件会去读 `dsh-onebot-qq` 自己的配置（profile 的 `package.json`、`cordis.patch.yml`/`cordis.yml` 里它那一段），知道它监听哪个端口、是反向还是正向、令牌配没配。于是：

- 你填的 `onebotPort` **能通**，就永远用你的 —— 它不会插嘴；
- 你填的端口**没人听**，而 `dsh-onebot-qq` 正开着反向 WS，就自动改看它那个端口（默认 `8643`），状态条会写「端口 N（跟随 dsh-onebot-qq）」，日志里也会说明「你填的 X 上没有服务，已跟随 Y」；
- 它没挂进 profile（只在 `dependencies` 里、没进 `dsh.profile.bundles`、patch 里也没它）→ 端口根本不会开，这时**不跟**，因为跟了也没用；
- 它是**正向**模式（它自己去连 NapCat，不监听端口）→ 也不跟，照常按你的端口 + `auto` 探；
- 它配了 `accessToken` 但你这边填的不一样 → 设置页「共存插件」那行会标 ⚠ 令牌不一致。

对照开关就是设置页那个「跟随 dsh-onebot-qq」（配置项 `companionFollow`）。它现在**跟着探测结果走**：只有检测到 `dsh-onebot-qq` 装了、并且真挂进 profile（= 已启用）时，这一行才会出现在设置页，且默认开；没装、或者只躺在 `dependencies` 里没挂载（那种情况端口根本不会开），这一行干脆不画，值也按关算 —— 免得上面那句「不跟」全靠猜。你要是自己关过，那就一直按关处理，不会因为它升级/重启又偷偷掰回开。设置页每轮刷新都会重算一遍，所以你中途把它挂上或者摘掉，那一行立刻跟着出现/消失，不用重启 DSH。

> 跟着它看端口的前提是它真的在跑。只装在 `dependencies` 里的，设置页「共存插件」那行会写「已安装但没挂进 profile（「跟随」那个开关不会出现）」，先去 profile 里把它挂上再说。

> 探测全程只用 HTTP + 系统连接表，**不做 WebSocket 握手**：`dsh-onebot-qq` 的反向 WS 是「后来者顶掉前人」的，拿真令牌去握手会把 NapCat 自己那条连接挤掉。

真等不来客户端时，插件也不会每轮都杀进程：先按 `stuckSec`（默认 420 秒）等，超时才**温和重拉**一次，最多两次；还不行就进 `reverse-giveup`，把「该去 NapCat 里改反向 WS 地址」写进日志和状态条，不再折磨那条链。

> 同一个端口没法既当 HTTP 接口又当反向 WS 服务 —— 谁先占着就听谁的。两样都想要，就给它们分两个端口。

### 装了 dsh-qq-bridge 的，插件会替你把端口对一遍

`dsh-onebot-qq` 提供的是**接口**（端口由它开，NapCat 连进去）；`dsh-qq-bridge` 是**客户端**（它反过来拿 HTTP/WS 去连 NapCat，再把消息接到 QQ 聊天里）。两者对端口的要求正好相反，最容易崩的地方就一句话：**桥接里填的 `NapCat` 地址，必须是 NapCat 自己开着的那个 OneBot 端口。**

本插件会顺手读桥接的配置（`~/.dsh/qq-bridge-config.json`，它的配置不在 profile 里、摊在 `~/.dsh` 根上），然后拿自己看到的实际情况跟它比一比，结论写在设置页「桥接插件」那行：

| 看到的情况 | 结论 |
| --- | --- |
| 只在 `dependencies` 里、没进 `dsh.profile.bundles` | **装了但没挂进 profile** —— 桥接根本没跑 |
| 桥接指向的就是那个**反向 WS** 端口 | **连的是反向 WS 端口** —— 那里只收 WebSocket 握手，HTTP 客户端敲过去必然 426/401 |
| 桥接端口 ≠ 本插件看到的 OneBot 端口 | **端口对不上** —— 消息发不出去 |
| 桥接「总开关」是关的 | 在跑，但一句都不发 |
| 桥接开着「试运行」 | 只记账，不真发到 QQ |
| 以上都对得上 | 不吭声（对得上就没什么可说的） |

这层检查只看**配置**，不碰桥接的进程、不改它的文件，纯提示。想让它真发消息，还是得去桥接自己的设置页把总开关打开、把地址填对。

> 典型的踩坑组合：`dsh-onebot-qq` 开着反向 WS 占着 `8643`，桥接的 `NapCat` 又填成 `http://127.0.0.1:8643` —— 看着「端口明明通」，桥接就是一直不动。给 NapCat 另开一个 `httpServers` 端口（比如 `3000`）让桥接连，两边就都活了。

## 给 agent 用的三个工具

| 工具 | 作用 |
| --- | --- |
| `napcat_status` | 端口/登录态、进程链、二维码副本路径、桥接心跳、日志尾部，以及两个共存插件的状态（`dsh-onebot-qq` 装了没/挂了没/端口模式/令牌一致不，`dsh-qq-bridge` 装了没/挂了没/桥接端口对不对） |
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
| `onebotPort` | `3000` | OneBot 端口。普通部署填 NapCat 里 `httpServers` 的端口；反向 WebSocket 部署填**反向 WS 服务**监听的端口 |
| `accessToken` | 空 | OneBot access token（跟 NapCat 或反向 WS 服务里填的一致） |
| `probeMode` | `auto` | 在线探测方式：`auto` 先按 HTTP 问、问不通再看是不是反向 WS；`http` 只认 HTTP 接口；`reverse` 只认反向 WebSocket；`process` 只看进程不碰端口 |
| `companionFollow` | `true` | 你填的端口不通时，是否跟随 `dsh-onebot-qq` 配的反向 WS 端口（详见「反向 WebSocket」那节）；你自己填的端口一通，它就绝不插手。**这一项只在检测到 `dsh-onebot-qq` 装了且挂进 profile 时才出现、才默认开**，否则设置页不显示、值按关算 |
| `taskName` | 空（= 用 cscript，QQ 跟着 DSH 生灭） | 想脱离 DSH 才填计划任务名 |
| `autoCreateTask` | `false` | 填了 `taskName` 且任务不存在时自动创建 |
| `hideConsole` | `true` | 拉起时不显示黑框（用 wscript 壳藏窗口） |
| `probeIntervalSec` | `45` | 复查间隔 |
| `launchGraceSec` | `150` | 拉起后的宽限期 |
| `qrFreshSec` | `300` | 二维码新鲜度窗口：比这新 = 还在等人扫 |
| `scanTimeoutSec` | `300` | 扫码等待上限 |
| `maxScanRetries` | `2` | 扫码重试上限 |
| `stuckSec` | `420` | 卡死判定 |
| `heartbeatSec` | `600` | 一切正常时的心跳日志间隔 |
| `chainGapSec` | `120` | 重复链判定窗口 |
| `maxQqPerChain` | `4` | 单条链该有几条 `QQ.exe`，判重时的参考值 |
| `procPathMatch` | 空（由 shellDir 推两层） | 只在这个路径前缀下找 QQ/NapCat 进程 |
| `bridgeStaleSec` | `180` | `dsh-qq-bridge` 的 state 多久没更新就警告 |
| `maxLogBytes` | `1048576` | 日志超这么多字节就滚动一次 |

剩下几个是路径类字段（`configPath` / `logPath` / `launcherLog` / `lockPath` / `statePath` / `qrCopyPath` / `bridgeStatePath`），默认都落在 `~/.dsh/dsh-napcat-keeper/` 下（`bridgeStatePath` 例外，那是 `dsh-qq-bridge` 的文件，留在 `~/.dsh/` 根上），一般不用碰。

## 文件都在哪

插件产生的东西全在 `~/.dsh/dsh-napcat-keeper/` 一个目录里，DSH 自己的目录不会被它塞满：

```
~/.dsh/dsh-napcat-keeper/
├── config.json         设置页保存的配置
├── keeper.log          看门狗日志（超 1MB 自动滚动）
├── launch.log          启动脚本的原始输出（扫码提示都在这）
├── state.json          每轮 tick 的状态快照
├── lock.json           跨进程拉起锁（防两个 DSH 同时拉）
├── qr.png              最近一张二维码副本（扫码时更新）
├── env.bat             只在「记住密码」开启时生成：把密码塞进环境变量给启动脚本
├── launch.vbs          「自动创建计划任务」时生成的无窗口壳，计划任务调它
├── autogen-node.bat    Shell 型专用：拿 DSH 自带的 node 跑 napcat.mjs
├── autogen.bat         没现成启动脚本时生成：直接调 NapCatWinBootMain.exe
├── setup/              提权交接目录：plan.json / apply.ps1 / apply-admin.cmd
│                       / undo-admin.cmd / result.json / run.log / README.txt
└── legacy/             老版本遗留的配置备份等，不参与运行，整个删掉也没事
```

- `env.bat` 只在「记住密码」开启时才有；两份 `autogen*.bat` 只在需要时出现（每次拉起前按当前配置重写，删掉也会自己长回来）。整个目录删掉 = 插件回到没配置过的状态。
- **从老版本升上来（< 2.7.0）**：第一次启动会自动把原来散在 `~/.dsh` 根上的文件搬进这个目录（`napcat-keeper-config.json` → `config.json` 这种），改名一次就固定；计划任务里写死的旧路径也会一并改指新位置 —— 那一步用 `schtasks /change` 就地改，不结束正在跑的 QQ。老备份、以及搬不动的老文件（目标位已经有同名的那份、或者正被别的进程占着）都归到 `legacy/`，`~/.dsh` 根上不会留东西；实在被占着搬不动的，下次启动再搬一次。
- `~/.dsh/qq-bridge-state.json` **不在**这个目录里，也不归这个插件：它由 `dsh-qq-bridge` 写，插件只是读一下它的时间戳，判断那边轮询还活着没有。

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

**隐私体检**是发版前那道闸：把包里所有文本文件过一遍，找 Windows / Unix 家目录路径、邮箱、`ghp_` / `npm_` / `sk-` / `AKIA` 这类凭证、`Bearer` 后面的真串、DSH 会话 id，以及自测里那种 `launchAccount: '1234567890'` 的真实 QQ 号。命中就按 `文件:行` 列出来并返回非 0；确实是文档里必须留的示例，在那行末尾写 `check-privacy:ignore` 放过。占位写法（`C:/Users/你/…`、`C:/Users/x/…`）本来就放行。

另外几个自测，都不依赖本机路径，clone 下来就能跑：`npm run smoke:client`（把 `lib/client.js` 塞进假 React 渲染一遍）、`npm run selftest:scan`（造假树验扫盘判定）、`npm run selftest:save`（保存真的落到插件目录、误写的那份被认领回来）、`npm run selftest:probe`（本地起假服务器，验普通 HTTP / 反向 WS / 需要鉴权 / 端口没开四种判定）、`npm run selftest:companion`（造假 profile 与桥接配置，验 `dsh-onebot-qq` 的端口跟随和 `dsh-qq-bridge` 的交叉结论）、`npm run selftest:setup`（临时目录里真跑一遍 apply / 重跑 / undo）。

> **改这个插件的文件的规矩**：别用 `Get-Content` 读、`Set-Content -Encoding utf8` 写 —— PowerShell 5.1 会按 ANSI 读、再按 UTF-8 写，一趟往返中文全变乱码，BOM 还照写。用编辑器另存为「UTF-8 无 BOM」；非要脚本写，就走
> `[IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($false)))`。

## 常见问题

**「离线」但进程明明还在？**
端口没通。看 `~/.dsh/dsh-napcat-keeper/launch.log`，多半是卡在扫码，或者 QQ 弹了验证窗。

**刚关掉 DSH，QQ 就跟着退了？**
正常，默认就是这样：QQ 挂在 DSH 下面，DSH 一走它就走。下次开 DSH 会重新拉一条。
想反过来（DSH 关了 NapCat 还活着）去填「计划任务名」+ 勾「自动创建计划任务」。

**两个 QQ 客户端互相踢？**
去重会兜住，但根因通常是有人又点了一次 `napcat.bat`。点「去重复链」立刻收敛。

**换端口了？**
改「OneBot HTTP 端口」保存即可；如果同时换了 Shell 目录，跨进程锁会自动清掉。

**用着 dsh-onebot-qq（反向 WebSocket），插件永远显示离线、进程反复重启？**
2.7.3 及更早的版本只会用 HTTP 去问 `get_login_info`，而反向 WS 的端口不吃 HTTP（回 `401` / `426`），
于是被当成「端口不通」→ 判卡死 → 杀掉重拉，一轮一轮地折腾。
现在的版本认这条路：端口回 426 就判成**反向 WS 模式**，改成看「端口上有没有客户端连进来」，
进程在 + 端口有服务时**不再杀**。设置上只要把「OneBot HTTP 端口」改成反向 WS 服务监听的端口，
「在线探测方式」留 `auto`（或直接选「反向 WebSocket」），细节见前面「反向 WebSocket：和 dsh-onebot-qq 共存」那节。
状态条里会显示 `探测：反向 WebSocket · 客户端 N`，卡住时给的提示也是「去 NapCat 里把反向 WS 地址填成 `ws://127.0.0.1:<端口>`」。

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

**装的时候报 `'git' is not recognized as an internal or external command`？**
不是插件的问题。那句是 pnpm 在解析 **git 规格的依赖**（`github:owner/repo`、`git+https://…`）时调的外部 `git`；
DSH 自带的 pnpm 不捎带 git，Windows 上又默认没装，于是就卡在「拉代码」这一步，插件一个字节都还没下载。
包里的 `lib/` 本来就是入库的、没有构建步骤，所以跟「源码要编译」也没关系。三条路，越靠前越省事：

1. **用 npm 名装** —— 就是上面「安装」那节那条命令，全程不碰 git。
2. **装 Git**：`winget install --id Git.Git -e`，或者从 [git-scm.com](https://git-scm.com/download/win) 下安装包。
   装完 **必须彻底退出 DSH 再重开**：pnpm 是 DSH 的子进程，继承的是 DSH 启动那一刻的 PATH，
   不重启会继续报一模一样的错（很多人以为白装了）。重开后在新的终端里 `git --version` 有输出，再去装插件。
3. **不装 git、又非要从 GitHub 拉**：改用源码 tarball，pnpm 走 HTTPS 下载、不调 git ——
   `dsh plugin --profile <profile> add https://codeload.github.com/waning-sun/dsh-napcat-keeper/tar.gz/refs/heads/main`
   仓库目前没打 tag，所以只能指 `refs/heads/main`；缺点是版本号只能读包里的 `package.json`，也不跟着发版更新。

**装的时候报 `无法识别这个包名或地址：not a package name the registry accepts`？**
这句是 DSH 在**解析你填的那串字**，还没到下载那一步 —— 跟插件、跟网络都没关系。它是「设置 → 插件 → 添加插件」
那个输入框的校验：那一栏认三种东西，**npm 包名**（`dsh-napcat-keeper`、`@作者/名字`）、**仓库地址**（`https://github.com/…`）、
**本地目录**。包名只允许小写字母、数字和 `. _ ~ -`，所以下面这些写法一律被拒：

| 填进去的 | 结果 |
| --- | --- |
| `dsh-napcat-keeper` | ✅ |
| `dsh-napcat-keeper@2.8.1` | ✅（指定版本） |
| `dsh plugin --profile desktop add dsh-napcat-keeper` | ❌ 整条命令 |
| `add dsh-napcat-keeper` | ❌ 多了 `add` |
| `Dsh-napcat-keeper` | ❌ 大写 |
| `dsh-napcat-keeper。`、`dsh-napcat-keeper；` | ❌ 全角标点 |

改法就一句：**那一栏只填 `dsh-napcat-keeper`**（要指定版本就 `dsh-napcat-keeper@2.8.1`）。想跑命令行的话，得在终端里跑，
不是在输入框里跑。

## License

MIT
