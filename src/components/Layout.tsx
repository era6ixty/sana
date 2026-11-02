import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Home, RotateCcw, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AppHeader({
  title,
  subtitle,
  back,
  right,
}: {
  title: string
  subtitle?: string
  back?: boolean
  right?: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 bg-slate-50/85 backdrop-blur border-b border-slate-200/60">
      <div className="mx-auto max-w-3xl px-4 h-14 flex items-center gap-3">
        {back ? (
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-full hover:bg-slate-200/70 text-slate-600"
            aria-label="Назад"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <Link to="/" className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-indigo-600 text-white font-bold text-sm">
            S
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-semibold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  )
}

const navItems = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/review/all', label: 'Повторение', icon: RotateCcw },
  { to: '/settings', label: 'Настройки', icon: Settings },
]

export function BottomNav({ active }: { active: 'home' | 'review' | 'settings' }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-safe">
      <div className="mx-auto max-w-3xl grid grid-cols-3">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            (active === 'home' && to === '/') ||
            (active === 'review' && to.startsWith('/review')) ||
            (active === 'settings' && to === '/settings')
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                isActive ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600',
              )}
            >
              <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function Page({ children, nav }: { children: ReactNode; nav?: boolean }) {
  return (
    <div className={cn('min-h-dvh bg-slate-50', nav && 'pb-24')}>
      <div className="mx-auto max-w-3xl px-4">{children}</div>
    </div>
  )
}
