import { formatDisplay } from '../calculator/formatDisplay'
import type { CalculatorState } from '../calculator/types'
import { ErrorMessage } from './ErrorMessage'

interface DisplayProps {
  state: CalculatorState
}

export function Display({ state }: DisplayProps) {
  if (state.error) {
    return <ErrorMessage message={state.error.message} />
  }

  return (
    <div
      data-testid="display"
      className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-6 text-right text-4xl font-mono text-white"
    >
      {formatDisplay(state)}
    </div>
  )
}
