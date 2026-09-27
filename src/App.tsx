import { useEffect } from 'react'
import { Routes, Route } from 'react-router'
import Bookshelf from './pages/Bookshelf'
import BookDetail from './pages/BookDetail'
import Settings from './pages/Settings'
import Review from './pages/Review'
import { useStore } from './lib/store'

export default function App() {
  const { db } = useStore()

  // 电纸书模式开关 → body class
  useEffect(() => {
    document.body.classList.toggle('eink', db.settings.einkMode)
  }, [db.settings.einkMode])

  return (
    <Routes>
      <Route path="/" element={<Bookshelf />} />
      <Route path="/book/:id" element={<BookDetail />} />
      <Route path="/review" element={<Review />} />
      <Route path="/settings" element={<Settings />} />
    </Routes>
  )
}
