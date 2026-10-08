import { describe, test, expect } from 'claude-code/testing'
import { isCheapAgent, spawnModel, WRITER_SPEC } from '../src/core/routing'

describe('routing', () => {
  test('Explore with no model goes to Haiku; a chosen model and other agents are left alone', () => {
    expect(spawnModel('Explore', undefined)).toBe('haiku')
    expect(spawnModel('Explore', 'opus')).toBe('opus')
    expect(spawnModel('general-purpose', undefined)).toBeUndefined()
  })

  test('only the helpers count as cheap', () => {
    expect(isCheapAgent('session-budget:writer')).toBe(true)
    expect(isCheapAgent('Explore')).toBe(true)
    expect(isCheapAgent('general-purpose')).toBe(false)
    expect(isCheapAgent(undefined)).toBe(false)
  })

  test('the writer runs on Haiku, writes files, cannot run commands', () => {
    expect(WRITER_SPEC.model).toBe('haiku')
    expect(WRITER_SPEC.tools).toContain('Write')
    expect(WRITER_SPEC.tools).not.toContain('Bash')
  })
})
