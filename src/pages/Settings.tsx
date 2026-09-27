import { useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '@/lib/store'
import { testKey, AIError } from '@/lib/ai'
import { testGithubToken, getSyncState, subscribeSync, pullFromGist } from '@/lib/sync'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Cloud, Download, KeyRound, Loader2, RefreshCw, Upload } from 'lucide-react'

export default function Settings() {
  const nav = useNavigate()
  const { db, updateSettings, exportJSON, importJSON } = useStore()
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [keyInput, setKeyInput] = useState(db.settings.deepseekKey)
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [ghInput, setGhInput] = useState(db.settings.githubToken)
  const [ghState, setGhState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [ghMsg, setGhMsg] = useState('')
  const sync = useSyncExternalStore(subscribeSync, getSyncState)

  const testGithub = async () => {
    const token = ghInput.trim()
    if (!token) { setGhState('fail'); setGhMsg('请先填写 Token'); return }
    setGhState('testing'); setGhMsg('')
    try {
      await testGithubToken(token)
      updateSettings({ githubToken: token })
      setGhState('ok'); setGhMsg('连接成功，Token 已保存 ✓ 数据将在几秒后自动上传为一个私密 Gist')
    } catch (e) {
      setGhState('fail')
      setGhMsg(e instanceof Error ? e.message : '连接失败')
    }
  }

  const manualPull = async () => {
    const { githubToken, gistId } = db.settings
    if (!githubToken || !gistId) { setGhMsg('尚未同步过，先保存 Token 让数据上传一次'); return }
    setGhState('testing')
    try {
      const remote = await pullFromGist(githubToken, gistId)
      const ok = remote ? importJSON(remote) : false
      setGhState(ok ? 'ok' : 'fail')
      setGhMsg(ok ? '已从云端拉取最新数据 ✓' : '云端暂无数据')
    } catch (e) {
      setGhState('fail')
      setGhMsg(e instanceof Error ? e.message : '拉取失败')
    }
  }

  const saveKey = () => {
    updateSettings({ deepseekKey: keyInput.trim() })
    setMsg('DeepSeek Key 已保存（只存在本设备浏览器）')
  }

  const doTest = async () => {
    const key = keyInput.trim()
    if (!key) { setTestState('fail'); setTestMsg('请先填写 Key'); return }
    setTestState('testing'); setTestMsg('')
    try {
      await testKey(key)
      updateSettings({ deepseekKey: key })
      setTestState('ok'); setTestMsg('连接成功，Key 已保存 ✓')
    } catch (e) {
      setTestState('fail')
      setTestMsg(e instanceof AIError ? e.message : '连接失败')
    }
  }

  const doExport = async () => {
    const json = await exportJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `读书人备份-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    setMsg('已导出备份文件')
  }

  const doImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const ok = importJSON(String(reader.result))
      setMsg(ok ? '导入成功，数据已还原' : '导入失败：文件格式不对')
    }
    reader.readAsText(file)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav('/')} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-stone-800">设置</h1>
      </div>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> DeepSeek AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-stone-500">
            用于大纲生成、笔记整理、今日一问。Key 只存在这台设备的浏览器里，请求从你的浏览器直连 DeepSeek，不经过任何第三方。
            没有 Key？去 platform.deepseek.com 注册申请。
          </p>
          <Label htmlFor="dk">API Key</Label>
          <Input
            id="dk" type="password" value={keyInput}
            onChange={(e) => { setKeyInput(e.target.value); setTestState('idle'); setTestMsg('') }}
            placeholder="sk-..."
          />
          <div className="flex gap-2">
            <Button variant="outline" onClick={saveKey} disabled={!keyInput.trim()}>保存</Button>
            <Button variant="outline" onClick={doTest} disabled={testState === 'testing'}>
              {testState === 'testing' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              测试连接
            </Button>
          </div>
          {testMsg && (
            <p className={`text-sm ${testState === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>{testMsg}</p>
          )}
          <div className="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2">
            <span className="text-sm text-stone-700">今日一问（每天打开时针对待实践行动提问）</span>
            <Switch
              checked={db.settings.dailyQuestionEnabled}
              onCheckedChange={(v) => updateSettings({ dailyQuestionEnabled: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Cloud className="h-4 w-4" /> 云同步（GitHub Gist）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-stone-500">
            数据自动备份到你自己 GitHub 账号下的私密 Gist，多设备共享。Token 只存本设备。
            创建方法：GitHub → Settings → Developer settings → Personal access tokens → 只勾选 <b>gist</b> 权限。
          </p>
          <Label htmlFor="gh">GitHub Token（仅 gist 权限）</Label>
          <Input
            id="gh" type="password" value={ghInput}
            onChange={(e) => { setGhInput(e.target.value); setGhState('idle'); setGhMsg('') }}
            placeholder="ghp_... 或 github_pat_..."
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={testGithub} disabled={ghState === 'testing'}>
              {ghState === 'testing' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              保存并测试
            </Button>
            <Button variant="outline" onClick={manualPull} disabled={ghState === 'testing'}>
              <RefreshCw className="mr-1 h-4 w-4" /> 立即拉取云端
            </Button>
          </div>
          <p className="text-xs text-stone-400">
            同步状态：
            {sync.status === 'disabled' && '未配置'}
            {sync.status === 'idle' && (sync.msg || '待同步')}
            {sync.status === 'syncing' && '同步中…'}
            {sync.status === 'synced' && <span className="text-emerald-600">{sync.msg} ✓</span>}
            {sync.status === 'error' && <span className="text-red-500">{sync.msg}</span>}
          </p>
          {ghMsg && <p className={`text-sm ${ghState === 'fail' ? 'text-red-500' : 'text-emerald-600'}`}>{ghMsg}</p>}
          <p className="text-xs text-stone-400">规则：最后写入胜出。换设备时请等新设备拉取完成再编辑。</p>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader><CardTitle className="text-base">显示</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-md bg-stone-50 px-3 py-2">
            <div>
              <p className="text-sm text-stone-700">电纸书模式</p>
              <p className="text-xs text-stone-400">黑白高对比、大字号、无动画阴影，适合文石 Boox</p>
            </div>
            <Switch
              checked={db.settings.einkMode}
              onCheckedChange={(v) => updateSettings({ einkMode: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader><CardTitle className="text-base">数据统计</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-4 gap-2 text-center">
          <div><p className="text-2xl font-bold text-stone-800">{db.books.length}</p><p className="text-xs text-stone-500">书</p></div>
          <div><p className="text-2xl font-bold text-stone-800">{db.notes.length}</p><p className="text-xs text-stone-500">笔记</p></div>
          <div><p className="text-2xl font-bold text-stone-800">{db.actions.length}</p><p className="text-xs text-stone-500">行动项</p></div>
          <div><p className="text-2xl font-bold text-stone-800">{db.appRecords.length}</p><p className="text-xs text-stone-500">应用记录</p></div>
        </CardContent>
      </Card>

      <Card className="mb-3">
        <CardHeader><CardTitle className="text-base">数据备份</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-stone-500">数据只存在这台设备的浏览器里。换设备前记得导出，到新设备导入。</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={doExport}><Download className="mr-1 h-4 w-4" /> 导出 JSON</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-1 h-4 w-4" /> 导入 JSON</Button>
            <input
              ref={fileRef} type="file" accept=".json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = '' }}
            />
          </div>
          {msg && <p className="text-sm text-emerald-600">{msg}</p>}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-sm text-stone-400">
            即将到来：GitHub Gist 云同步、电纸书模式、PWA 安装与部署上线。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
