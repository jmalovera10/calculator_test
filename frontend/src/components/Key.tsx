import type { ButtonHTMLAttributes } from 'react'

type KeyVariant = 'digit' | 'operator' | 'equals' | 'clear'

interface KeyProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: KeyVariant
}

const variantClasses: Record<KeyVariant, string> = {
  digit: 'bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-white',
  operator: 'bg-amber-600 hover:bg-amber-500 active:bg-amber-400 text-white',
  equals: 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-400 text-white',
  clear: 'bg-red-600 hover:bg-red-500 active:bg-red-400 text-white',
}

export function Key({ variant = 'digit', className = '', ...props }: KeyProps) {
  return (
    <button
      type="button"
      className={`rounded-lg py-4 text-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    />
  )
}
