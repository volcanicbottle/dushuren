import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useStore } from '@/lib/store'
import { calcStreak, daysSince, COVER_COLORS } from '@/lib/helpers'
import type { Book, BookStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Plus, Settings as SettingsIcon, Flame, Library } from 'lucide-react'
import DailyQuestion from '@/components/DailyQuestion'

const STATUS_LABEL: Record<BookStatus, string> = { want: '想读', reading: '在读', done: '读完' }

export default function Bookshelf() {
  const { db } = useStore()
  const [tab, setTab] = useState<BookStatus>('reading')
  const streak = calcStreak(db.readingDays)
  const books = db.books.filter((b) => b.status === tab)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">读书人</h1>
          <p className="mt-1 text-sm text-stone-500">
            {streak > 0 ? (
              <span className="inline-flex items-center gap-1 text-amber-700">
                <Flame className="h-4 w-4" /> 已连续阅读 {streak} 天
              </span>
            ) : '今天开始，留下第一条记录吧'}
          </p>
        </div>
        <div className="flex gap-1">
          <Link to="/review">
            <Button variant="ghost" size="icon" aria-label="回顾">
              <Library className="h-5 w-5 text-stone-600" />
            </Button>
          </Link>
          <Link to="/settings">
            <Button variant="ghost" size="icon" aria-label="设置">
              <SettingsIcon className="h-5 w-5 text-stone-600" />
            </Button>
          </Link>
        </div>
      </header>

      <DailyQuestion />

      <Tabs value={tab} onValueChange={(v) => setTab(v as BookStatus)}>
        <TabsList className="grid w-full grid-cols-3">
          {(['want', 'reading', 'done'] as BookStatus[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {STATUS_LABEL[s]}（{db.books.filter((b) => b.status === s).length}）
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 space-y-3">
        {books.length === 0 && (
          <p className="py-16 text-center text-sm text-stone-400">
            {tab === 'want' ? '把心动的书先放进「想读」' : tab === 'reading' ? '没有在读的书，从想读里挑一本开始' : '读完的书会在这里沉淀成资产'}
          </p>
        )}
        {books.map((b) => (
          <BookCard key={b.id} book={b} noteCount={db.notes.filter((n) => n.bookId === b.id).length} />
        ))}
      </div>

      <AddBookDialog defaultStatus={tab} />
    </div>
  )
}

function BookCard({ book, noteCount }: { book: Book; noteCount: number }) {
  const nav = useNavigate()
  return (
    <Card
      className="flex cursor-pointer gap-3 p-3 transition-shadow hover:shadow-md"
      onClick={() => nav(`/book/${book.id}`)}
    >
      <div
        className="flex h-24 w-16 shrink-0 items-center justify-center rounded-md p-1 text-center text-xs font-bold text-white"
        style={{ backgroundColor: book.coverColor }}
      >
        {book.title.slice(0, 6)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-semibold text-stone-800">{book.title}</h3>
          {noteCount > 0 && <Badge variant="secondary" className="shrink-0">{noteCount} 条笔记</Badge>}
        </div>
        <p className="mt-0.5 truncate text-sm text-stone-500">{book.author || '未知作者'}</p>
        {book.status === 'reading' && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span>{book.progress}% · 还剩 {100 - book.progress}% 通关</span>
              {book.startedAt && <span>已读 {daysSince(book.startedAt)} 天</span>}
            </div>
            <Progress value={book.progress} className="mt-1 h-2" />
          </div>
        )}
        {book.status === 'done' && book.finishedAt && (
          <p className="mt-2 text-xs text-stone-400">
            {book.startedAt ? `用了 ${daysSince(book.startedAt)} 天读完` : '已读完'}
          </p>
        )}
      </div>
    </Card>
  )
}

function AddBookDialog({ defaultStatus }: { defaultStatus: BookStatus }) {
  const { addBook } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [isbn, setIsbn] = useState('')
  const [status, setStatus] = useState<BookStatus>(defaultStatus)

  const submit = () => {
    if (!title.trim()) return
    const book = addBook(title, author, isbn, status)
    setOpen(false)
    setTitle(''); setAuthor(''); setIsbn('')
    nav(`/book/${book.id}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg" size="icon" aria-label="加书">
          <Plus className="h-6 w-6" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>加一本书</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="t">书名 *</Label>
            <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="书名" autoFocus />
          </div>
          <div>
            <Label htmlFor="a">作者</Label>
            <Input id="a" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="作者" />
          </div>
          <div>
            <Label htmlFor="i">ISBN（选填，用于精确标识版本）</Label>
            <Input id="i" value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978..." />
          </div>
          <div>
            <Label>状态</Label>
            <div className="mt-1 flex gap-2">
              {(['want', 'reading', 'done'] as BookStatus[]).map((s) => (
                <Button key={s} size="sm" variant={status === s ? 'default' : 'outline'} onClick={() => setStatus(s)}>
                  {STATUS_LABEL[s]}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>封面颜色</Label>
            <div className="mt-1 flex gap-1.5">
              {COVER_COLORS.slice(0, 5).map((c) => (
                <span key={c} className="h-6 w-6 rounded-full" style={{ backgroundColor: c }} />
              ))}
              <span className="ml-1 self-center text-xs text-stone-400">按书名自动选色</span>
            </div>
          </div>
          <Button className="w-full" onClick={submit} disabled={!title.trim()}>放入书架</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
