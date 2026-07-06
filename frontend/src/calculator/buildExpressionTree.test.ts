import { describe, expect, it } from 'vitest'
import { buildExpressionTree } from './buildExpressionTree'

describe('buildExpressionTree', () => {
  it('builds an addition node', () => {
    expect(buildExpressionTree('12', '+', '5')).toEqual({ '+': ['12', '5'] })
  })

  it('builds a subtraction node', () => {
    expect(buildExpressionTree('10', '-', '4')).toEqual({ '-': ['10', '4'] })
  })

  it('builds a multiplication node', () => {
    expect(buildExpressionTree('17', '*', '3')).toEqual({ '*': ['17', '3'] })
  })

  it('builds a division node', () => {
    expect(buildExpressionTree('9', '/', '0')).toEqual({ '/': ['9', '0'] })
  })
})
