# Changelog

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
