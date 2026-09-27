import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useStore } from '@/lib/store'
import { daysSince, formatDate } from '@/lib/helpers'
import { classifyNote, generateOutline, summaryDraft } from '@/lib/ai'
import type { ActionStatus, Book, BookStatus, Note, NoteCategory } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, BookOpenCheck, Check, ChevronDown, Lightbulb, Loader2, Pencil,
  Quote, Send, Sparkles, Target, Trash2,
} from 'lucide-react'

const CATS: { key: NoteCategory; icon: typeof Lightbulb; color: string }[] = [
  { key: '观点', icon: Lightbulb, color: 'text-amber-600' },
  { key: '金句', icon: Quote, color: 'text-emerald-600' },
  { key: '行动', icon: Target, color: 'text-sky-600' },
]
const ACTION_FLOW: ActionStatus[] = ['待实践', '实践中', '已养成', '放弃']

export default function BookDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const {
    db, updateBook, deleteBook, setProgress,
    addNote, updateNote, deleteNote, addActionFromNote, setActionStatus,
  } = useStore()
  const book = db.books.find((b) => b.id === id)
  const aiKey = db.settings.deepseekKey
  const [text, setText] = useState('')
  const [cat, setCat] = useState<NoteCategory>('观点')
  const [filter, setFilter] = useState<NoteCategory | '全部'>('全部')
  const [aiBusy, setAiBusy] = useState(false)

  const notes = useMemo(
    () => db.notes.filter((n) => n.bookId === id && (filter === '全部' || n.category === filter)),
    [db.notes, id, filter],
  )
  const actions = useMemo(() => db.actions.filter((a) => a.bookId === id), [db.actions, id])

  if (!book) {
    return (
      <div className="p-8 text-center text-stone-500">
        书不存在或已删除
        <Button variant="link" onClick={() => nav('/')}>回书架</Button>
      </div>
    )
  }

  /** 有 key：AI 自动归类 + 出草稿；无 key：用手动选的分类（降级，不阻塞） */
  const submitNote = () => {
    const raw = text.trim()
    if (!raw) return
    setText('')
    if (!aiKey) {
      addNote(book.id, raw, cat)
      return
    }
    const note = addNote(book.id, raw, '观点') // 先落库，AI 稍后改归类
    updateNote(note.id, { category: '未分类' })
    setAiBusy(true)
    classifyNote(aiKey, raw)
      .then(({ category, polished }) => {
        updateNote(note.id, { category, polished })
        if (category === '行动') addActionFromNote(book.id, polished.split('\n')[0].replace(/^[•\-\s]+/, ''), note.id)
      })
      .catch(() => updateNote(note.id, { category: cat })) // AI 失败降级为手动分类
      .finally(() => setAiBusy(false))
  }

  const doOutline = async () => {
    if (!aiKey) return
    setAiBusy(true)
    try {
      const outline = await generateOutline(aiKey, book.title, book.author)
      updateBook(book.id, { outline })
    } catch { /* 静默，按钮处提示 */ }
    setAiBusy(false)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-44 pt-4">
      {/* 头部 */}
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav('/')} aria-label="返回">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm text-stone-400">书籍档案</span>
      </div>

      <Card className="p-4">
        <div className="flex gap-3">
          <div
            className="flex h-28 w-20 shrink-0 items-center justify-center rounded-md p-1 text-center text-sm font-bold text-white"
            style={{ backgroundColor: book.coverColor }}
          >
            {book.title.slice(0, 8)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-stone-800">{book.title}</h2>
            <p className="text-sm text-stone-500">{book.author || '未知作者'}</p>
            {book.isbn && <p className="mt-0.5 text-xs text-stone-400">ISBN {book.isbn}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(['want', 'reading', 'done'] as BookStatus[]).map((s) => (
                <Badge
                  key={s}
                  variant={book.status === s ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => updateBook(book.id, { status: s })}
                >
                  {{ want: '想读', reading: '在读', done: '读完' }[s]}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        {book.status !== 'want' && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm text-stone-600">
              <span>进度 {book.progress}%{book.startedAt && book.status === 'reading' ? ` · 已投入 ${daysSince(book.startedAt)} 天` : ''}</span>
              <span className="text-xs text-stone-400">还剩 {100 - book.progress}% 通关</span>
            </div>
            <Progress value={book.progress} className="mt-1.5 h-2.5" />
            <div className="mt-2 flex gap-2">
              {[10, 20].map((d) => (
                <Button key={d} size="sm" variant="outline" onClick={() => setProgress(book.id, book.progress + d)}>
                  +{d}%
                </Button>
              ))}
              <Button size="sm" variant="outline" onClick={() => setProgress(book.id, 100)}>读完了 🎉</Button>
            </div>
          </div>
        )}
      </Card>

      {/* AI 大纲 */}
      <OutlineSection book={book} aiKey={aiKey} busy={aiBusy} onGenerate={doOutline} />

      {/* 我的总结 */}
      <SummarySection book={book} aiKey={aiKey} notes={db.notes.filter((n) => n.bookId === book.id)} onSave={(s) => updateBook(book.id, { mySummary: s })} />

      {/* 行动清单 */}
      {actions.length > 0 && (
        <Card className="mt-3 p-4">
          <h3 className="mb-2 text-sm font-semibold text-stone-700">行动清单（{actions.length}）</h3>
          <div className="space-y-2">
            {actions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-md bg-stone-50 px-3 py-2">
                <span className={`min-w-0 flex-1 truncate text-sm ${a.status === '放弃' ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                  {a.text}
                </span>
                <Button
                  size="sm"
                  variant={a.status === '已养成' ? 'default' : 'outline'}
                  className="shrink-0"
                  onClick={() => setActionStatus(a.id, ACTION_FLOW[(ACTION_FLOW.indexOf(a.status) + 1) % ACTION_FLOW.length])}
                >
                  {a.status}
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-400">点状态按钮推进：待实践 → 实践中 → 已养成（或放弃）。「今日一问」会针对实践中的行动提问。</p>
        </Card>
      )}

      {/* 笔记流 */}
      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">笔记（{db.notes.filter((n) => n.bookId === id).length}）</h3>
          <div className="flex gap-1">
            {(['全部', '观点', '金句', '行动'] as const).map((c) => (
              <Badge key={c} variant={filter === c ? 'default' : 'outline'} className="cursor-pointer text-xs" onClick={() => setFilter(c)}>
                {c}
              </Badge>
            ))}
          </div>
        </div>
        {notes.length === 0 ? (
          <p className="py-10 text-center text-sm text-stone-400">还没有笔记。读到有感觉的地方，一句话记下来。</p>
        ) : (
          <div className="space-y-2">
            {notes.map((n) => (
              <NoteCard key={n.id} note={n} onDelete={() => deleteNote(n.id)} onSaveFinal={(t) => updateNote(n.id, { finalText: t, reviewed: true })} />
            ))}
          </div>
        )}
      </div>

      {/* 删除书籍 */}
      <div className="my-6 border-t pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-stone-400">
              <Trash2 className="mr-1 h-4 w-4" /> 删除这本书（连同笔记）
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除《{book.title}》？</AlertDialogTitle>
              <AlertDialogDescription>这本书的所有笔记、行动清单和应用记录会一并删除，且无法恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => { deleteBook(book.id); nav('/') }}>删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* 底部固定输入框 */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-2xl p-3">
          {!aiKey && (
            <div className="mb-2 flex gap-1.5">
              {CATS.map(({ key, icon: Icon, color }) => (
                <Button key={key} size="sm" variant={cat === key ? 'default' : 'outline'} onClick={() => setCat(key)} className="gap-1">
                  <Icon className={`h-3.5 w-3.5 ${cat === key ? '' : color}`} /> {key}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitNote() } }}
              placeholder={aiKey ? '一句话记下来，AI 自动归类整理（回车发送）' : '一句话记下来（回车发送，Shift+回车换行）'}
              className="min-h-[44px] flex-1 resize-none"
              rows={1}
            />
            <Button size="icon" className="h-11 w-11 shrink-0" onClick={submitNote} disabled={!text.trim()} aria-label="发送">
              {aiBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </Button>
          </div>
          {aiKey && <p className="mt-1 text-xs text-stone-400">AI 会出分点草稿并标记「待校对」，最终文字以你校对后的定稿为准</p>}
        </div>
      </div>
    </div>
  )
}

/* ---------- AI 大纲 ---------- */
function OutlineSection({ book, aiKey, busy, onGenerate }: { book: Book; aiKey: string; busy: boolean; onGenerate: () => void }) {
  const [open, setOpen] = useState(true)
  if (!book.outline) {
    return (
      <Card className="mt-3 border-dashed p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-stone-500">📑 AI 大纲：梳理全书结构，帮你抓骨架</p>
          {aiKey ? (
            <Button size="sm" variant="outline" onClick={onGenerate} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
              生成大纲
            </Button>
          ) : (
            <span className="text-xs text-stone-400">填 DeepSeek Key 后可用</span>
          )}
        </div>
      </Card>
    )
  }
  return (
    <Card className="mt-3 p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-semibold text-stone-700">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} /> AI 大纲
          </CollapsibleTrigger>
          <Button size="sm" variant="ghost" onClick={onGenerate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : '重新生成'}
          </Button>
        </div>
        <CollapsibleContent>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{book.outline}</p>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

/* ---------- 我的总结 ---------- */
function SummarySection({ book, aiKey, notes, onSave }: { book: Book; aiKey: string; notes: Note[]; onSave: (s: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(book.mySummary ?? '')
  const [busy, setBusy] = useState(false)

  const aiDraft = async () => {
    if (!aiKey || notes.length === 0) return
    setBusy(true)
    try {
      const t = await summaryDraft(aiKey, book.title, notes.map((n) => ({ category: n.category, text: n.finalText ?? n.rawText })))
      setDraft(t)
      setEditing(true)
    } catch { /* 静默 */ }
    setBusy(false)
  }

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-stone-700">
          <BookOpenCheck className="h-4 w-4" /> 我的总结
        </h3>
        {!editing && (
          <div className="flex gap-1">
            {aiKey && notes.length > 0 && (
              <Button size="sm" variant="ghost" onClick={aiDraft} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}AI 起草
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" />{book.mySummary ? '修改' : '写总结'}
            </Button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} placeholder="用自己的话总结这本书——这一步谁也替代不了" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { onSave(draft.trim()); setEditing(false) }}>保存</Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(book.mySummary ?? ''); setEditing(false) }}>取消</Button>
          </div>
          <p className="text-xs text-stone-400">AI 草稿只是参考，保存的是你的文字</p>
        </div>
      ) : book.mySummary ? (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">{book.mySummary}</p>
      ) : (
        <p className="mt-2 text-sm text-stone-400">读完后，用你自己的话给这本书做个总结。</p>
      )}
    </Card>
  )
}

/* ---------- 笔记卡片（含 AI 草稿 + 校对流程） ---------- */
function NoteCard({ note, onDelete, onSaveFinal }: { note: Note; onDelete: () => void; onSaveFinal: (t: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const meta = CATS.find((c) => c.key === note.category)
  const Icon = meta?.icon ?? Lightbulb
  const hasDraft = !!note.polished && !note.reviewed

  return (
    <Card className="group p-3">
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta?.color ?? 'text-stone-400'}`} />
        <div className="min-w-0 flex-1">
          {/* 定稿 / 原话 */}
          {!editing && <p className="whitespace-pre-wrap text-sm text-stone-800">{note.finalText ?? note.rawText}</p>}

          {/* AI 草稿（待校对） */}
          {hasDraft && !editing && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <Badge variant="outline" className="border-amber-300 text-xs text-amber-700">AI 草稿 · 待校对</Badge>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setDraft(note.polished ?? ''); setEditing(true) }}>
                  <Pencil className="mr-1 h-3 w-3" /> 校对改写
                </Button>
              </div>
              <p className="whitespace-pre-wrap text-sm text-stone-600">{note.polished}</p>
            </div>
          )}

          {/* 校对编辑态 */}
          {editing && (
            <div className="mt-2 space-y-2">
              <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} autoFocus />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { onSaveFinal(draft.trim()); setEditing(false) }}>存为定稿</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>取消</Button>
              </div>
            </div>
          )}

          <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
            <Badge variant="secondary" className="text-xs">{note.category}</Badge>
            <span>{formatDate(note.createdAt)}</span>
            {note.reviewed && (
              <span className="inline-flex items-center gap-0.5 text-emerald-600"><Check className="h-3 w-3" /> 已校对</span>
            )}
            {!note.reviewed && !hasDraft && note.category !== '未分类' && (
              <button className="text-stone-300 hover:text-stone-500" onClick={() => { setDraft(note.finalText ?? note.rawText); setEditing(true) }}>编辑定稿</button>
            )}
            <button className="ml-auto opacity-0 transition-opacity group-hover:opacity-100" onClick={onDelete} aria-label="删除笔记">
              <Trash2 className="h-3.5 w-3.5 text-stone-300 hover:text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </Card>
  )
}
