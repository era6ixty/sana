import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, Database, Download, Info, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { db, exportData, importData, reseed, resetProgress } from '@/db'
import { AppHeader, BottomNav, Page } from '@/components/Layout'
import { Button, Card, Spinner } from '@/components/ui'
import { cardCountLabel, downloadJson, plural } from '@/lib/utils'

type Status = { kind: 'ok' | 'error'; text: string } | null

export default function Settings() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>(null)
  const [working, setWorking] = useState<string | null>(null)

  const info = useLiveQuery(async () => {
    const [decks, allCards, reviews, book, source] = await Promise.all([
      db.decks.orderBy('order').toArray(),
      db.cards.toArray(),
      db.reviews.count(),
      db.settings.get('bookTitle'),
      db.settings.get('source'),
    ])
    return {
      decks,
      cards: allCards.length,
      learned: allCards.filter((card) => card.state === 2 || card.state === 3).length,
      flagged: allCards.filter((card) => card.flags.length > 0).length,
      reviews,
      bookTitle: (book?.value as string) || 'Карточки',
      source: (source?.value as string) || '',
    }
  }, [])

  const run = async (key: string, action: () => Promise<void>, okText: string) => {
    setWorking(key)
    setStatus(null)
    try {
      await action()
      setStatus({ kind: 'ok', text: okText })
    } catch (error) {
      setStatus({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Не удалось выполнить действие.',
      })
    } finally {
      setWorking(null)
    }
  }

  const handleExport = () =>
    run(
      'export',
      async () => {
        const data = await exportData()
        downloadJson(`sana-${new Date().toISOString().slice(0, 10)}.json`, data)
      },
      'Резервная копия скачана.',
    )

  const handleImport = async (file: File) => {
    await run(
      'import',
      async () => {
        const text = await file.text()
        const parsed = JSON.parse(text)
        await importData(parsed)
      },
      'Резервная копия загружена.',
    )
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleReset = () => {
    if (!window.confirm('Сбросить весь прогресс? Карточки останутся, оценки и повторения исчезнут.')) {
      return
    }
    void run('reset', resetProgress, 'Прогресс сброшен.')
  }

  const handleReseed = () => {
    if (
      !window.confirm(
        'Пересобрать базу из public/deck.json? Все правки карточек и весь прогресс будут удалены.',
      )
    ) {
      return
    }
    void run('reseed', reseed, 'База пересобрана из deck.json.')
  }

  if (!info) {
    return (
      <Page nav>
        <AppHeader title="Настройки" />
        <Spinner label="Загружаем данные…" />
      </Page>
    )
  }

  return (
    <Page nav>
      <AppHeader title="Настройки" subtitle={info.bookTitle} />

      <div className="space-y-5 pt-4">
        {status && (
          <div
            className={
              status.kind === 'ok'
                ? 'rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                : 'rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800'
            }
          >
            {status.text}
          </div>
        )}

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Статистика
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Карточки</p>
              <p className="mt-1 text-2xl font-bold">{info.cards}</p>
              <p className="text-[11px] text-slate-400">в {info.decks.length} разделах</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Повторения</p>
              <p className="mt-1 text-2xl font-bold">{info.reviews}</p>
              <p className="text-[11px] text-slate-400">
                Сохранено оценок: {info.reviews}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Изучено</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{info.learned}</p>
              <p className="text-[11px] text-slate-400">перешли в повторение</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">На проверку</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{info.flagged}</p>
              <p className="text-[11px] text-slate-400">пометок конвертера</p>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Резервная копия
          </h2>
          <Card className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Download size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Экспорт</p>
                <p className="text-[11px] text-slate-400">Карточки, оценки и настройки в JSON</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                disabled={working !== null}
              >
                {working === 'export' ? '…' : 'Скачать'}
              </Button>
            </div>
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Upload size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Импорт</p>
                <p className="text-[11px] text-slate-400">Заменить базу из резервной копии</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={working !== null}
              >
                {working === 'import' ? '…' : 'Выбрать'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleImport(file)
                }}
              />
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Обслуживание
          </h2>
          <Card className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <RotateCcw size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Сбросить прогресс</p>
                <p className="text-[11px] text-slate-400">Оставить карточки, но начать заново</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
                disabled={working !== null}
              >
                {working === 'reset' ? '…' : 'Сбросить'}
              </Button>
            </div>
            <div className="flex items-center gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <RefreshCw size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Пересобрать из deck.json</p>
                <p className="text-[11px] text-slate-400">Удалит правки и прогресс</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleReseed} disabled={working !== null}>
                {working === 'reseed' ? '…' : 'Собрать'}
              </Button>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            О приложении
          </h2>
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-sm font-bold text-white">
                S
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Sana</p>
                <p className="text-[11px] text-slate-400">Версия 0.1 · локальные карточки</p>
              </div>
            </div>

            <div className="mt-4 space-y-2 text-xs leading-relaxed text-slate-500">
              <p>
                Данные хранятся только в этом браузере (IndexedDB). Никаких аккаунтов и серверов —
                экспорт JSON остаётся единственным способом переноса.
              </p>
              <p>
                Интервалы считает FSRS. Оценка «Не знаю» возвращает карточку скоро, «Легко» —
                откладывает дальше.
              </p>
              {info.source && (
                <p className="flex items-start gap-1.5 text-slate-400">
                  <Database size={13} className="mt-0.5 shrink-0" />
                  <span className="break-all">{info.source}</span>
                </p>
              )}
              <p className="flex items-start gap-1.5 text-slate-400">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>Материалы книги не публикуются — приложение для личного использования.</span>
              </p>
              {info.flagged > 0 && (
                <p className="flex items-start gap-1.5 text-amber-600">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span>
                    {info.flagged} {plural(info.flagged, 'карточка', 'карточки', 'карточек')} с
                    пометками конвертера — их можно поправить в разделе.
                  </span>
                </p>
              )}
            </div>
          </Card>
        </section>

        <p className="pb-2 text-center text-[11px] text-slate-300">
          {cardCountLabel(info.cards)} · {info.decks.length} разделов
        </p>
      </div>

      <BottomNav active="settings" />
    </Page>
  )
}
