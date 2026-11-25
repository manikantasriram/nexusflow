import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLocalStorage } from './useLocalStorage'

const isColor = (v: unknown): v is 'red' | 'blue' => v === 'red' || v === 'blue'

describe('useLocalStorage', () => {
  it('starts from the initial value and persists updates as JSON', () => {
    const { result } = renderHook(() => useLocalStorage('count', 1))
    expect(result.current[0]).toBe(1)
    act(() => result.current[1]((n) => n + 1))
    expect(result.current[0]).toBe(2)
    expect(localStorage.getItem('count')).toBe('2')
  })

  it('reads a stored value back', () => {
    localStorage.setItem('color', JSON.stringify('blue'))
    const { result } = renderHook(() => useLocalStorage('color', 'red', isColor))
    expect(result.current[0]).toBe('blue')
  })

  it('falls back to the initial value for garbage or values of the wrong shape', () => {
    localStorage.setItem('broken', '{not json')
    localStorage.setItem('color', JSON.stringify('green'))
    expect(renderHook(() => useLocalStorage('broken', 'ok')).result.current[0]).toBe('ok')
    expect(renderHook(() => useLocalStorage('color', 'red', isColor)).result.current[0]).toBe('red')
  })
})
