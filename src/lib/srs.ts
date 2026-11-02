import {
  createEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs'
import type { CardRecord } from '../types'

export const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36500,
  enable_fuzz: false,
})

export function newSrsFields(now = Date.now()) {
  const card = createEmptyCard(new Date(now))
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : undefined,
  }
}

export function toFsrs(card: CardRecord): FsrsCard {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.last_review ? new Date(card.last_review) : undefined,
  }
}

export function scheduleCard(card: CardRecord, rating: Grade, now = new Date()) {
  const result = scheduler.repeat(toFsrs(card), now)
  const item = result[rating]
  const next = item.card
  return {
    fields: {
      due: next.due.getTime(),
      stability: next.stability,
      difficulty: next.difficulty,
      elapsed_days: next.elapsed_days,
      scheduled_days: next.scheduled_days,
      learning_steps: next.learning_steps,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      last_review: next.last_review ? next.last_review.getTime() : undefined,
    },
    log: item.log,
  }
}

export function previewIntervals(card: CardRecord) {
  const now = new Date()
  const result = scheduler.repeat(toFsrs(card), now)
  return [
    { rating: Rating.Again, key: 'again', label: 'Не знаю', interval: formatInterval(result[Rating.Again].card.due.getTime() - now.getTime()) },
    { rating: Rating.Hard, key: 'hard', label: 'Трудно', interval: formatInterval(result[Rating.Hard].card.due.getTime() - now.getTime()) },
    { rating: Rating.Good, key: 'good', label: 'Нормально', interval: formatInterval(result[Rating.Good].card.due.getTime() - now.getTime()) },
    { rating: Rating.Easy, key: 'easy', label: 'Легко', interval: formatInterval(result[Rating.Easy].card.due.getTime() - now.getTime()) },
  ]
}

export function formatInterval(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000))
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн`
  const months = Math.round(days / 30)
  if (months < 12) return `${months} мес`
  return `${Math.round(months / 12)} г`
}

export function formatDue(ts: number): string {
  const diff = ts - Date.now()
  if (diff <= 0) return 'сейчас'
  return `через ${formatInterval(diff)}`
}

export function stateLabel(state: number): string {
  switch (state) {
    case State.New:
      return 'Новая'
    case State.Learning:
      return 'Изучается'
    case State.Review:
      return 'В повторении'
    case State.Relearning:
      return 'Переучивается'
    default:
      return ''
  }
}

export { Rating, State }
