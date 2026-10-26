// DSH「napcat桥」· 网页半边
//
// 在 **设置 → napcat桥** 里：看状态、填配置、点一下就能探测/拉起/杀掉重拉。
// 这里不碰会话、不碰进程，只是往宿主那几条 /dsh-napcat-keeper/* 路由上读写。
//
// 对第一次用的人：只要三个空 —— NapCat Shell 目录、QQ 号、OneBot 端口，
// 保存完就能用；其它都能自动探测。

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
        group: '连接',
        note: '这三项填完就能跑：NapCat 装在哪、要拉哪个 QQ、OneBot 开在哪个端口。',
        items: [
          ['shellDir', 'NapCat Shell 目录', '例如 C:/Users/你/NapCat/OneKey/NapCat.<版本>.Shell —— 里面有 napcat*.bat', 'text', true],
          ['launcherScript', '启动脚本', '留空自动挑（quick 优先，其次 napcat*.bat）', 'text'],
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

    const 全部键 = 字段.reduce((acc, g) => acc.concat(g.items.map((i) => i[0])), [])

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
            'NapCatWinBootMain ' + String((runtime.procs && runtime.procs.boot) || 0) +
            ' ｜ QQ ' + String((runtime.procs && runtime.procs.qq) || 0) +
            ' ｜ 链 ' + String((runtime.procs && runtime.procs.chains) || 0) +
            (runtime.procs && runtime.procs.dup ? ' ⚠ 有重复链' : '')),
          h('span', { style: S.dim }, '路径前缀'),
          h('span', { style: { wordBreak: 'break-all' } }, String(runtime.procRoot || '（空）')),
          h('span', { style: S.dim }, '启动脚本'),
          h('span', { style: { wordBreak: 'break-all' } }, String(runtime.launcherFound || '⚠ 没找到')),
          h('span', { style: S.dim }, '计划任务'),
          h('span', null, String(runtime.taskName || '（不用）') + (runtime.taskReady ? ' ✓ 就绪' : '（还没建）')),
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
        get('/state').then((d) => d && 装(d))
      }, [])

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

      const 探测 = async () => {
        set忙(true)
        const r = await post('/action', { do: 'detect' })
        if (r) {
          装(r)
          if (r.extra) set草((prev) => ({ ...(prev || {}), shellDir: r.extra }))
        }
        set说((r && r.said) || '探测完了')
        set忙(false)
      }

      if (!态) {
        return h('div', { style: S.wrap }, h('div', { style: S.dim }, '正在读取 napcat 看门狗状态 …'))
      }

      const 改 = (k, v) => set草((prev) => ({ ...(prev || {}), [k]: v }))

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
            key === 'shellDir' ? h('div', { style: { marginTop: 6 } },
              h('button', { type: 'button', style: S.btn, onClick: 探测, disabled: 忙 }, '自动探测')) : null),
        )
      }

      return h('div', { style: S.wrap },
        h('div', { style: S.h }, 'napcat桥'),
        h('div', { style: S.dim },
          '让 NapCat（QQ 协议端）跟着 DSH 一起活着：不通就拉、重复就杀、卡住就重来。'
            + '版本 ' + String(态.version || '?') + '｜配置：' + String(取(态.config, 'configPath'))),

        状态条(态.runtime),

        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' } },
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('probe') }, '重新探测'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('launch') }, '拉起 NapCat'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('restart') }, '杀掉重拉'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('dedupe') }, '去重复链'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('createTask') }, '建计划任务'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('hideConsole') }, '收起黑框'),
          h('button', { type: 'button', style: S.btn, disabled: 忙, onClick: () => 动('kill') }, '全部杀掉'),
        ),
        说 ? h('div', { style: { ...S.dim, marginBottom: 6 } }, 说) : null,

        字段.map((g) => h('div', { key: g.group },
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
