export interface Deck {
  id: string
  title: string
  subtitle?: string
  order: number
  cardCount: number
  sourcePage: number
}

export interface CardRecord {
  id: string
  deckId: string
  front: string
  back: string
  page: number
  number: number
  flags: string[]
  createdAt: number

  // FSRS
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: number
  last_review?: number
}

export interface ReviewRecord {
  id?: number
  cardId: string
  deckId: string
  rating: number
  reviewedAt: number
  due: number
}

export interface DeckJsonCard {
  id: string
  front: string
  back: string
  page: number
  number: number
  flags: string[]
}

export interface DeckJson {
  version: number
  title: string
  source: string
  createdAt: string
  decks: Array<{
    id: string
    title: string
    subtitle?: string
    pageStart: number
    pageEnd: number
    cardCount: number
    cards: DeckJsonCard[]
  }>
  stats: {
    pages: number
    decks: number
    cards: number
    flagged: number
    duplicatesSkipped: number
    skippedPages: Array<{ page: number; badges: number; reason: string }>
  }
}
