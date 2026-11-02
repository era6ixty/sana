import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ensureSeeded } from './db'
import Home from './pages/Home'
import Deck from './pages/Deck'
import Study from './pages/Study'
import Review from './pages/Review'
import Test from './pages/Test'
import Settings from './pages/Settings'

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6">
      {children}
    </div>
  )
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    ensureSeeded()
      .then(() => {
        if (!cancelled) setStatus('ready')
      })
      .catch((reason) => {
        if (cancelled) return
        setError(reason instanceof Error ? reason.message : 'Не удалось открыть базу карточек.')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (status === 'loading') {
    return (
      <FullScreen>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-600/30">
          S
        </div>
        <p className="mt-5 text-sm font-medium text-slate-500">Открываем Sana…</p>
        <div className="mt-4 h-1 w-36 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500" />
        </div>
      </FullScreen>
    )
  }

  if (status === 'error') {
    return (
      <FullScreen>
        <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-soft">
          <h1 className="text-lg font-semibold">Не удалось загрузить карточки</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <p className="mt-2 text-xs text-slate-400">
            Проверьте, что файл <code>public/deck.json</code> существует и собран конвертером.
          </p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Попробовать снова
          </button>
        </div>
      </FullScreen>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/deck/:deckId" element={<Deck />} />
      <Route path="/study/:deckId" element={<Study />} />
      <Route path="/review/:deckId" element={<Review />} />
      <Route path="/test/:deckId" element={<Test />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
