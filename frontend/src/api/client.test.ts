import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluate } from './client'
import { ApiError } from './types'

describe('evaluate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the expression and returns the result on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: '17' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await evaluate({ '+': ['12', '5'] })

    expect(result).toBe('17')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/calculations',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: { '+': ['12', '5'] } }),
      }),
    )
  })

  it('throws an ApiError with the code and message from the response on failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ error: { code: 'DIVISION_BY_ZERO', message: 'division by zero' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(evaluate({ '/': ['9', '0'] })).rejects.toMatchObject(
      new ApiError('DIVISION_BY_ZERO', 'division by zero'),
    )
  })
})
