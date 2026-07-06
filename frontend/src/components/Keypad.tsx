import type { Operator, UnaryOperator } from '../calculator/types'
import { Key } from './Key'

interface KeypadProps {
  onDigit: (digit: string) => void
  onDecimalPoint: () => void
  onOperator: (operator: Operator) => void
  onUnaryOperator: (operator: UnaryOperator) => void
  onEquals: () => void
  onClear: () => void
  disabled?: boolean
}

export function Keypad({
  onDigit,
  onDecimalPoint,
  onOperator,
  onUnaryOperator,
  onEquals,
  onClear,
  disabled = false,
}: KeypadProps) {
  return (
    <div className="grid grid-cols-4 gap-2 p-4">
      

      <Key variant="operator" disabled={disabled} onClick={() => onUnaryOperator('sqrt')}>
        √
      </Key>
      <Key variant="operator" disabled={disabled} onClick={() => onUnaryOperator('%')}>
        %
      </Key>
      <Key variant="operator" disabled={disabled} onClick={() => onOperator('^')}>
        ^
      </Key>
      <Key variant="clear" disabled={disabled} onClick={onClear}>
        C
      </Key>

      <Key disabled={disabled} onClick={() => onDigit('7')}>7</Key>
      <Key disabled={disabled} onClick={() => onDigit('8')}>8</Key>
      <Key disabled={disabled} onClick={() => onDigit('9')}>9</Key>
      <Key variant="operator" disabled={disabled} onClick={() => onOperator('/')}>
        /
      </Key>

      <Key disabled={disabled} onClick={() => onDigit('4')}>4</Key>
      <Key disabled={disabled} onClick={() => onDigit('5')}>5</Key>
      <Key disabled={disabled} onClick={() => onDigit('6')}>6</Key>
      <Key variant="operator" disabled={disabled} onClick={() => onOperator('*')}>
        *
      </Key>

      <Key disabled={disabled} onClick={() => onDigit('1')}>1</Key>
      <Key disabled={disabled} onClick={() => onDigit('2')}>2</Key>
      <Key disabled={disabled} onClick={() => onDigit('3')}>3</Key>
      <Key variant="operator" disabled={disabled} onClick={() => onOperator('-')}>
        -
      </Key>

      <Key className="col-span-2" disabled={disabled} onClick={() => onDigit('0')}>
        0
      </Key>
      <Key disabled={disabled} onClick={onDecimalPoint}>.</Key>
      <Key variant="operator" disabled={disabled} onClick={() => onOperator('+')}>
        +
      </Key>

      <Key variant="equals" className="col-span-4" disabled={disabled} onClick={onEquals}>
        =
      </Key>
    </div>
  )
}
