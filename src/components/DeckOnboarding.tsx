import { useRef, useState } from 'react'
import { FileJson, RefreshCw, Upload } from 'lucide-react'
import { importData, importDeckJson } from '@/db'

export function DeckOnboarding({ onLoaded, onRetry }: { onLoaded: () => void; onRetry: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')

  const handleFile = async (file: File) => {
    setBusy(true)
    setError('')
    setFileName(file.name)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (parsed?.app === 'sana') {
        await importData(parsed)
      } else {
        await importDeckJson(parsed)
      }
      onLoaded()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось прочитать файл.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-6 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-600/30">
          S
        </div>

        <h1 className="mt-5 text-xl font-semibold">Загрузите колоду</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          В этой сборке нет текста книги — он не публикуется. Один раз выберите{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px]">deck.json</code>, созданный
          конвертером. Карточки сохранятся только в этом браузере.
        </p>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          <Upload size={17} />
          {busy ? 'Загружаем…' : 'Выбрать deck.json'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />

        <p className="mt-2 text-center text-[11px] text-slate-400">
          Резервная копия Sana тоже подойдёт — она распознаётся автоматически.
        </p>

        {fileName && !error && busy && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <FileJson size={14} />
            <span className="truncate">{fileName}</span>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Файл создаётся локально:
          </p>
          <code className="mt-1.5 block overflow-x-auto rounded-xl bg-slate-900 px-3 py-2 text-[10px] leading-relaxed text-slate-100">
            python3 tools/convert.py книга.pdf -o public/deck.json
          </code>
          <button
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            <RefreshCw size={13} />
            Проверить снова
          </button>
        </div>
      </div>

      <p className="mt-4 max-w-sm text-center text-[11px] leading-relaxed text-slate-400">
        Без аккаунтов и серверов. Экспорт JSON в настройках остаётся способом переноса прогресса.
      </p>
    </div>
  )
}
