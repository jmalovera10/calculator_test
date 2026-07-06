import { useCalculator } from '../calculator/useCalculator'
import { Display } from './Display'
import { Keypad } from './Keypad'

export function Calculator() {
  const { state, pressDigit, pressDecimalPoint, pressOperator, pressEquals, pressClear, pressUnaryOperator } =
    useCalculator()

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-slate-800 shadow-xl">
      <Display state={state} />
      <Keypad
        onDigit={pressDigit}
        onDecimalPoint={pressDecimalPoint}
        onOperator={pressOperator}
        onUnaryOperator={pressUnaryOperator}
        onEquals={pressEquals}
        onClear={pressClear}
        disabled={state.isLoading}
      />
    </div>
  )
}
