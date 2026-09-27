import { useState } from 'react'
import { useStore } from '@/lib/store'
import { structureAnswer } from '@/lib/ai'
import { todayStr } from '@/lib/helpers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, CircleHelp, Loader2, XCircle } from 'lucide-react'

/** 今日一问：针对「待实践/实践中」的行动项提问，按钮或一句话作答，AI 归档 */
export default function DailyQuestion() {
  const { db, addAppRecord } = useStore()
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  if (!db.settings.dailyQuestionEnabled) return null

  const today = todayStr()
  const pending = db.actions.filter(
    (a) =>
      (a.status === '待实践' || a.status === '实践中') &&
      !db.appRecords.some((r) => r.actionId === a.id && r.date === today),
  )
  if (pending.length === 0) return null

  const action = pending[0]
  const book = db.books.find((b) => b.id === action.bookId)

  const answer = async (applied: boolean | 'forgot') => {
    const raw = reply.trim()
    setBusy(true)
    let extra: { difficulty?: string; improvement?: string; reason?: string } = {}
    if (raw && db.settings.deepseekKey) {
      try {
        extra = await structureAnswer(db.settings.deepseekKey, action.text, raw)
      } catch { /* AI 失败不影响记录 */ }
    }
    addAppRecord({
      actionId: action.id,
      bookId: action.bookId,
      date: today,
      applied,
      rawAnswer: raw || (applied === 'forgot' ? '忘了' : applied ? '用了' : '没用'),
      ...extra,
    })
    setReply('')
    setBusy(false)
  }

  return (
    <Card className="mb-4 border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
        <CircleHelp className="h-4 w-4 text-amber-600" />
        今日一问 <span className="text-xs font-normal text-stone-400">（还剩 {pending.length} 问）</span>
      </div>
      <p className="text-sm leading-relaxed text-stone-800">
        《{book?.title ?? '未知'}》里你打算实践「<span className="font-medium">{action.text}</span>」—— 最近用了吗？
      </p>
      <Textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="可选：补一句情况，AI 帮你归档难点/改善/原因"
        className="mt-2 min-h-[40px] resize-none bg-white"
        rows={1}
      />
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => answer(true)} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="mr-1 h-4 w-4" /> 用了
        </Button>
        <Button size="sm" variant="outline" onClick={() => answer(false)} disabled={busy}>
          <XCircle className="mr-1 h-4 w-4" /> 没用
        </Button>
        <Button size="sm" variant="ghost" onClick={() => answer('forgot')} disabled={busy} className="text-stone-500">
          忘了
        </Button>
        {busy && <Loader2 className="h-4 w-4 animate-spin self-center text-stone-400" />}
      </div>
    </Card>
  )
}
