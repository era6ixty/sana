import Dexie, { type Table } from 'dexie'
import type { CardRecord, Deck, ReviewRecord } from './types'
import { newSrsFields } from './lib/srs'

const SEED_KEY = 'seed-v1'

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

async function loadDeckJson() {
  const res = await fetch(`${import.meta.env.BASE_URL}deck.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Не найден public/deck.json — сначала запустите конвертер.')
  return res.json()
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
  const now = Date.now()
  await db.transaction('rw', db.decks, db.cards, db.reviews, db.settings, async () => {
    await db.cards.clear()
    await db.decks.clear()
    await db.reviews.clear()

    for (const [index, deck] of data.decks.entries()) {
      await db.decks.put({
        id: deck.id,
        title: deck.title,
        subtitle: deck.subtitle ?? '',
        order: index,
        cardCount: deck.cards.length,
        sourcePage: deck.pageStart,
      })
      await db.cards.bulkPut(
        deck.cards.map((card: any) => ({
          id: `${deck.id}-${card.id}`,
          deckId: deck.id,
          front: card.front,
          back: card.back,
          page: card.page,
          number: card.number,
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
