import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate } from '../api/client'
import { ApiError } from '../api/types'
import { Calculator } from './Calculator'

vi.mock('../api/client', () => ({
  evaluate: vi.fn(),
}))

const mockedEvaluate = vi.mocked(evaluate)

function display() {
  return screen.getByTestId('display')
}

describe('Calculator', () => {
  beforeEach(() => {
    mockedEvaluate.mockReset()
  })

  it('computes 12 + 5 = 17 via the keypad, showing the live expression first', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('17')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '+' }))

    expect(display()).toHaveTextContent('12 +')

    await user.click(screen.getByRole('button', { name: '5' }))

    expect(display()).toHaveTextContent('12 + 5')

    await user.click(screen.getByRole('button', { name: '=' }))

    await waitFor(() => expect(display()).toHaveTextContent('17'))
    expect(mockedEvaluate).toHaveBeenCalledWith({ '+': ['12', '5'] })
  })

  it('shows the backend error message for division by zero', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockRejectedValueOnce(new ApiError('DIVISION_BY_ZERO', 'division by zero'))
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '/' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '=' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('division by zero')
  })

  it('replaces the previous answer when a new digit is pressed', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('17')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '=' }))
    await waitFor(() => expect(display()).toHaveTextContent('17'))

    await user.click(screen.getByRole('button', { name: '3' }))

    expect(display()).toHaveTextContent('3')
    expect(display()).not.toHaveTextContent('17')
  })

  it('chains from the previous result when an operator is pressed instead of a digit', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('17')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '=' }))
    await waitFor(() => expect(display()).toHaveTextContent('17'))

    mockedEvaluate.mockResolvedValueOnce('51')
    await user.click(screen.getByRole('button', { name: '*' }))
    expect(display()).toHaveTextContent('17 *')

    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: '=' }))

    await waitFor(() => expect(display()).toHaveTextContent('51'))
    expect(mockedEvaluate).toHaveBeenLastCalledWith({ '*': ['17', '3'] })
  })

  it('disables the keypad while a calculation is in flight, so input cannot be lost mid-request', async () => {
    const user = userEvent.setup()
    let resolveEvaluate!: (result: string) => void
    mockedEvaluate.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEvaluate = resolve
      }),
    )
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '=' }))

    expect(screen.getByRole('button', { name: '2' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '=' })).toBeDisabled()

    resolveEvaluate('6')

    await waitFor(() => expect(display()).toHaveTextContent('6'))
    expect(screen.getByRole('button', { name: '2' })).not.toBeDisabled()
  })

  it('computes the square root of the current operand immediately on press', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('3')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '√' }))

    await waitFor(() => expect(display()).toHaveTextContent('3'))
    expect(mockedEvaluate).toHaveBeenCalledWith({ sqrt: ['9'] })
  })

  it('computes a percentage of the current operand immediately on press', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('0.5')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '5' }))
    await user.click(screen.getByRole('button', { name: '0' }))
    await user.click(screen.getByRole('button', { name: '%' }))

    await waitFor(() => expect(display()).toHaveTextContent('0.5'))
    expect(mockedEvaluate).toHaveBeenCalledWith({ '%': ['50'] })
  })

  it('computes exponentiation via the ^ key', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('256')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '^' }))
    await user.click(screen.getByRole('button', { name: '8' }))
    await user.click(screen.getByRole('button', { name: '=' }))

    await waitFor(() => expect(display()).toHaveTextContent('256'))
    expect(mockedEvaluate).toHaveBeenCalledWith({ '^': ['2', '8'] })
  })

  it('surfaces a negative-square-root error via role=alert', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('-5')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '4' }))
    await user.click(screen.getByRole('button', { name: '-' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '=' }))
    await waitFor(() => expect(display()).toHaveTextContent('-5'))

    mockedEvaluate.mockRejectedValueOnce(new ApiError('NEGATIVE_SQRT', 'cannot take the square root of a negative number'))
    await user.click(screen.getByRole('button', { name: '√' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('cannot take the square root of a negative number')
  })

  it('preserves a pending binary chain through an intervening unary operator: 12 + √9 = 15', async () => {
    const user = userEvent.setup()
    mockedEvaluate.mockResolvedValueOnce('3')
    render(<Calculator />)

    await user.click(screen.getByRole('button', { name: '1' }))
    await user.click(screen.getByRole('button', { name: '2' }))
    await user.click(screen.getByRole('button', { name: '+' }))
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: '√' }))

    await waitFor(() => expect(display()).toHaveTextContent('12 + 3'))

    mockedEvaluate.mockResolvedValueOnce('15')
    await user.click(screen.getByRole('button', { name: '=' }))

    await waitFor(() => expect(display()).toHaveTextContent('15'))
    expect(mockedEvaluate).toHaveBeenLastCalledWith({ '+': ['12', '3'] })
  })
})
