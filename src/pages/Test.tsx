import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { db } from '@/db'
import { AppHeader, Page } from '@/components/Layout'
import { Button, Card, EmptyState, Progress, Spinner } from '@/components/ui'
import { cn, pct, shuffle, shortTitle } from '@/lib/utils'
import type { CardRecord } from '@/types'

interface QuizItem {
  card: CardRecord
  options: string[]
  correct: string
}

const TEST_SIZE = 20

export default function Test() {
  const { deckId } = useParams<{ deckId: string }>()
  const activeId = deckId ?? 'all'

  const title = useLiveQuery(async () => {
    if (activeId === 'all') return 'Все разделы'
    const deck = await db.decks.get(activeId)
    return deck ? shortTitle(deck.title) : 'Раздел'
  }, [activeId])

  const [items, setItems] = useState<QuizItem[] | null>(null)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [finished, setFinished] = useState(false)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setIndex(0)
    setSelected(null)
    setAnswered(false)
    setScore(0)
    setFinished(false)

    ;(async () => {
      const all =
        activeId === 'all'
          ? await db.cards.toArray()
          : await db.cards.where('deckId').equals(activeId).toArray()
      if (cancelled) return

      const pool = all.filter((card) => card.back.trim().length > 0)
      const chosen = shuffle(pool).slice(0, TEST_SIZE)

      const quiz = chosen.map((card) => {
        const sameDeck = pool.filter(
          (other) => other.deckId === card.deckId && other.back !== card.back,
        )
        const candidates = sameDeck.length >= 3 ? sameDeck : pool.filter((other) => other.back !== card.back)
        const uniqueBacks = Array.from(new Set(candidates.map((other) => other.back)))
        const closest = [...uniqueBacks]
          .sort((a, b) => Math.abs(a.length - card.back.length) - Math.abs(b.length - card.back.length))
          .slice(0, 8)
        const distractors = shuffle(closest).slice(0, 3)
        return {
          card,
          correct: card.back,
          options: shuffle([card.back, ...distractors]),
        }
      })
      setItems(quiz)
    })().catch(() => {
      if (!cancelled) setItems([])
    })

    return () => {
      cancelled = true
    }
  }, [activeId, round])

  const item = useMemo(
    () => (items && !finished && index < items.length ? items[index] : undefined),
    [finished, index, items],
  )

  if (items === null) {
    return (
      <Page>
        <AppHeader title="Тест" subtitle={title} back />
        <Spinner label="Готовим вопросы…" />
      </Page>
    )
  }

  if (items.length === 0) {
    return (
      <Page>
        <AppHeader title="Тест" subtitle={title} back />
        <EmptyState
          icon={<CheckCircle2 size={44} />}
          title="Нет карточек для теста"
          text="В этом разделе пока нет карточек с ответами."
          action={
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-2xl bg-indigo-600 px-5 text-sm font-medium text-white"
            >
              На главную
            </Link>
          }
        />
      </Page>
    )
  }

  if (finished || !item) {
    const percent = pct(score, items.length)
    const message =
      percent >= 90
        ? 'Отличный результат'
        : percent >= 70
          ? 'Хороший результат'
          : percent >= 50
            ? 'Неплохо, но есть что подтянуть'
            : 'Стоит повторить материал'
    return (
      <Page>
        <AppHeader title="Тест" subtitle={title} back />
        <div className="pt-6">
          <Card className="p-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-indigo-50 text-2xl font-bold text-indigo-600">
              {percent}%
            </div>
            <h2 className="mt-4 text-xl font-semibold">{message}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Правильно {score} из {items.length}
            </p>

            <div className="mt-5">
              <Progress value={percent} />
            </div>

            <div className="mt-6 space-y-2">
              <Button className="w-full" onClick={() => setRound((value) => value + 1)}>
                <RotateCcw size={16} />
                Пройти ещё раз
              </Button>
              <Link
                to={`/deck/${activeId}`}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-700"
              >
                К разделу
              </Link>
            </div>
          </Card>
        </div>
      </Page>
    )
  }

  const choose = (option: string) => {
    if (answered) return
    setSelected(option)
    setAnswered(true)
    if (option === item.correct) setScore((value) => value + 1)
  }

  const next = () => {
    if (index + 1 >= items.length) {
      setFinished(true)
      return
    }
    setIndex((value) => value + 1)
    setSelected(null)
    setAnswered(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <Page>
      <AppHeader title="Тест" subtitle={title} back />

      <div className="pt-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            Вопрос {index + 1} из {items.length}
          </span>
          <span>Правильно: {score}</span>
        </div>
        <Progress className="mt-2" value={pct(index, items.length)} />

        <Card className="mt-4 p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Вопрос</p>
          <p className="mt-2 text-lg font-medium leading-snug text-slate-900">{item.card.front}</p>

          <div className="mt-5 space-y-2">
            {item.options.map((option, optionIndex) => {
              const isCorrect = option === item.correct
              const isSelected = option === selected
              let style = 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
              if (answered) {
                if (isCorrect) {
                  style = 'border-emerald-300 bg-emerald-50 text-emerald-900'
                } else if (isSelected) {
                  style = 'border-rose-300 bg-rose-50 text-rose-900'
                } else {
                  style = 'border-slate-200 bg-white opacity-55'
                }
              }
              return (
                <button
                  key={`${option}-${optionIndex}`}
                  onClick={() => choose(option)}
                  disabled={answered}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left text-sm leading-relaxed transition-colors',
                    style,
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                      answered && isCorrect
                        ? 'bg-emerald-600 text-white'
                        : answered && isSelected
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </span>
                  <span>{option}</span>
                </button>
              )
            })}
          </div>

          {answered && (
            <div className="card-enter mt-4 flex items-center justify-between gap-3">
              <p
                className={cn(
                  'text-sm font-semibold',
                  selected === item.correct ? 'text-emerald-600' : 'text-rose-600',
                )}
              >
                {selected === item.correct ? 'Верно' : 'Неверно'}
              </p>
              <Button onClick={next}>
                {index + 1 >= items.length ? 'Результат' : 'Далее'}
              </Button>
            </div>
          )}
        </Card>

        <p className="mt-3 text-center text-[11px] text-slate-400">
          Тест не влияет на интервалы повторения — это просто проверка.
        </p>
      </div>
    </Page>
  )
}
