import Dexie, { type Table } from 'dexie'
import type { CardRecord, Deck, DeckJson, ReviewRecord } from './types'
import { newSrsFields } from './lib/srs'

const SEED_KEY = 'seed-v1'

export class MissingDeckError extends Error {
  constructor() {
    super('Файл deck.json не найден. Загрузите его через «Книга → Новая книга».')
    this.name = 'MissingDeckError'
  }
}

class SanaDB extends Dexie {
  decks!: Table<Deck, string>
  cards!: Table<CardRecord, string>
  reviews!: Table<ReviewRecord, number>
  settings!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('sana-db')
    this.version(1).stores({
      decks: 'id, order',
      cards: 'id, deckId, due, state, [deckId+due]',
      reviews: '++id, cardId, deckId, reviewedAt',
      settings: 'key',
    })
  }
}

export const db = new SanaDB()

async function loadDeckJson(): Promise<unknown | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}deck.json`, { cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Не удалось загрузить deck.json (HTTP ${res.status}).`)

  // На SPA-хостинге отсутствующий файл может вернуться как index.html
  // с кодом 200. В этом случае считаем, что колоды нет.
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) return null

  try {
    return await res.json()
  } catch {
    return null
  }
}

function validateDeckJson(data: unknown): asserts data is DeckJson {
  if (!data || typeof data !== 'object') {
    throw new Error('Файл не похож на deck.json.')
  }
  const typed = data as DeckJson
  if (!Array.isArray(typed.decks) || typed.decks.length === 0) {
    throw new Error('В файле нет разделов с карточками.')
  }

  for (const [index, deck] of typed.decks.entries()) {
    if (!deck || typeof deck.title !== 'string' || !Array.isArray(deck.cards) || deck.cards.length === 0) {
      throw new Error(`Раздел №${index + 1} пуст или повреждён.`)
    }
    for (const card of deck.cards) {
      if (
        !card ||
        typeof card.front !== 'string' ||
        typeof card.back !== 'string' ||
        !card.front.trim() ||
        !card.back.trim()
      ) {
        throw new Error(`В разделе «${deck.title}» есть карточка без вопроса или ответа.`)
      }
    }
  }
}

async function seedFromDeckJson(data: DeckJson): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.settings, async () => {
    await db.cards.clear()
    await db.decks.clear()
    await db.reviews.clear()

    for (const [index, deck] of data.decks.entries()) {
      const deckId = deck.id || `deck-${index + 1}`
      await db.decks.put({
        id: deckId,
        title: deck.title,
        subtitle: deck.subtitle ?? '',
        order: index,
        cardCount: deck.cards.length,
        sourcePage: deck.pageStart ?? 0,
      })
      await db.cards.bulkPut(
        deck.cards.map((card, cardIndex) => ({
          id: `${deckId}-${card.id || `c-${cardIndex + 1}`}`,
          deckId,
          front: card.front,
          back: card.back,
          page: card.page ?? 0,
          number: card.number ?? 0,
          flags: card.flags ?? [],
          createdAt: now,
          ...newSrsFields(now),
        })),
      )
    }
    await db.settings.put({ key: SEED_KEY, value: data.createdAt ?? now })
    await db.settings.put({ key: 'bookTitle', value: data.title ?? 'Карточки' })
    await db.settings.put({ key: 'source', value: data.source ?? '' })
  })
}

let seedPromise: Promise<void> | null = null

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const seeded = await db.settings.get(SEED_KEY)
      if (seeded) return
      await reseed()
    })().catch((error) => {
      seedPromise = null
      throw error
    })
  }
  return seedPromise
}

export async function reseed(): Promise<void> {
  const data = await loadDeckJson()
  if (!data) throw new MissingDeckError()
  validateDeckJson(data)
  await seedFromDeckJson(data)
}

export async function importDeckJson(data: unknown): Promise<void> {
  validateDeckJson(data)
  await seedFromDeckJson(data)
}

export async function resetProgress(): Promise<void> {
  const cards = await db.cards.toArray()
  const now = Date.now()
  await db.transaction('rw', db.cards, db.reviews, async () => {
    for (const card of cards) {
      await db.cards.update(card.id, { ...newSrsFields(now) })
    }
    await db.reviews.clear()
  })
}

export async function exportData() {
  const [decks, cards, reviews] = await Promise.all([
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ])
  return {
    app: 'sana',
    version: 1,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    reviews,
  }
}

export async function importData(data: any): Promise<void> {
  if (data?.app !== 'sana' || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    throw new Error('Это не файл резервной копии Sana.')
  }
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.settings, async () => {
    await db.cards.clear()
    await db.decks.clear()
    await db.reviews.clear()
    await db.decks.bulkPut(data.decks)
    await db.cards.bulkPut(data.cards)
    if (Array.isArray(data.reviews)) await db.reviews.bulkPut(data.reviews)
    await db.settings.put({ key: SEED_KEY, value: `import:${data.exportedAt ?? Date.now()}` })
  })
}
