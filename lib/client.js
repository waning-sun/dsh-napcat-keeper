// DSH「napcat桥」· 网页半边
//
// 在 **设置 → napcat桥** 里：看状态、填配置、点一下就能拉起/杀掉重拉。
// 这里不碰会话、不碰进程，只是往宿主那几条 /dsh-napcat-keeper/* 路由上读写。
//
// 对第一次用的人：NapCat Shell 目录自己不用猜 —— 上面「分盘扫描」把本机每一块盘
// 都列成一个按钮，点哪个扫哪个，扫到就点「用这个」填进去；也能自己手填路径。

window.__ModuleLoader__.load({
  id: 'dsh-napcat-keeper',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    const React = require('react')
    const inject = ['slots']

    const B = '/dsh-napcat-keeper'
    const get = (p) => fetch(B + p, { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
    const post = (p, body) =>
      fetch(B + p, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
        .then((r) => r.json())
        .catch(() => null)

    const h = React.createElement

    const S = {
      wrap: {
        padding: '12px 14px 24px',
        fontSize: 13,
        lineHeight: 1.7,
        background: 'var(--dsw-alias-bg-layer-1, rgba(255,255,255,.92))',
        border: '1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08))',
        borderRadius: 12,
      },
      h: { fontSize: 14, fontWeight: 600, margin: '18px 0 8px' },
      dim: { opacity: 0.62, fontSize: 12 },
      card: {
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        padding: '10px 12px',
        marginBottom: 10,
        background: 'var(--dsw-alias-bg-layer-1)',
      },
      row: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap' },
      lab: { minWidth: 200, paddingTop: 4, fontSize: 12.5 },
      ctl: { flex: '1 1 300px', minWidth: 220 },
      hint: { opacity: 0.6, fontSize: 11.5, marginTop: 3 },
      input: {
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        padding: '5px 8px',
        background: 'transparent',
        color: 'inherit',
        fontSize: 12.5,
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      },
      btn: {
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 6,
        padding: '4px 12px',
        background: 'transparent',
        color: 'inherit',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      btnOn: {
        border: '1px solid #2f6f4f',
        borderRadius: 6,
        padding: '4px 12px',
        background: '#2f6f4f',
        color: '#fff',
        fontSize: 12.5,
        cursor: 'pointer',
      },
      ok: { color: '#2f8f5b', fontWeight: 600 },
      bad: { color: '#c0392b', fontWeight: 600 },
      warn: { color: '#b8860b', fontWeight: 600 },
      kv: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 14px', fontSize: 12.5 },
      log: {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 11.5,
        lineHeight: 1.5,
        maxHeight: 220,
        overflow: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        margin: 0,
        padding: '8px 10px',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        background: 'rgba(0,0,0,.03)',
      },
      float: {
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        marginTop: 12,
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #c0392b',
        background: 'var(--dsw-alias-bg-layer-1, #fff)',
      },
    }

    const 字段 = [
      {
        group: '分盘扫描（选一块盘，让它自己找 Shell 目录）',
        note: '',
        custom: 'scan',
        items: [],
      },
      {
        group: '连接',
        note: '这三项填完就能跑：NapCat 装在哪、要拉哪个 QQ、OneBot 开在哪个端口。',
        items: [
          ['shellDir', 'NapCat Shell 目录', '用上面的「分盘扫描」找出来，或者手填完整路径，例如 C:/Users/你/NapCat/OneKey/NapCat.<版本>.Shell —— 里面有 napcat*.bat', 'text', true],
          ['launcherScript', '启动脚本', '留空自动挑（quick 优先，其次 napcat*.bat）', 'text'],
          ['nodePath', 'Node 运行时（node.exe）', '留空 = 自动：DSH 自带那份 → 系统 PATH → 常见安装目录 → NapCat 目录。只有「Shell 型」NapCat（目录顶层有 napcat.mjs）才真的用到它；OneKey 注入型跑在 QQ 自己的 Node 里，跟这里无关', 'text'],
          ['launchAccount', '要快登的 QQ 号', '填了它、脚本又找不到时，会自动生成一个直接调 NapCatWinBootMain.exe 的脚本', 'text'],
          ['onebotPort', 'OneBot HTTP 端口', 'NapCat 里 onebot11 的 httpServers 端口，默认 3000', 'number', true],
          ['accessToken', 'OneBot 访问令牌', '没设就留空；设了要跟 NapCat 里填的一致', 'password'],
        ],
      },
      {
        group: '看护行为',
        note: '',
        items: [
          ['enabled', '开启自动看护', '关掉 = 只留着看状态，不自动拉也不自动杀', 'bool'],
          ['autoCreateTask', '自动创建计划任务', '让拉起的 QQ 链挂在任务计划服务下面，DSH 重启不会把它带走', 'bool'],
          ['hideConsole', '拉起时不显示黑框', '用 wscript 壳把控制台窗口藏起来，桌面上不会多出那个 cmd 窗口', 'bool'],
          ['taskName', '计划任务名', '留空 = 不用计划任务，退回 cscript 拉起（DSH 一退 QQ 就跟着退）', 'text'],
          ['probeIntervalSec', '复查间隔（秒）', '多久检查一次端口通不通', 'number'],
          ['launchGraceSec', '拉起后宽限期（秒）', '刚拉起时端口还没通，这期间不重复拉', 'number'],
        ],
      },
      {
        group: '自动登录（可不填）',
        note: 'NapCat 的快速登录令牌会失效，失效后只剩手机扫码。勾上「记住密码」它就会用密码自己重登；'
          + '代价是密码要留在本机，所以勾选前请先看完下面那段风险。',
        custom: 'password',
        items: [],
      },
      {
        group: '需要你点一下的脚本（免管理员提权）',
        note: '',
        custom: 'setup',
        items: [],
      },
      {
        group: '高级',
        note: '一般不用动。',
        items: [
          ['scanTimeoutSec', '扫码等待上限（秒）', '卡在扫码超过这个时间就杀掉重来', 'number'],
          ['maxScanRetries', '扫码重试上限', '重试这么多次还不行就放弃并记日志，不再反复杀进程', 'number'],
          ['stuckSec', '卡死判定（秒）', '进程在、端口不通、又没有任何新信号，判为卡死', 'number'],
          ['chainGapSec', '重复链判定窗口（秒）', '两批 QQ 进程启动时间相隔超过它才算两条链', 'number'],
          ['procPathMatch', '进程路径前缀', '留空 = 由 Shell 目录往上两层推导；填错会导致看不到进程', 'text'],
        ],
      },
    ]

    const 全部键 = 字段.reduce((acc, g) => acc.concat(g.items.map((i) => i[0])), ['rememberPassword', 'quickPassword'])

    function 取(obj, key) {
      return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : ''
    }

    function 状态条(runtime) {
      if (!runtime) return null
      const 在 = runtime.online
      return h('div', { style: S.card },
        h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: 在 ? S.ok : S.bad }, 在 ? '● 在线' : '○ 离线'),
          在 ? h('span', null, String(runtime.nickname || '') + '（' + String(runtime.userId || '') + '）') : null,
          h('span', { style: S.dim }, '阶段：' + String(runtime.phase || '?')),
          h('span', { style: S.dim }, '启动 ' + String(runtime.launchCount || 0) + ' 次'),
          runtime.dedupeCount ? h('span', { style: S.dim }, '去重 ' + String(runtime.dedupeCount) + ' 次') : null,
        ),
        h('div', { style: { ...S.kv, marginTop: 8 } },
          h('span', { style: S.dim }, '进程'),
          h('span', null,
            runtime.procs && runtime.procs.known === false
              ? '（还没探测）'
              : 'NapCatWinBootMain ' + String((runtime.procs && runtime.procs.boot) || 0) +
                ' ｜ QQ ' + String((runtime.procs && runtime.procs.qq) || 0) +
                ' ｜ 链 ' + String((runtime.procs && runtime.procs.chains) || 0) +
                (runtime.procs && runtime.procs.dup ? ' ⚠ 有重复链' : '')),
          h('span', { style: S.dim }, '路径前缀'),
          h('span', { style: { wordBreak: 'break-all' } }, String(runtime.procRoot || '（空）')),
          h('span', { style: S.dim }, '启动脚本'),
          h('span', { style: { wordBreak: 'break-all' } }, String(runtime.launcherFound || '⚠ 没找到')),
          h('span', { style: S.dim }, 'Node'),
          h('span', { style: { wordBreak: 'break-all' } },
            runtime.node && runtime.node.path
              ? String(runtime.node.source || '') + ' ' + String(runtime.node.version || '') + ' · ' + String(runtime.node.path)
              : '⚠ 没找到 node（Shell 型 NapCat 会拉不起来；注入型不受影响）'),
          h('span', { style: S.dim }, '计划任务'),
          h('span', null, String(runtime.taskName || '（不用）') +
            (runtime.taskReady === null || runtime.taskReady === undefined
              ? '（读取中…）'
              : runtime.taskReady ? ' ✓ 就绪' : '（还没建）')),
          h('span', { style: S.dim }, '二维码'),
          h('span', null, runtime.qr ? '最新一张 ' + String(runtime.qr.ageSec) + ' 秒前' : '还没有（没进扫码态）'),
          h('span', { style: S.dim }, '桥接心跳'),
          h('span', null, runtime.bridge && runtime.bridge.ageSec !== null ? String(runtime.bridge.ageSec) + ' 秒前' : '没读到'),
        ),
        runtime.error ? h('div', { style: { ...S.bad, marginTop: 6 } }, '最近错误：' + String(runtime.error)) : null,
      )
    }

    function Section() {
      const [态, set态] = React.useState(null)
      const [草, set草] = React.useState(null)
      const [忙, set忙] = React.useState(false)
      const [说, set说] = React.useState('')
      const [开日志, set开日志] = React.useState(false)
      const [风险开, set风险开] = React.useState(false)
      // null = 「还没动过，默认全勾能做的」；一旦用户点过 checkbox 就固定用它（哪怕空数组）
      const [勾, set勾] = React.useState(null)

      const 装 = (data) => {
        set态(data)
        if (data && data.config) {
          const base = {}
          全部键.forEach((k) => {
            base[k] = 取(data.config, k)
          })
          set草(base)
        }
      }

      React.useEffect(() => {
        let alive = true
        let tries = 0
        const 拉 = async () => {
          const d = await get('/state')
          if (!alive) return
          if (d && d.config) {
            装(d)
            return
          }
          if (tries < 3) {
            tries += 1
            setTimeout(拉, 900)
            return
          }
          set说('接口没响应，读不到状态（日志见 ~/.dsh/dsh-napcat-keeper/keeper.log）')
          set态({ ok: false, config: null, runtime: {}, scan: {}, drives: [], log: [] })
        }
        拉()
        return () => {
          alive = false
        }
      }, [])

      /* ⚠ 所有 hook 都必须排在下面任何一个 return 之前。
         之前扫描轮询的 useEffect 写在早退之后：第一次渲染 hook 少一个，
         一旦拿到状态触发 re-render，hook 数变多 → React #310
         「Rendered more hooks than during the previous render」→ 整个
         settings.section 崩掉（面板空白，还连带别的插件一起挂）。 */
      const 扫着 = Boolean(态 && 态.scan && 态.scan.running)
      React.useEffect(() => {
        if (!扫着) return undefined
        let alive = true
        const timer = setInterval(() => {
          // 轮询走轻量档：不开 PowerShell，只拉扫描进度和运行态
          get('/state?light=1').then((d) => {
            if (!alive || !d) return
            set态((prev) =>
              prev && {
                ...prev,
                scan: d.scan || prev.scan,
                drives: d.drives && d.drives.length ? d.drives : prev.drives,
                runtime: d.runtime || prev.runtime,
                log: d.log && d.log.length ? d.log : prev.log,
              },
            )
          })
        }, 1500)
        return () => {
          alive = false
          clearInterval(timer)
        }
      }, [扫着])

      /* ---------- 早退（都在 hook 之后） ---------- */
      if (!态) {
        return h('div', { style: S.wrap }, h('div', { style: S.dim }, 说 || '正在读取 napcat 看门狗状态 …'))
      }
      if (态.ok === false) {
        return h(
          'div',
          { style: S.wrap },
          h('div', { style: S.h }, 'napcat 看门狗'),
          h('div', { style: S.bad }, 说 || '读不到状态'),
          h(
            'div',
            { style: { ...S.dim, marginTop: 8 } },
            '插件本体（看门狗、napcat_status / napcat_restart 工具）照常工作，只是这个面板没拿到数据。',
          ),
          h(
            'button',
            {
              style: { ...S.btn, marginTop: 10 },
              onClick: () => {
                set说('')
                set态(null)
                get('/state').then((d) => {
                  if (d && d.config) 装(d)
                  else {
                    set说('重试还是没响应')
                    set态({ ok: false, config: null, runtime: {}, scan: {}, drives: [], log: [] })
                  }
                })
              },
            },
            '重试',
          ),
        )
      }

      const 脏 = Boolean(态 && 草 && 全部键.some((k) => String(取(草, k)) !== String(取(态.config, k))))

      const 存 = async () => {
        if (!草 || 忙) return
        set忙(true)
        const r = await post('/save', { patch: 草 })
        if (r) 装(r)
        set说(r && r.config ? '设置已保存并生效' : '保存失败，看看日志')
        set忙(false)
      }

      const 动 = async (doIt) => {
        if (忙) return
        set忙(true)
        set说('执行中：' + doIt + ' …')
        const r = await post('/action', { do: doIt })
        if (r) 装(r)
        set说((r && r.said) || '做完了')
        set忙(false)
      }

      const 改 = (k, v) => set草((prev) => ({ ...(prev || {}), [k]: v }))

      /* 提权交接：插件自己不去要管理员，只写脚本；「是」由人在 UAC 上按。 */
      function 提权区() {
        const 设 = 态 && 态.setup
        if (!设) return h('div', { style: S.hint }, '读不到脚本状态（刷新一下面板试试）')
        const needs = 设.needs || []
        const 可做 = needs.filter((n) => n.ready).map((n) => n.id)
        const 选中 = (勾 === null ? 可做 : 勾).filter((id) => 可做.indexOf(id) >= 0)
        const 切 = (id) => {
          set勾(选中.indexOf(id) >= 0 ? 选中.filter((x) => x !== id) : 选中.concat(id))
        }
        const 跑 = async (doIt, extra) => {
          if (忙) return
          set忙(true)
          set说('执行中：' + doIt + ' …')
          const r = await post('/action', { do: doIt, ...(extra || {}) })
          // 只换态、不动草稿：用户可能还有没保存的设置
          if (r) set态(r)
          set说((r && r.said) || '做完了')
          set忙(false)
        }
        const 生成 = () => {
          if (!选中.length) {
            set说('先勾上至少一条要它做的事')
            return
          }
          跑('makeSetup', { needs: 选中, open: true })
        }
        const 计划 = 设.plan
        const 上次 = 设.lastRun
        const 结果们 = (上次 && 上次.results) || []
        const 成数 = 结果们.filter((x) => x.ok).length
        return h('div', null,
          h('div', { style: S.h }, '需要你点一下的脚本（插件不去抢管理员）'),
          h('div', { style: { ...S.dim, marginBottom: 8 } },
            '要动「装系统的位置」时，插件不偷偷提权，而是把要做的事写成一份脚本放到下面的目录里：'
              + '你双击 apply-admin.cmd，只有含管理员步骤的那一批才会弹 UAC —— 那个「是」就是你自己按的确认键；'
              + '不含的批次双击直接跑。跑完回来点「读结果」，想全部撤回就双击 undo-admin.cmd。'),
          h('div', { style: S.card },
            needs.map((n) => h('label', {
              key: n.id,
              style: {
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                padding: '6px 0',
                opacity: n.ready ? 1 : 0.55,
                cursor: n.ready ? 'pointer' : 'not-allowed',
              },
            },
            h('input', {
              type: 'checkbox',
              name: 'npk-need-' + String(n.id),
              checked: 选中.indexOf(n.id) >= 0,
              disabled: !n.ready || 忙,
              onChange: () => 切(n.id),
              style: { marginTop: 3, flex: '0 0 auto' },
            }),
            h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
              h('div', null, String(n.label || n.id) + (n.needAdmin ? '（要不要管理员看你的目录权限）' : '（不需要管理员）')),
              h('div', { style: S.hint }, String(n.hint || '')),
              !n.ready ? h('div', { style: { ...S.warn, fontSize: 11.5, marginTop: 2 } }, '先解决：' + String(n.why || '')) : null),
            )),
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 } },
              h('button', { type: 'button', style: S.btnOn, disabled: 忙, onClick: 生成 }, '生成脚本并打开文件夹'),
              h('button', { type: 'button', style: S.btn, disabled: 忙 || !设.exists, onClick: () => 跑('openSetup') }, '打开文件夹'),
              h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 跑('setupResult') }, '读结果'),
            ),
            h('div', { style: { ...S.hint, marginTop: 6, wordBreak: 'break-all' } }, String(设.dir || '')),
            计划
              ? h('div', { style: { ...S.dim, marginTop: 8 } },
                '上次生成：' + String(计划.createdAt || '').replace('T', ' ').slice(0, 19)
                  + '｜' + String((计划.steps || []).length) + ' 步'
                  + (计划.needAdmin ? '｜含管理员步骤' : '｜全程普通权限'),
                h('div', { style: S.hint }, (计划.steps || []).map((s) => String(s.label || s.id)).join('、')))
              : h('div', { style: { ...S.dim, marginTop: 8 } }, '还没生成过脚本'),
            上次
              ? h('div', { style: { marginTop: 8 } },
                h('div', { style: 上次.ok ? S.ok : S.bad },
                  (上次.mode === 'undo' ? '撤回' : '执行') + '：' + String(成数) + '/' + String(结果们.length) + ' 步成'
                    + (上次.elevated ? '｜用了管理员' : '｜没用管理员')),
                结果们.map((x) => h('div', {
                  key: String(x.id || '') + String(x.label || ''),
                  style: { ...S.hint, color: x.ok ? undefined : '#c0392b' },
                }, (x.ok ? '✓ ' : x.skipped ? '· 跳过 ' : '✗ ')
                  + String(x.label || x.id || '') + '：' + String(x.message || ''))))
              : null,
          ),
        )
      }

      function 扫描区() {
        const 扫 = (态 && 态.scan) || { running: false, found: [], drives: [], visited: 0 }
        const 盘们 = (态 && 态.drives) || []
        const 结果 = 扫.found || []
        const 发起 = async (drive) => {
          if (忙) return
          set忙(true)
          set说(drive ? `开始扫 ${drive} …` : '开始把所有盘都扫一遍 …')
          const r = await post('/action', { do: 'scan', drive })
          if (r) set态(r)
          set说((r && r.said) || '')
          set忙(false)
        }
        const 用这个 = async (p) => {
          if (忙) return
          set忙(true)
          const r = await post('/action', { do: 'useShell', shellDir: p })
          if (r) 装(r)
          set说((r && r.said) || '已切过去')
          set忙(false)
        }
        // 只刷新盘符列表，不碰下面正在编辑的草稿（别用 装()，那会把没保存的改动冲掉）
        const 重读盘 = async () => {
          if (忙) return
          set忙(true)
          const r = await post('/action', { do: 'drives' })
          if (r && Array.isArray(r.drives)) set态((prev) => ({ ...(prev || {}), drives: r.drives }))
          set说((r && r.said) || '')
          set忙(false)
        }
        return h('div', null,
          h('div', { style: S.h }, '分盘扫描（选一块盘，让它自己找）'),
          h('div', { style: { ...S.dim, marginBottom: 8 } },
            '插件不再替你猜 NapCat 装在哪：本机有几块盘，这里就列几个按钮（系统说有哪几块就是哪几块，'
              + '光驱、移动硬盘、上着锁的盘也会列出来），点哪块扫哪块。深度 7 层、跳过 Windows/回收站/node_modules，'
              + '单盘最多 90 秒；扫到像 NapCat Shell 的目录就停在那条路径上（不再往下钻），'
              + '结果在下面列出来，点「用这个」直接填进 Shell 目录。'),

          h('div', { style: S.card },
            h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
              ...盘们.map((d) => h('button', {
                key: d,
                type: 'button',
                style: 扫.running ? { ...S.btn, opacity: 0.5 } : S.btn,
                disabled: 忙 || 扫.running,
                onClick: () => 发起(d),
              }, '扫 ' + d)),
              盘们.length
                ? h('button', {
                  type: 'button',
                  style: 扫.running ? { ...S.btn, opacity: 0.5 } : S.btnOn,
                  disabled: 忙 || 扫.running,
                  onClick: () => 发起('all'),
                }, '全部盘（慢）')
                : h('span', { style: S.bad }, '没读到盘 —— 点右边「重新读盘」再试一次'),
              扫.running
                ? h('button', {
                  type: 'button',
                  style: S.btn,
                  disabled: 忙,
                  onClick: async () => {
                    const r = await post('/action', { do: 'scanStop' })
                    set说((r && r.said) || '已要求停止')
                  },
                }, '停止')
                : null,
              h('button', { type: 'button', style: S.btn, disabled: 忙 || 扫.running, onClick: 重读盘 }, '重新读盘'),
            ),
            h('div', { style: { ...S.dim, marginTop: 6 } },
              盘们.length
                ? `读到 ${盘们.length} 块盘：${盘们.join('、')}（插了移动盘就点「重新读盘」）`
                : '一块盘都没读到'),

            扫.running
              ? h('div', { style: { ...S.dim, marginTop: 8 } },
                `正在扫 ${扫.drive || (扫.drives || []).join('、')} … 已看 ${扫.visited} 个目录，`
                  + `用时 ${Math.round((扫.elapsedMs || 0) / 1000)} 秒，命中 ${结果.length} 个`)
              : null,
            !扫.running && (扫.elapsedMs || 0) > 0
              ? h('div', { style: { ...S.dim, marginTop: 8 } },
                `上一轮：${(扫.drives || []).join('、') || '—'}，看了 ${扫.visited} 个目录，`
                  + `用时 ${Math.round((扫.elapsedMs || 0) / 1000)} 秒，命中 ${结果.length} 个`
                  + (扫.limitHit ? '（到时间/数量上限就停了，结果可能不全）' : '')
                  + (扫.cancelled ? '（你中途停了）' : ''))
              : null,
            扫.error ? h('div', { style: { ...S.bad, marginTop: 6 } }, '扫描出错：' + 扫.error) : null,

            结果.length
              ? h('div', { style: { marginTop: 10 } },
                ...结果.map((f) => h('div', {
                  key: f.path,
                  style: {
                    display: 'flex',
                    gap: 10,
                    alignItems: 'flex-start',
                    padding: '8px 0',
                    borderTop: '1px solid var(--dsw-alias-border-1, rgba(0,0,0,.08))',
                  },
                },
                h('div', { style: { flex: '1 1 auto', minWidth: 0 } },
                  h('div', {
                    style: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, wordBreak: 'break-all' },
                  }, f.path),
                  h('div', { style: S.hint },
                    (f.launcher ? '启动脚本：' + f.launcher : '没找到 .bat 启动脚本')
                      + (f.boot ? ' · 含 NapCatWinBootMain.exe' : '')
                      + (f.drive ? ' · ' + f.drive : '')),
                  f.shell === undefined
                    ? h('div', { style: { ...S.hint, color: '#9a7b2f' } },
                      '（服务端还是旧版，没给判定 —— 重启 DSH 后这里会标真假）')
                    : (f.shell
                      ? h('div', { style: { ...S.hint, color: '#2f8f5b' } },
                        '✓ 像真 Shell：' + (f.evidence && f.evidence.length ? f.evidence.join(' · ') : '有 QQ 本体'))
                      : h('div', { style: { ...S.warn, fontSize: 11.5, marginTop: 2 } },
                        '⚠ 没看到 versions/QQ.exe/napcat.mjs —— 多半是 OneKey 装完留下的壳模板（只有 bootmain + bat），'
                          + '选它大概率拉不起来；确定你这份是精简布局再选')),
                ),
                h('button', {
                  type: 'button',
                  style: f.shell === false ? S.btn : S.btnOn,
                  disabled: 忙,
                  onClick: () => 用这个(f.path),
                }, f.shell === false ? '仍要用这个' : '用这个'),
                )),
              )
              : (!扫.running && (扫.elapsedMs || 0) > 0
                ? h('div', { style: { ...S.bad, marginTop: 8 } },
                  '这个范围里没找到。要么换个盘，要么把目录直接手填到下面「NapCat Shell 目录」里。')
                : null),
          ),
        )
      }

      /* ---------- 「记住密码」那一块：先讲风险，再让人自己决定 ---------- */
      const 风险条目 = [
        '密码会以明文写进本机两个地方：~/.dsh/dsh-napcat-keeper/config.json，以及同目录下插件生成的 env.bat。不加密、不做任何变换（MD5 那份是给 NapCat 兜底用的，同样等于密码）。',
        '任何能读你这个用户目录的东西都能直接捡走：同步盘、备份工具、其它软件、远控木马、临时借你电脑的人。',
        'QQ 密码通常和 QQ 邮箱、部分游戏、微信的登录入口共用一套身份，泄漏的影响面不止这一个号。',
        '插件本身不打印密码、/state 接口也只回「存没存」和长度，但那只是少开一个泄漏口，不等于安全。',
        '不开的代价：快速登录令牌会失效（实测几小时到几天），失效后就只能手机扫码，否则 QQ 离线，dsh-qq-bridge 会一路报 ECONNREFUSED。',
        '想收回：随时点下面「清除密码」，配置文件和这个 bat 里的密码都会被删掉；已经跑起来的进程环境只活到那次进程结束。',
      ]

      function 密码区() {
        const 记着 = 取(草, 'rememberPassword') === true || String(取(草, 'rememberPassword')) === 'true'
        const 有密码 = Boolean(取(态.config, 'hasPassword'))
        const 密码位 = 取(态.config, 'passwordLength')
        const 账号 = String(取(草, 'launchAccount') || '')
        return h('div', null,
          h('div', { style: S.h }, '自动登录（可不填）'),
          h('div', { style: { ...S.dim, marginBottom: 8 } },
            'NapCat 的快速登录令牌会失效，失效后只剩手机扫码。勾上「记住密码」它就会用密码自己重登；'
              + '代价是密码要留在本机，所以勾之前先看完下面那段风险。'),

          h('div', { style: S.card },
            h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 } },
              h('input', {
                type: 'checkbox',
                checked: 记着,
                onChange: (e) => {
                  if (e.target.checked) set风险开(true)
                  else { set风险开(false); 改('rememberPassword', false) }
                },
              }),
              h('span', null, '记住 QQ 密码：令牌失效时用密码自动登录'),
              h('span', { style: 记着 ? S.warn : S.dim }, 记着 ? '（已开启）' : '（默认关）'),
            ),

            h('div', { style: { ...S.row, marginTop: 10 } },
              h('div', { style: S.lab },
                h('div', null, 'QQ 密码'),
                h('div', { style: S.hint },
                  有密码 ? '已保存 ' + String(密码位) + ' 位；直接留空 = 不改' : '还没保存过；这里填的密码只发给本机 NapCat')),
              h('div', { style: S.ctl },
                h('input', {
                  style: S.input,
                  type: 'password',
                  autoComplete: 'new-password',
                  spellCheck: false,
                  value: String(取(草, 'quickPassword') || ''),
                  placeholder: 有密码 ? '留空 = 不改' : '填 QQ 密码',
                  disabled: !记着,
                  onChange: (e) => 改('quickPassword', e.target.value),
                }),
                !账号 ? h('div', { style: { ...S.bad, marginTop: 6 } }, '先去上面「连接」里把 QQ 号填了，否则密码用不上') : null,
              ),
            ),

            风险开 ? h('div', { style: { marginTop: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #c0392b', background: 'rgba(192,57,43,.06)' } },
              h('div', { style: { ...S.bad, marginBottom: 6 } }, '⚠ 开启前请确认你接受这些风险'),
              h('ul', { style: { margin: '0 0 8px 18px', padding: 0, fontSize: 12.5, lineHeight: 1.75 } },
                风险条目.map((t, i) => h('li', { key: i, style: { marginBottom: 4 } }, t))),
              h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
                h('button', {
                  type: 'button',
                  style: S.btnOn,
                  disabled: 忙,
                  onClick: () => { 改('rememberPassword', true); set风险开(false); set说('已勾选「记住密码」——记得点下面「保存设置」才会真正落盘') },
                }, '我知道风险，仍然开启'),
                h('button', {
                  type: 'button',
                  style: S.btn,
                  disabled: 忙,
                  onClick: () => { set风险开(false); 改('rememberPassword', false) },
                }, '算了，不用'),
              ),
            ) : null,

            有密码 ? h('div', { style: { marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
              h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('clearPassword') }, '清除已保存的密码'),
              h('span', { style: S.dim },
                取(态.config, 'passwordActive')
                  ? '当前生效中：拉起时会带环境变量；文件 ' + String(取(态.config, 'passwordPath') || '')
                  : '已保存但未生效（开关关着，或 QQ 号没填）'),
            ) : null,
          ),
        )
      }

      const 渲染项 = (item) => {
        const [key, label, hint, type] = item
        const val = 取(草, key)
        let ctl
        if (type === 'bool') {
          ctl = h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 } },
            h('input', {
              type: 'checkbox',
              checked: val !== false && String(val) !== 'false',
              onChange: (e) => 改(key, e.target.checked),
            }),
            h('span', null, val !== false && String(val) !== 'false' ? '开' : '关'))
        } else {
          ctl = h('input', {
            style: S.input,
            type: type === 'number' ? 'number' : type === 'password' ? 'password' : 'text',
            value: val === null || val === undefined ? '' : String(val),
            placeholder: type === 'number' ? '' : '留空 = 自动',
            spellCheck: false,
            onChange: (e) => 改(key, type === 'number' ? e.target.value : e.target.value),
          })
        }
        return h('div', { style: S.row, key },
          h('div', { style: S.lab },
            h('div', null, label),
            hint ? h('div', { style: S.hint }, hint) : null),
          h('div', { style: S.ctl },
            ctl,
            key === 'shellDir'
              ? h('div', { style: S.hint }, '不想手填就用上面「分盘扫描」：挑一块盘让它自己找，扫到点「用这个」。')
              : null),
        )
      }

      return h('div', { style: S.wrap },
        h('div', { style: S.h }, 'napcat桥'),
        h('div', { style: S.dim },
          '让 NapCat（QQ 协议端）跟着 DSH 一起活着：不通就拉、重复就杀、卡住就重来。'
            + '版本 ' + String(态.version || '?') + '｜配置：' + String(取(态.config, 'configPath'))),

        状态条(态.runtime),

        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' } },
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('probe') }, '重新探活'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('launch') }, '拉起 NapCat'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('restart') }, '杀掉重拉'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('dedupe') }, '去重复链'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('createTask') }, '建计划任务'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('hideConsole') }, '收起黑框'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('checkNode') }, '测一下 node'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('kill') }, '全部杀掉'),
        ),
        说 ? h('div', { style: { ...S.dim, marginBottom: 6 } }, 说) : null,

        字段.map((g) => g.custom === 'password'
          ? h('div', { key: g.group }, 密码区())
          : g.custom === 'scan'
            ? h('div', { key: g.group }, 扫描区())
            : g.custom === 'setup'
              ? h('div', { key: g.group }, 提权区())
              : h('div', { key: g.group },
                h('div', { style: S.h }, g.group),
                g.note ? h('div', { style: { ...S.dim, marginBottom: 8 } }, g.note) : null,
                g.items.map(渲染项),
              )),

        h('div', { style: S.h }, '日志'),
        h('div', { style: { display: 'flex', gap: 8, marginBottom: 6 } },
          h('button', { type: 'button', style: S.btn, onClick: () => set开日志(!开日志) }, 开日志 ? '收起' : '展开'),
          h('button', {
            type: 'button',
            style: S.btn,
            onClick: () => get('/log?lines=200').then((d) => {
              if (d && d.lines) set态((prev) => ({ ...prev, log: d.lines }))
            }),
          }, '刷新'),
          h('span', { style: S.dim }, String(取(态.config, 'logPath'))),
        ),
        开日志 ? h('pre', { style: S.log }, (态.log || []).join('\n') || '（还没有日志）') : null,

        脏 ? h('div', { style: S.float },
          h('span', { style: S.bad }, '⚠ 有改动还没保存'),
          h('span', { style: S.dim }, '改完点右边就行，保存后立刻生效，不用重启 DSH'),
          h('button', { type: 'button', style: S.btnOn, onClick: 存, disabled: 忙 }, 忙 ? '保存中…' : '保存设置'),
        ) : h('div', { style: { ...S.dim, marginTop: 12 } }, '设置已同步 ✓'),
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () =>
        slots.register(
          { name: 'settings.section', id: 'napcat-keeper', order: 53, label: () => 'napcat桥' },
          Section,
        ),
      )
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
