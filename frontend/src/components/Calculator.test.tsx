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
})
