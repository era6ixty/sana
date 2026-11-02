import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ListChecks, Pencil, RotateCcw, Search } from 'lucide-react'
import { db } from '@/db'
import { AppHeader, Page } from '@/components/Layout'
import { Button, Card, Chip, EmptyState, Flag, Modal, Progress, Spinner } from '@/components/ui'
import { formatDue, stateLabel } from '@/lib/srs'
import { cardCountLabel, cn, pct, shortTitle } from '@/lib/utils'
import type { CardRecord } from '@/types'

type Filter = 'all' | 'due' | 'new' | 'learned' | 'flagged'

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'due', label: 'К повторению' },
  { key: 'new', label: 'Новые' },
  { key: 'learned', label: 'Изученные' },
  { key: 'flagged', label: 'Пометки' },
]

const FLAG_LABELS: Record<string, string> = {
  long: 'Длинная',
  short: 'Короткая',
  mixed: 'Смешанная',
  no_colon: 'Без двоеточия',
  multi: 'Мультиответ',
}

export default function Deck() {
  const { deckId } = useParams<{ deckId: string }>()
  const data = useLiveQuery(async () => {
    if (!deckId) return { deck: undefined, cards: [] as CardRecord[] }
    const [deck, cards] = await Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray(),
    ])
    return { deck, cards }
  }, [deckId])

  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<CardRecord | null>(null)
  const [form, setForm] = useState({ front: '', back: '' })
  const [saving, setSaving] = useState(false)

  if (!data) {
    return (
      <Page>
        <AppHeader title="Раздел" back />
        <Spinner label="Загружаем раздел…" />
      </Page>
    )
  }

  if (!data.deck) {
    return (
      <Page>
        <AppHeader title="Раздел не найден" back />
        <EmptyState
          icon={<BookOpen size={40} />}
          title="Раздел не найден"
          text="Возможно, база была пересобрана. Вернитесь на главную."
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

  const now = Date.now()
  const cards = [...data.cards].sort((a, b) => a.page - b.page || a.number - b.number)
  const isNew = (card: CardRecord) => card.state === 0
  const isDue = (card: CardRecord) => !isNew(card) && card.due <= now
  const isLearned = (card: CardRecord) => card.state === 2 || card.state === 3

  const counts: Record<Filter, number> = {
    all: cards.length,
    due: cards.filter(isDue).length,
    new: cards.filter(isNew).length,
    learned: cards.filter(isLearned).length,
    flagged: cards.filter((card) => card.flags.length > 0).length,
  }

  const q = query.trim().toLowerCase()
  const visible = cards.filter((card) => {
    if (filter === 'due' && !isDue(card)) return false
    if (filter === 'new' && !isNew(card)) return false
    if (filter === 'learned' && !isLearned(card)) return false
    if (filter === 'flagged' && card.flags.length === 0) return false
    if (!q) return true
    return card.front.toLowerCase().includes(q) || card.back.toLowerCase().includes(q)
  })

  const openEditor = (card: CardRecord) => {
    setEditing(card)
    setForm({ front: card.front, back: card.back })
  }

  const save = async () => {
    if (!editing || !form.front.trim() || !form.back.trim()) return
    setSaving(true)
    try {
      await db.cards.update(editing.id, {
        front: form.front.trim(),
        back: form.back.trim(),
        flags: [],
      })
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!editing) return
    if (!window.confirm('Удалить карточку? Это действие нельзя отменить.')) return
    const id = editing.id
    await db.transaction('rw', db.cards, db.reviews, async () => {
      await db.cards.delete(id)
      await db.reviews.where('cardId').equals(id).delete()
    })
    if (expanded === id) setExpanded(null)
    setEditing(null)
  }

  const learned = cards.filter(isLearned).length

  return (
    <Page>
      <AppHeader
        title={shortTitle(data.deck.title)}
        subtitle={cardCountLabel(cards.length)}
        back
      />

      <div className="pt-4">
        <div className="grid grid-cols-3 gap-2">
          <Link
            to={`/study/${data.deck.id}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            <BookOpen size={16} />
            Учить
          </Link>
          <Link
            to={`/review/${data.deck.id}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <RotateCcw size={16} />
            Повторять
          </Link>
          <Link
            to={`/test/${data.deck.id}`}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <ListChecks size={16} />
            Тест
          </Link>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              Изучено {learned} из {cards.length}
            </span>
            <span>{pct(learned, cards.length)}%</span>
          </div>
          <Progress className="mt-2" value={pct(learned, cards.length)} />
        </div>

        <div className="relative mt-5">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по вопросу или ответу"
            className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="-mx-4 mt-3 flex flex-wrap gap-2 px-4 pb-1">
          {FILTERS.map((item) => (
            <Chip key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>
              {item.label}
              <span className={cn('ml-1 text-[11px]', filter === item.key ? 'text-white/70' : 'text-slate-400')}>
                {counts[item.key]}
              </span>
            </Chip>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<Search size={36} />}
            title="Ничего не найдено"
            text={query ? 'Попробуйте другой запрос или сбросьте фильтр.' : 'В этом фильтре пока нет карточек.'}
            action={
              (query || filter !== 'all') && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('')
                    setFilter('all')
                  }}
                >
                  Сбросить
                </Button>
              )
            }
          />
        ) : (
          <div className="mt-4 space-y-2">
            {visible.map((card) => {
              const open = expanded === card.id
              return (
                <Card key={card.id} className="overflow-hidden">
                  <div className="flex items-start gap-1 p-3">
                    <button
                      onClick={() => setExpanded(open ? null : card.id)}
                      className="min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left"
                      aria-expanded={open}
                    >
                      <p className={cn('text-sm font-medium leading-snug text-slate-800', !open && 'line-clamp-2')}>
                        {card.front}
                      </p>
                      {open && (
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                          {card.back}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
                        <span>
                          стр. {card.page} · №{card.number}
                        </span>
                        <span>·</span>
                        <span>{stateLabel(card.state)}</span>
                        <span>·</span>
                        <span>{card.state === 0 ? 'ещё не начата' : formatDue(card.due)}</span>
                        {card.flags.length > 0 && (
                          <Flag label={FLAG_LABELS[card.flags[0]] ?? 'Проверить'} />
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => openEditor(card)}
                      className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      aria-label="Редактировать карточку"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Modal open={editing !== null} title="Редактировать карточку" onClose={() => setEditing(null)}>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="card-front">
              Вопрос
            </label>
            <textarea
              id="card-front"
              value={form.front}
              onChange={(event) => setForm((prev) => ({ ...prev, front: event.target.value }))}
              rows={4}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="card-back">
              Ответ
            </label>
            <textarea
              id="card-back"
              value={form.back}
              onChange={(event) => setForm((prev) => ({ ...prev, back: event.target.value }))}
              rows={4}
              className="w-full resize-y rounded-2xl border border-slate-200 bg-white p-3 text-sm leading-relaxed outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            При сохранении пометки конвертера снимаются: карточка считается проверенной.
          </p>
          <div className="flex items-center justify-between gap-2 pt-1">
            <Button variant="danger" size="sm" onClick={remove}>
              Удалить
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                Отмена
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={saving || !form.front.trim() || !form.back.trim()}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </Page>
  )
}
