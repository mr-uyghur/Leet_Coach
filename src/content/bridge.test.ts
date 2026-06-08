import { describe, expect, it } from 'vitest'
import { shouldDropExtraction } from './bridge'

describe('shouldDropExtraction', () => {
  it('keeps the latest extraction when slug and generation still match', () => {
    expect(shouldDropExtraction(2, 'two-sum', 2, 'two-sum')).toBe(false)
  })

  it('drops stale generations', () => {
    expect(shouldDropExtraction(1, 'two-sum', 2, 'two-sum')).toBe(true)
  })

  it('drops extractions when navigation changed the slug', () => {
    expect(shouldDropExtraction(2, 'two-sum', 2, 'three-sum')).toBe(true)
  })
})
