import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  defaultSettings,
  type ActionItem,
  type ActionStatus,
  type Book,
  type BookStatus,
  type DB,
  type Note,
  type NoteCategory,
} from '@/types'
import { loadTable, saveTable, exportAll, parseImport } from '@/lib/db'
import { pickColor, todayStr, uid } from '@/lib/helpers'
import { pullFromGist, schedulePush, setStatus } from '@/lib/sync'

interface Store {
  db: DB
  loaded: boolean
  addBook: (title: string, author: string, isbn: string, status: BookStatus) => Book
  updateBook: (id: string, patch: Partial<Book>) => void
  deleteBook: (id: string) => void
  setProgress: (id: string, progress: number) => void
  addNote: (bookId: string, rawText: string, category: NoteCategory) => Note
  updateNote: (id: string, patch: Partial<Note>) => void
  deleteNote: (id: string) => void
  addActionFromNote: (bookId: string, text: string, sourceNoteId: string) => void
  setActionStatus: (id: string, status: ActionStatus) => void
  addAppRecord: (r: Omit<DB['appRecords'][number], 'id'>) => void
  updateSettings: (p: Partial<DB['settings']>) => void
  exportJSON: () => Promise<string>
  importJSON: (json: string) => boolean
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>({
    books: [], notes: [], actions: [], appRecords: [], readingDays: [], settings: defaultSettings,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ;(async () => {
      const [books, notes, actions, appRecords, readingDays, settings] = await Promise.all([
        loadTable('books'), loadTable('notes'), loadTable('actions'),
        loadTable('appRecords'), loadTable('readingDays'), loadTable('settings'),
      ])
      const initial: DB = {
        books: books ?? [],
        notes: notes ?? [],
        actions: actions ?? [],
        appRecords: appRecords ?? [],
        readingDays: readingDays ?? [],
        settings: settings ?? defaultSettings,
      }
      setDb(initial)
      setLoaded(true)

      // 打开应用时自动从 Gist 拉取（最后写入胜出）
      const { githubToken, gistId } = initial.settings
      if (githubToken && gistId) {
        try {
          const remote = await pullFromGist(githubToken, gistId)
          const data = remote ? parseImport(remote) : null
          if (data) {
            setDb(data)
            void Promise.all([
              saveTable('books', data.books), saveTable('notes', data.notes),
              saveTable('actions', data.actions), saveTable('appRecords', data.appRecords),
              saveTable('readingDays', data.readingDays), saveTable('settings', data.settings),
            ])
          }
        } catch { /* 状态已记录在 sync 模块 */ }
      } else {
        setStatus(githubToken ? 'idle' : 'disabled', githubToken ? '尚未同步过' : '未配置云同步')
      }
    })()
  }, [])

  // 数据变更后防抖 5 秒自动上传到 Gist（跳过初次加载）
  const dbRef = useRef(db)
  dbRef.current = db
  const skipFirstPush = useRef(true)
  useEffect(() => {
    if (!loaded) return
    if (skipFirstPush.current) { skipFirstPush.current = false; return }
    schedulePush(
      () => dbRef.current,
      () => ({ token: dbRef.current.settings.githubToken, gistId: dbRef.current.settings.gistId }),
      (id) => {
        setDb((prev) => {
          const next = { ...prev, settings: { ...prev.settings, gistId: id } }
          void saveTable('settings', next.settings)
          return next
        })
      },
    )
  }, [db, loaded])

  /** 通用更新：改内存 + 落盘对应表 */
  const patch = useCallback(<K extends keyof DB>(key: K, value: DB[K]) => {
    setDb((prev) => ({ ...prev, [key]: value }))
    void saveTable(key as never, value as never)
  }, [])

  /** 阅读打卡：今天读了某本书 / 记了笔记就记一天 */
  const touchDay = useCallback((bookId: string, noteCount: number, current: DB) => {
    const today = todayStr()
    const days = [...current.readingDays]
    const idx = days.findIndex((d) => d.date === today)
    if (idx >= 0) {
      const d = days[idx]
      days[idx] = {
        ...d,
        bookIds: d.bookIds.includes(bookId) ? d.bookIds : [...d.bookIds, bookId],
        noteCount: d.noteCount + noteCount,
      }
    } else {
      days.push({ date: today, bookIds: [bookId], noteCount })
    }
    patch('readingDays', days)
  }, [patch])

  const addBook = useCallback((title: string, author: string, isbn: string, status: BookStatus) => {
    const book: Book = {
      id: uid('b_'),
      title: title.trim(),
      author: author.trim(),
      isbn: isbn.trim() || undefined,
      coverColor: pickColor(title),
      status,
      progress: status === 'done' ? 100 : 0,
      createdAt: Date.now(),
      startedAt: status === 'reading' ? Date.now() : undefined,
      finishedAt: status === 'done' ? Date.now() : undefined,
    }
    patch('books', [...db.books, book])
    return book
  }, [db.books, patch])

  const updateBook = useCallback((id: string, p: Partial<Book>) => {
    patch('books', db.books.map((b) => {
      if (b.id !== id) return b
      const next = { ...b, ...p }
      // 状态变化自动维护时间戳
      if (p.status === 'reading' && !b.startedAt) next.startedAt = Date.now()
      if (p.status === 'done' && !b.finishedAt) { next.finishedAt = Date.now(); next.progress = 100 }
      if (p.status === 'want') { next.startedAt = undefined; next.finishedAt = undefined; next.progress = 0 }
      return next
    }))
  }, [db.books, patch])

  const deleteBook = useCallback((id: string) => {
    patch('books', db.books.filter((b) => b.id !== id))
    patch('notes', db.notes.filter((n) => n.bookId !== id))
    patch('actions', db.actions.filter((a) => a.bookId !== id))
    patch('appRecords', db.appRecords.filter((r) => r.bookId !== id))
  }, [db, patch])

  const setProgress = useCallback((id: string, progress: number) => {
    const p = Math.max(0, Math.min(100, Math.round(progress)))
    const book = db.books.find((b) => b.id === id)
    if (!book) return
    updateBook(id, { progress: p, ...(p >= 100 ? { status: 'done' as BookStatus } : p > 0 && book.status === 'want' ? { status: 'reading' as BookStatus } : {}) })
    touchDay(id, 0, db)
  }, [db, updateBook, touchDay])

  const addNote = useCallback((bookId: string, rawText: string, category: NoteCategory) => {
    const note: Note = {
      id: uid('n_'),
      bookId,
      rawText: rawText.trim(),
      category,
      reviewed: false,
      createdAt: Date.now(),
    }
    patch('notes', [note, ...db.notes])
    // 「行动」类笔记自动生成可实践项
    if (category === '行动') {
      const action: ActionItem = {
        id: uid('a_'),
        bookId,
        text: rawText.trim(),
        status: '待实践',
        sourceNoteId: note.id,
        createdAt: Date.now(),
      }
      patch('actions', [action, ...db.actions])
    }
    touchDay(bookId, 1, db)
    return note
  }, [db, patch, touchDay])

  const updateNote = useCallback((id: string, p: Partial<Note>) => {
    patch('notes', db.notes.map((n) => (n.id === id ? { ...n, ...p } : n)))
  }, [db.notes, patch])

  const deleteNote = useCallback((id: string) => {
    patch('notes', db.notes.filter((n) => n.id !== id))
    patch('actions', db.actions.filter((a) => a.sourceNoteId !== id))
  }, [db.notes, db.actions, patch])

  const setActionStatus = useCallback((id: string, status: ActionStatus) => {
    patch('actions', db.actions.map((a) => (a.id === id ? { ...a, status } : a)))
  }, [db.actions, patch])

  const addActionFromNote = useCallback((bookId: string, text: string, sourceNoteId: string) => {
    // 同一笔记只生成一个行动项
    if (db.actions.some((a) => a.sourceNoteId === sourceNoteId)) return
    const action: ActionItem = {
      id: uid('a_'),
      bookId,
      text,
      status: '待实践',
      sourceNoteId,
      createdAt: Date.now(),
    }
    patch('actions', [action, ...db.actions])
  }, [db.actions, patch])

  const addAppRecord = useCallback((r: Omit<DB['appRecords'][number], 'id'>) => {
    patch('appRecords', [{ ...r, id: uid('r_') }, ...db.appRecords])
  }, [db.appRecords, patch])

  const updateSettings = useCallback((p: Partial<DB['settings']>) => {
    patch('settings', { ...db.settings, ...p })
  }, [db.settings, patch])

  const exportJSON = useCallback(() => exportAll(db), [db])

  const importJSON = useCallback((json: string) => {
    const data = parseImport(json)
    if (!data) return false
    setDb(data)
    void Promise.all([
      saveTable('books', data.books), saveTable('notes', data.notes),
      saveTable('actions', data.actions), saveTable('appRecords', data.appRecords),
      saveTable('readingDays', data.readingDays), saveTable('settings', data.settings),
    ])
    return true
  }, [])

  return (
    <Ctx.Provider value={{
      db, loaded, addBook, updateBook, deleteBook, setProgress,
      addNote, updateNote, deleteNote, addActionFromNote, setActionStatus,
      addAppRecord, updateSettings, exportJSON, importJSON,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used within StoreProvider')
  return s
}
