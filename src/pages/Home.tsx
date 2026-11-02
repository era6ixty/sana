import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Flame, Sparkles } from 'lucide-react'
import { db } from '@/db'
import { AppHeader, BottomNav, Page } from '@/components/Layout'
import { Card, EmptyState, Progress, Spinner } from '@/components/ui'
import { cardCountLabel, pct, plural, shortTitle } from '@/lib/utils'

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function calcStreak(reviews: Array<{ reviewedAt: number }>): number {
  const days = new Set(reviews.map((r) => dayKey(r.reviewedAt)))
  if (days.size === 0) return 0
  const cursor = new Date()
  if (!days.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  let streak = 0
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export default function Home() {
  const data = useLiveQuery(async () => {
    const [decks, cards, reviews, book] = await Promise.all([
      db.decks.orderBy('order').toArray(),
      db.cards.toArray(),
      db.reviews.toArray(),
      db.settings.get('bookTitle'),
    ])
    return {
      decks,
      cards,
      reviews,
      bookTitle: (book?.value as string) || 'Карточки',
    }
  }, [])

  if (!data) {
    return (
      <Page nav>
        <AppHeader title="Sana" />
        <Spinner label="Загружаем карточки…" />
      </Page>
    )
  }

  const now = Date.now()
  const today = dayKey(now)

  let freshTotal = 0
  let dueTotal = 0
  let learnedTotal = 0
  const perDeck = new Map<string, { total: number; fresh: number; due: number; learned: number }>()
  for (const deck of data.decks) {
    perDeck.set(deck.id, { total: 0, fresh: 0, due: 0, learned: 0 })
  }
  for (const card of data.cards) {
    const stat = perDeck.get(card.deckId)
    const isNew = card.state === 0
    const isDue = !isNew && card.due <= now
    const isLearned = card.state === 2 || card.state === 3
    if (isNew) freshTotal += 1
    if (isDue) dueTotal += 1
    if (isLearned) learnedTotal += 1
    if (stat) {
      stat.total += 1
      if (isNew) stat.fresh += 1
      if (isDue) stat.due += 1
      if (isLearned) stat.learned += 1
    }
  }

  const reviewedToday = data.reviews.filter((r) => dayKey(r.reviewedAt) === today).length
  const streak = calcStreak(data.reviews)
  const heroTotal = dueTotal > 0 ? dueTotal : freshTotal

  return (
    <Page nav>
      <AppHeader
        title="Sana"
        subtitle={data.bookTitle}
        right={
          streak > 0 ? (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
              <Flame size={14} />
              {streak}
            </div>
          ) : undefined
        }
      />

      <div className="pt-4">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-600/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-indigo-100">На сегодня</p>
              <p className="mt-1 text-3xl font-bold leading-tight">
                {heroTotal > 0 ? cardCountLabel(heroTotal) : 'Всё готово'}
              </p>
              <p className="mt-1.5 text-sm text-indigo-100">
                {dueTotal > 0
                  ? `${dueTotal} ${plural(dueTotal, 'карточка ждёт', 'карточки ждут', 'карточек ждут')} повторения`
                  : freshTotal > 0
                    ? 'Новые карточки ещё не начаты'
                    : 'На сегодня повторять нечего'}
              </p>
            </div>
            <Sparkles size={28} className="shrink-0 text-indigo-200" />
          </div>

          <div className="mt-5 flex gap-2">
            <Link
              to={dueTotal > 0 ? '/review/all' : '/study/all'}
              className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-white px-4 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
            >
              {dueTotal > 0 ? 'Повторять' : 'Учить новые'}
            </Link>
            <Link
              to="/test/all"
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Тест
            </Link>
          </div>

          {reviewedToday > 0 && (
            <p className="mt-3 text-xs text-indigo-200">Сегодня повторено: {reviewedToday}</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Новые</p>
            <p className="mt-0.5 text-xl font-bold text-slate-900">{freshTotal}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">К повторению</p>
            <p className="mt-0.5 text-xl font-bold text-amber-600">{dueTotal}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Изучено</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-600">{learnedTotal}</p>
          </Card>
        </div>

        <div className="mt-6 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Разделы</h2>
            <p className="text-xs text-slate-500">{data.decks.length} разделов книги</p>
          </div>
          <Link to="/review/all" className="text-xs font-medium text-indigo-600">
            Всё повторение
          </Link>
        </div>

        {data.decks.length === 0 ? (
          <EmptyState
            title="База пуста"
            text="Загляните в настройки и пересоберите карточки из deck.json."
            action={
              <Link
                to="/settings"
                className="inline-flex h-11 items-center rounded-2xl bg-indigo-600 px-5 text-sm font-medium text-white"
              >
                Настройки
              </Link>
            }
          />
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.decks.map((deck) => {
              const stat = perDeck.get(deck.id) ?? { total: 0, fresh: 0, due: 0, learned: 0 }
              return (
                <Link key={deck.id} to={`/deck/${deck.id}`} className="group block">
                  <Card className="flex h-full flex-col p-4 transition-all group-hover:-translate-y-0.5 group-hover:border-indigo-200 group-hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">
                        {shortTitle(deck.title)}
                      </h3>
                      <ChevronRight
                        size={18}
                        className="shrink-0 text-slate-300 transition-colors group-hover:text-indigo-500"
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-500">{cardCountLabel(stat.total)}</span>
                      {stat.due > 0 ? (
                        <span className="font-medium text-amber-600">{stat.due} к повторению</span>
                      ) : stat.fresh > 0 ? (
                        <span className="font-medium text-indigo-600">{stat.fresh} новых</span>
                      ) : (
                        <span className="text-emerald-600">готово</span>
                      )}
                    </div>
                    <Progress className="mt-2" value={pct(stat.learned, stat.total)} />
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <BottomNav active="home" />
    </Page>
  )
}
