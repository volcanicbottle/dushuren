import localForage from 'localforage'
import { defaultSettings, type DB, type Settings } from '@/types'

localForage.config({ name: 'dushuren', storeName: 'data' })

type TableKey = 'books' | 'notes' | 'actions' | 'appRecords' | 'readingDays' | 'settings'

export async function loadTable<K extends TableKey>(key: K): Promise<DB[K] | null> {
  return (await localForage.getItem(key)) as DB[K] | null
}

export async function saveTable<K extends TableKey>(key: K, value: DB[K]): Promise<void> {
  await localForage.setItem(key, value)
}

export async function exportAll(db: DB): Promise<string> {
  return JSON.stringify({ version: 1, exportedAt: Date.now(), data: db }, null, 2)
}

export function parseImport(json: string): DB | null {
  try {
    const obj = JSON.parse(json)
    const data = obj?.data ?? obj
    if (!Array.isArray(data.books) || !Array.isArray(data.notes)) return null
    return {
      books: data.books,
      notes: data.notes,
      actions: Array.isArray(data.actions) ? data.actions : [],
      appRecords: Array.isArray(data.appRecords) ? data.appRecords : [],
      readingDays: Array.isArray(data.readingDays) ? data.readingDays : [],
      settings: { ...defaultSettings, ...((data.settings ?? {}) as Partial<Settings>) },
    }
  } catch {
    return null
  }
}
