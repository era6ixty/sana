import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { db } from '@/db'
import { AppHeader, Page } from '@/components/Layout'
import { Flashcard } from '@/components/Flashcard'
import { Button, Card, EmptyState, Progress, Spinner } from '@/components/ui'
import { Rating, scheduleCard } from '@/lib/srs'
import { cn, pct, shortTitle } from '@/lib/utils'
import type { CardRecord } from '@/types'

type StudyRating = Rating.Again | Rating.Good | Rating.Easy

const SESSION_SIZE = 30

export default function Study() {
  const { deckId } = useParams<{ deckId: string }>()
  const activeId = deckId ?? 'all'

  const title = useLiveQuery(async () => {
    if (activeId === 'all') return 'Все разделы'
    const deck = await db.decks.get(activeId)
    return deck ? shortTitle(deck.title) : 'Раздел'
  }, [activeId])

  const [queue, setQueue] = useState<CardRecord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [round, setRound] = useState(0)
  const [stats, setStats] = useState({ again: 0, good: 0, easy: 0 })

  useEffect(() => {
    let cancelled = false
    setQueue(null)
    setIndex(0)
    setFlipped(false)
    setError('')
    setStats({ again: 0, good: 0, easy: 0 })

    ;(async () => {
      const all =
        activeId === 'all'
          ? await db.cards.toArray()
          : await db.cards.where('deckId').equals(activeId).toArray()
      if (cancelled) return

      const now = Date.now()
      const fresh = all.filter((card) => card.state === 0)
      const due = all.filter((card) => card.state !== 0 && card.due <= now)
      const mixed = [...fresh.sort(() => Math.random() - 0.5), ...due.sort(() => Math.random() - 0.5)]
      setQueue(mixed.slice(0, SESSION_SIZE))
    })().catch(() => {
      if (!cancelled) setQueue([])
    })

    return () => {
      cancelled = true
    }
  }, [activeId, round])

  const current = queue && index < queue.length ? queue[index] : undefined

  const rate = useCallback(
    async (rating: StudyRating) => {
      if (!current || !flipped || busy) return
      setBusy(true)
      setError('')
      try {
        const now = new Date()
        const { fields } = scheduleCard(current, rating, now)
        await db.transaction('rw', db.cards, db.reviews, async () => {
          await db.cards.update(current.id, fields)
          await db.reviews.add({
            cardId: current.id,
            deckId: current.deckId,
            rating,
            reviewedAt: now.getTime(),
            due: fields.due,
          })
        })
        setStats((prev) => ({
          again: prev.again + (rating === Rating.Again ? 1 : 0),
          good: prev.good + (rating === Rating.Good ? 1 : 0),
          easy: prev.easy + (rating === Rating.Easy ? 1 : 0),
        }))
        setFlipped(false)
        setIndex((value) => value + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } catch {
        setError('Не удалось сохранить оценку. Попробуйте ещё раз.')
      } finally {
        setBusy(false)
      }
    },
    [busy, current, flipped],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return

      if (event.code === 'Space' || event.key === 'Enter') {
        event.preventDefault()
        if (!flipped) setFlipped(true)
        return
      }
      if (!flipped) return
      if (event.key === '1') void rate(Rating.Again)
      if (event.key === '2') void rate(Rating.Good)
      if (event.key === '3') void rate(Rating.Easy)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, rate])

  if (queue === null) {
    return (
      <Page>
        <AppHeader title="Учёба" subtitle={title} back />
        <Spinner label="Собираем сессию…" />
      </Page>
    )
  }

  if (queue.length === 0) {
    return (
      <Page>
        <AppHeader title="Учёба" subtitle={title} back />
        <EmptyState
          icon={<CheckCircle2 size={44} />}
          title="Нечего учить"
          text="В этом разделе нет новых или просроченных карточек. Можно перейти к повторению или выбрать другой раздел."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                to={`/review/${activeId}`}
                className="inline-flex h-11 items-center rounded-2xl bg-indigo-600 px-5 text-sm font-medium text-white"
              >
                К повторению
              </Link>
              <Link
                to="/"
                className="inline-flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700"
              >
                На главную
              </Link>
            </div>
          }
        />
      </Page>
    )
  }

  if (index >= queue.length) {
    const total = stats.again + stats.good + stats.easy
    return (
      <Page>
        <AppHeader title="Учёба" subtitle={title} back />
        <div className="pt-6">
          <Card className="p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="mt-4 text-xl font-semibold">Сессия завершена</h2>
            <p className="mt-1 text-sm text-slate-500">Пройдено {total} карточек</p>

            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-rose-50 p-3">
                <p className="text-lg font-bold text-rose-600">{stats.again}</p>
                <p className="text-[11px] text-rose-500">Не знаю</p>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-3">
                <p className="text-lg font-bold text-indigo-600">{stats.good}</p>
                <p className="text-[11px] text-indigo-500">Знаю</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-lg font-bold text-emerald-600">{stats.easy}</p>
                <p className="text-[11px] text-emerald-500">Легко</p>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <Button className="w-full" onClick={() => setRound((value) => value + 1)}>
                <RotateCcw size={16} />
                Ещё 30 карточек
              </Button>
              <Link
                to="/"
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-700"
              >
                На главную
              </Link>
            </div>
          </Card>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <AppHeader title="Учёба" subtitle={title} back />

      <div className="pt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Карточка {index + 1} из {queue.length}
          </span>
          <span>{pct(index, queue.length)}%</span>
        </div>
        <Progress className="mt-2" value={pct(index, queue.length)} />

        {current && (
          <>
            <div className="mt-4">
              <Flashcard card={current} flipped={flipped} onFlip={() => setFlipped((value) => !value)} />
            </div>

            {error && <p className="mt-3 text-center text-xs text-rose-600">{error}</p>}

            {flipped ? (
              <div className="card-enter mt-4 grid grid-cols-3 gap-2">
                <button
                  onClick={() => void rate(Rating.Again)}
                  disabled={busy}
                  className={cn(
                    'flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-rose-200 bg-rose-50 px-2 py-3 text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50',
                  )}
                >
                  <span className="text-sm font-semibold">Не знаю</span>
                  <span className="text-[10px] opacity-70">ещё раз</span>
                </button>
                <button
                  onClick={() => void rate(Rating.Good)}
                  disabled={busy}
                  className="flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-indigo-600 px-2 py-3 text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                  <span className="text-sm font-semibold">Знаю</span>
                  <span className="text-[10px] text-indigo-200">запомнил</span>
                </button>
                <button
                  onClick={() => void rate(Rating.Easy)}
                  disabled={busy}
                  className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-2 py-3 text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  <span className="text-sm font-semibold">Легко</span>
                  <span className="text-[10px] opacity-70">слишком просто</span>
                </button>
              </div>
            ) : (
              <p className="mt-4 text-center text-xs text-slate-400">
                Нажмите на карточку или пробел, чтобы увидеть ответ
              </p>
            )}

            <p className="mt-3 hidden text-center text-[11px] text-slate-300 sm:block">
              Клавиши: пробел — перевернуть, 1 / 2 / 3 — оценка
            </p>
          </>
        )}
      </div>
    </Page>
  )
}
