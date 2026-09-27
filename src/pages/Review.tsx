import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '@/lib/store'
import { discoverPatterns } from '@/lib/ai'
import type { Book } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Download, Loader2, Sparkles } from 'lucide-react'

export default function Review() {
  const nav = useNavigate()
  const { db } = useStore()

  const booksWithData = useMemo(
    () =>
      db.books
        .map((b) => ({
          book: b,
          notes: db.notes.filter((n) => n.bookId === b.id),
          records: db.appRecords.filter((r) => r.bookId === b.id),
        }))
        .filter((x) => x.notes.length > 0 || x.records.length > 0 || x.book.mySummary),
    [db],
  )

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav('/')} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold text-stone-800">回顾</h1>
      </div>

      {booksWithData.length === 0 ? (
        <p className="py-20 text-center text-sm text-stone-400">还没有积累。去读一本书、记一条笔记，这里就会长出内容。</p>
      ) : (
        <div className="space-y-3">
          {booksWithData.map(({ book, notes, records }) => (
            <ReviewCard key={book.id} book={book} notes={notes} records={records} actions={db.actions} aiKey={db.settings.deepseekKey} />
          ))}
        </div>
      )}
    </div>
  )
}

function ReviewCard({
  book, notes, records, actions, aiKey,
}: {
  book: Book
  notes: ReturnType<typeof useStore>['db']['notes']
  records: ReturnType<typeof useStore>['db']['appRecords']
  actions: ReturnType<typeof useStore>['db']['actions']
  aiKey: string
}) {
  const nav = useNavigate()
  const [pattern, setPattern] = useState('')
  const [busy, setBusy] = useState(false)
  const reviewedCount = notes.filter((n) => n.reviewed).length
  const appliedCount = records.filter((r) => r.applied === true).length

  const analyze = async () => {
    if (!aiKey) return
    setBusy(true)
    try {
      const result = await discoverPatterns(
        aiKey,
        records.map((r) => ({
          action: actions.find((a) => a.id === r.actionId)?.text ?? '（行动已删除）',
          applied: r.applied,
          difficulty: r.difficulty,
          improvement: r.improvement,
          reason: r.reason,
          date: r.date,
        })),
      )
      setPattern(result)
    } catch {
      setPattern('分析失败，请检查网络或 Key')
    }
    setBusy(false)
  }

  const exportMd = () => {
    const lines: string[] = [`# 《${book.title}》读书笔记`, '']
    if (book.author) lines.push(`作者：${book.author}`, '')
    if (book.mySummary) lines.push(`## 我的总结`, book.mySummary, '')
    if (book.outline) lines.push(`## AI 大纲`, book.outline, '')
    for (const c of ['观点', '金句', '行动'] as const) {
      const list = notes.filter((n) => n.category === c)
      if (list.length === 0) continue
      lines.push(`## ${c}`)
      for (const n of list) {
        const text = n.finalText ?? n.polished ?? n.rawText
        lines.push(`- ${text.replace(/\n/g, '\n  ')}${n.reviewed ? '' : ' *(待校对)*'}`)
      }
      lines.push('')
    }
    if (records.length > 0) {
      lines.push('## 应用记录')
      for (const r of records) {
        lines.push(`- ${r.date}｜${r.applied === 'forgot' ? '忘了' : r.applied ? '用了' : '没用'}｜${r.rawAnswer}`)
        if (r.difficulty) lines.push(`  - 难点：${r.difficulty}`)
        if (r.improvement) lines.push(`  - 改善：${r.improvement}`)
        if (r.reason) lines.push(`  - 原因：${r.reason}`)
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${book.title}-读书笔记.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 cursor-pointer" onClick={() => nav(`/book/${book.id}`)}>
          <h3 className="truncate font-semibold text-stone-800">《{book.title}》</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Badge variant="secondary">{notes.length} 条笔记</Badge>
            <Badge variant="secondary">校对 {reviewedCount}/{notes.length}</Badge>
            <Badge variant="secondary">应用 {records.length} 次（成功 {appliedCount}）</Badge>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={exportMd} aria-label="导出笔记">
          <Download className="mr-1 h-4 w-4" /> 导出
        </Button>
      </div>

      {book.mySummary && (
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-stone-600">{book.mySummary}</p>
      )}

      {/* 模式发现 */}
      <div className="mt-3 border-t pt-3">
        {pattern ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{pattern}</p>
      ) : records.length >= 5 ? (
          aiKey ? (
            <Button size="sm" variant="ghost" onClick={analyze} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              AI 分析我的实践模式
            </Button>
          ) : (
            <p className="text-xs text-stone-400">填 DeepSeek Key 后可做模式分析</p>
          )
        ) : (
          <p className="text-xs text-stone-400">应用记录满 5 条后，AI 帮你发现实践模式（当前 {records.length} 条）</p>
        )}
      </div>
    </Card>
  )
}
