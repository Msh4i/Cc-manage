import { describe, test, expect } from 'claude-code/testing'
import { abilities, buildRecord, initialLive, progressOf, shorten, stepFromTodos } from '../src/core/selfrecord'

const T = 1_000_000

describe('self record', () => {
  test('name is a safe addressable name built from the project folder and the session id', () => {
    expect(initialLive('0a1b2c3d-4e5f', 'My App', T).name).toBe('my-app-0a1b2c')
  })

  test('progress and current step come from the todo list', () => {
    const todos = [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }, { content: 'c', status: 'pending' }]
    expect(progressOf(todos)).toEqual({ done: 1, total: 3 })
    expect(stepFromTodos(todos)).toBe('b')
    expect(stepFromTodos([])).toBeUndefined()
  })

  test('record carries state, tier and tokens', () => {
    const l = initialLive('abcdef123', 'p', T)
    l.turnActive = true
    l.tokens.output = 50
    const r = buildRecord(l, { level: 2, name: 'Medium', reason: 'x' }, T + 5)
    expect(r.state).toBe('saving_mode')
    expect(r.tier).toBe(2)
    expect(r.tokens.output).toBe(50)
    expect(r.updatedAt).toBe(T + 5)
  })

  test('abilities are derived only from tools the session was seen using', () => {
    expect(abilities({})).toEqual([])
    expect(abilities({ Read: 3, Edit: 1, mcp__x__y: 1 })).toEqual(['edit files', 'read and search files', 'use connected tools (MCP)'])
  })

  test('shorten flattens whitespace and cuts', () => {
    expect(shorten('a\n\n b   c', 50)).toBe('a b c')
    expect(shorten('x'.repeat(200), 10).length).toBe(10)
  })
})
