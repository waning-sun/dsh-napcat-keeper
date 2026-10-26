# dsh-napcat-keeper

发现没有能够随着dsh打开自动启动napcat的插件，遂使用大肥鱼制作此插件，建议搭配[Yuuyuko-uu 的 dsh-qq-bridge](https://github.com/Yuuyuko-uu/dsh-qq-bridge)使用~

给 [NapCat](https://napneko.github.io/)（QQ 协议端）配一个看门狗：**DSH 在，QQ 就在**。

端口不通就拉起来，进程重复就杀掉多余的，卡在扫码就重来，扫完码以后又掉线也会自己恢复。
所有需要人填的东西都在 **DSH → 设置 → napcat桥** 一个页面里，保存即生效，不用重启。

> 常配套 `dsh-qq-bridge`（把 QQ 和 DSH 会话接通）：那个负责「说话」，这个负责「别掉线」。
> 也可以单独用——只要你想让 NapCat 一直活着。


声明：基本纯让我家大肥鱼跑的，内容我只粗略检查了一下，本人也只是个半吊子学生，有隐性bug大概率也看不出来，这GitHub我也第一次用，之前光下别的大佬的好东西了，有大佬愿意的话欢迎随时指点我、提建议等等都行，爱你♥️

---

## 它到底管什么

| 情况 | 看门狗怎么做 |
| --- | --- |
| OneBot 端口不通、也没有 NapCat 进程 | 拉起来（优先走计划任务，其次 cscript） |
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
3. 手动跑一次、扫码登录一次（之后有登录缓存就不用再扫）。

## 安装

```bash
# 从 npm 装（发布后）
dsh plugin --profile <profile> add dsh-napcat-keeper

# 或从本地目录装（开发时）
dsh plugin --profile <profile> add C:\path\to\dsh-napcat-keeper
```

装完重启一次 DSH（第一次装载才生效），然后去 **设置 → napcat桥**。

## 首次配置：其实就三个空

| 填什么 | 说明 |
| --- | --- |
| **NapCat Shell 目录** | 点旁边的「自动探测」多半就填好了；也可手填，例如 `C:/Users/你/NapCat/OneKey/NapCat.<版本>.Shell` |
| **要快登的 QQ 号** | 填了它，插件优先挑「写死了这个号」的启动脚本；连脚本都没有时，自动生成一个直接调 `NapCatWinBootMain.exe <号>` 的脚本 |
| **OneBot HTTP 端口** | 跟 NapCat 网络配置里的 httpServers 一致（默认 3000） |

点 **保存设置** → 存到 `~/.dsh/napcat-keeper-config.json`，立刻热生效。
回「状态」看：在线会显示昵称和 QQ 号；离线就点「拉起 NapCat」。

## 页面上的按钮

| 按钮 | 作用 |
| --- | --- |
| 自动探测 | 扫常见位置找 NapCat Shell 目录，找到就填进输入框（尚未保存） |
| 重新探测 | 立刻跑一轮 tick（探端口 + 探进程） |
| 拉起 NapCat | 手动下达拉起指令 |
| 杀掉重拉 | 干净地杀掉整条链再拉一条（杀不干净就不拉，避免互踢） |
| 去重复链 | 只杀掉晚出现的那几条链，保留最早那条 |
| 建计划任务 | 现在就把计划任务建好（用户级，不需要管理员） |
| 收起黑框 | 把已经在跑的控制台窗口藏起来（不用重启 QQ） |
| 全部杀掉 | 只杀，不拉 |

## 桌面上那个黑框

cscript / cmd 直接拉 NapCat，会多出一个控制台窗口挂在桌面上。默认行为是**不显示**：
计划任务的动作写的是 `wscript.exe "<dsh家目录>\napcat-keeper-launch.vbs"`，这个壳里用
`sh.Run cmd, 0, False` 把真正的 cmd 以隐藏窗口启动（`0` = SW_HIDE）。壳文件用 UTF-16LE 存，中文路径也认。

不想要隐藏就把「拉起时不显示黑框」关掉，任务会退回直接跑 `cmd.exe`；已经跑起来的那条链想收窗口，
点「收起黑框」（`action=hideConsole`）即可。

## 计划任务为什么重要

`napcat.bat` / `NapCatWinBootMain.exe` 拉起的进程链会跟着「拉起它的进程」一起死。
要是由 DSH 自己 `spawn`，DSH 一重启 QQ 就跟着没——这就是「刚才还好好的，重启完就不通」最常见的原因。

所以默认由计划任务（`NapCat-Keeper-Launch`）来拉，父进程是任务计划服务，DSH 重启牵连不到。
任务不存在时插件自动创建，也可以点「建计划任务」；不想用就把「自动创建计划任务」和「计划任务名」清掉，退回 cscript（能用，但 DSH 退出会带走 QQ）。

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
| `shellDir` | 自动探测 | NapCat Shell 目录（启动脚本所在目录） |
| `launcherScript` | 自动探测 | 启动脚本名或绝对路径 |
| `launchAccount` | 空 | 想快登的 QQ 号 |
| `launchArgs` | 空 | 追加给启动脚本的参数 |
| `onebotPort` | `3000` | OneBot 11 HTTP 端口 |
| `accessToken` | 空 | OneBot access token |
| `taskName` | `NapCat-Keeper-Launch` | 负责拉起的计划任务名，留空 = 不用 |
| `autoCreateTask` | `true` | 任务不存在时自动创建 |
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
~/.dsh/napcat-keeper-state.json    每轮 tick 的状态快照
~/.dsh/napcat-qr.png               最近一张二维码副本（扫码时会更新）
```

## 常见问题

**「离线」但进程明明还在？**
端口没通。看 `napcat-keeper-launch.log`多半是卡在扫码，或者 QQ 弹了验证窗。

**刚重启 DSH，QQ 就掉了？**
说明这条链还是 DSH 拉起来的。填上「计划任务名」、点「建计划任务」，以后交给任务计划服务。

**两个 QQ 客户端互相踢？**
去重会兜住，但根因通常是有人手动又点了一次 `napcat.bat`。点「去重复链」立刻收敛。

**换端口了？**
改「OneBot HTTP 端口」保存即可；如果同时换了 Shell 目录，跨进程锁会自动清掉。

**能在 Linux / macOS 上用吗？**
看门狗本身是 node 实现，但「进程路径探测 / 计划任务 / cscript」这几处是为 Windows 写的；其它平台目前只保证「探端口 + 判活」。

## License

MIT
