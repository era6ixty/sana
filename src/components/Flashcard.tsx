import type { CardRecord } from '@/types'
import { cn } from '@/lib/utils'

export function Flashcard({
  card,
  flipped,
  onFlip,
}: {
  card: CardRecord
  flipped: boolean
  onFlip: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onFlip}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          event.stopPropagation()
          onFlip()
        }
      }}
      className={cn(
        'card-enter flex min-h-[42vh] cursor-pointer select-none flex-col rounded-3xl border bg-white p-5 shadow-soft transition-colors sm:p-6',
        flipped ? 'border-indigo-200' : 'border-slate-200 hover:border-indigo-200',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>Вопрос · стр. {card.page}</span>
        <span>{flipped ? 'Ответ' : 'Нажмите, чтобы перевернуть'}</span>
      </div>

      <p className="mt-4 text-lg font-medium leading-snug text-slate-900 sm:text-xl">
        {card.front}
      </p>

      <div className="mt-5">
        {flipped ? (
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700 sm:text-lg">
              {card.back}
            </p>
          </div>
        ) : (
          <div className="flex h-16 items-center justify-center rounded-2xl border border-dashed border-slate-200 text-xs text-slate-400">
            Ответ скрыт
          </div>
        )}
      </div>

      <div className="mt-auto pt-5 text-center text-[11px] text-slate-300">
        {card.flags.length > 0 ? 'Есть пометка конвертера' : ' '}
      </div>
    </div>
  )
}
