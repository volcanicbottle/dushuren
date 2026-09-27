export type BookStatus = 'want' | 'reading' | 'done'
export type NoteCategory = '观点' | '金句' | '行动'
export type ActionStatus = '待实践' | '实践中' | '已养成' | '放弃'

export interface Book {
  id: string
  title: string
  author: string
  isbn?: string
  coverColor: string
  status: BookStatus
  progress: number // 0-100
  createdAt: number
  startedAt?: number
  finishedAt?: number
  outline?: string
  mySummary?: string
}

export interface Note {
  id: string
  bookId: string
  rawText: string
  category: NoteCategory | '未分类'
  polished?: string
  reviewed: boolean
  finalText?: string
  createdAt: number
}

export interface ActionItem {
  id: string
  bookId: string
  text: string
  status: ActionStatus
  sourceNoteId: string
  createdAt: number
}

export interface ApplicationRecord {
  id: string
  actionId: string
  bookId: string
  date: string // YYYY-MM-DD
  applied: boolean | 'forgot'
  difficulty?: string
  improvement?: string
  reason?: string
  rawAnswer: string
}

export interface ReadingDay {
  date: string // YYYY-MM-DD
  bookIds: string[]
  noteCount: number
}

export interface Settings {
  deepseekKey: string
  githubToken: string
  gistId: string
  einkMode: boolean
  dailyQuestionEnabled: boolean
}

export interface DB {
  books: Book[]
  notes: Note[]
  actions: ActionItem[]
  appRecords: ApplicationRecord[]
  readingDays: ReadingDay[]
  settings: Settings
}

export const defaultSettings: Settings = {
  deepseekKey: '',
  githubToken: '',
  gistId: '',
  einkMode: false,
  dailyQuestionEnabled: true,
}
