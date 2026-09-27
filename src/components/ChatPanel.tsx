import { useRef, useState } from 'react'
import { chatMessages, AIError } from '@/lib/ai'
import type { Book } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, MessageCircle, Save, BookOpenCheck, Send } from 'lucide-react'

interface Msg { role: 'user' | 'assistant'; content: string }

const SYSTEM = `你是一位阅读伙伴，正在陪用户读一本书。你的职责：
- 通过提问引导用户说出自己的想法（"这部分让你想到什么？""和你已知的东西有什么联系？""你打算怎么用？"）
- 永远不要替用户总结或下结论——想法必须是用户自己的
- 用户说完后，用一两句话复述确认你理解对了
- 每次回复简短（不超过 3 句），一次只问一个问题
- 如果用户说"聊好了/帮我整理"，才把**用户说过的话**提炼成分点草稿，明确标注哪些话是用户说的`

/** 和 AI 聊聊：对话式记录，AI 引导提问，产出物由用户决定去向 */
export default function ChatPanel({
  book,
  aiKey,
  onSaveNote,
  onSaveSummary,
}: {
  book: Book
  aiKey: string
  onSaveNote: (text: string) => void
  onSaveSummary: (text: string) => void
}) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  if (!aiKey) {
    return (
      <Card className="mt-3 border-dashed p-4">
        <p className="text-sm text-stone-400">
          💬 和 AI 聊聊：填了 DeepSeek Key 后，AI 会通过提问帮你把想法聊出来（它只问不替你总结）
        </p>
      </Card>
    )
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setErr('')
    const next: Msg[] = [...msgs, { role: 'user', content: text }]
    setMsgs(next)
    setBusy(true)
    try {
      const reply = await chatMessages(aiKey, [
        { role: 'system', content: `${SYSTEM}\n\n当前在读：《${book.title}》${book.author ? `（${book.author}）` : ''}` },
        ...next,
      ])
      setMsgs([...next, { role: 'assistant', content: reply }])
      setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 50)
    } catch (e) {
      setErr(e instanceof AIError ? e.message : '对话失败，请重试')
    }
    setBusy(false)
  }

  /** 提炼对话中用户说过的话 */
  const distill = async (target: 'note' | 'summary') => {
    if (busy || msgs.length === 0) return
    setBusy(true)
    setErr('')
    try {
      const draft = await chatMessages(aiKey, [
        { role: 'system', content: '把对话中【用户说的内容】提炼成分点草稿。只整理用户的话，不添加你的观点。输出纯文本，用 • 分点。' },
        ...msgs,
        { role: 'user', content: target === 'note' ? '聊到这里，把我说过的话整理成笔记草稿' : '把我们聊的内容整理成我的全书总结草稿' },
      ])
      if (target === 'note') onSaveNote(draft)
      else onSaveSummary(draft)
    } catch (e) {
      setErr(e instanceof AIError ? e.message : '提炼失败，请重试')
    }
    setBusy(false)
  }

  return (
    <Card className="mt-3 p-4">
      <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold text-stone-700">
        <MessageCircle className="h-4 w-4" /> 和 AI 聊聊《{book.title}》
      </h3>

      {msgs.length === 0 && (
        <div className="mb-2 space-y-1">
          <p className="text-xs text-stone-400">AI 只提问、不替你总结。不知道聊什么？点一个开场：</p>
          <div className="flex flex-wrap gap-1.5">
            {['我刚读了一部分，想聊聊', '有个观点我不太认同', '帮我想想这本书怎么用'].map((q) => (
              <Button key={q} size="sm" variant="outline" className="text-xs" onClick={() => setInput(q)}>
                {q}
              </Button>
            ))}
          </div>
        </div>
      )}

      {msgs.length > 0 && (
        <div ref={listRef} className="mb-2 max-h-72 space-y-2 overflow-y-auto rounded-md bg-stone-50 p-2">
          {msgs.map((m, i) => (
            <div key={i} className={`text-sm ${m.role === 'user' ? 'text-right' : ''}`}>
              <span
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-left leading-relaxed ${
                  m.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-white text-stone-700'
                }`}
              >
                {m.content}
              </span>
            </div>
          ))}
          {busy && <p className="text-xs text-stone-400">AI 正在想…</p>}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="说说你的想法…（回车发送）"
          className="min-h-[40px] flex-1 resize-none"
          rows={1}
        />
        <Button size="icon" className="h-10 w-10 shrink-0" onClick={send} disabled={!input.trim() || busy} aria-label="发送">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {err && <p className="mt-1 text-xs text-red-500">{err}</p>}

      {msgs.length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-2 border-t pt-2">
          <Button size="sm" variant="outline" onClick={() => distill('note')} disabled={busy}>
            <Save className="mr-1 h-3.5 w-3.5" /> 把我说的话存成笔记
          </Button>
          <Button size="sm" variant="outline" onClick={() => distill('summary')} disabled={busy}>
            <BookOpenCheck className="mr-1 h-3.5 w-3.5" /> 提炼成总结草稿
          </Button>
          <Button size="sm" variant="ghost" className="text-stone-400" onClick={() => setMsgs([])}>
            结束本轮对话
          </Button>
        </div>
      )}
    </Card>
  )
}
