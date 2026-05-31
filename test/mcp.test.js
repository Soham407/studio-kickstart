import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MCP_SERVERS, resolveMcpServers, writeMcpConfig } from '../lib/mcp.js'

test('resolveMcpServers returns default servers when flag is omitted', () => {
  const result = resolveMcpServers(undefined)
  assert.deepEqual(result, ['supabase', 'github'])
})

test('resolveMcpServers returns empty array for "none"', () => {
  const result = resolveMcpServers('none')
  assert.deepEqual(result, [])
})

test('resolveMcpServers parses comma-separated list', () => {
  const result = resolveMcpServers('supabase,filesystem')
  assert.deepEqual(result, ['supabase', 'filesystem'])
})

test('writeMcpConfig creates .claude/settings.json with mcpServers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-'))
  try {
    await writeMcpConfig(dir, ['supabase', 'github'])
    const settingsPath = join(dir, '.claude', 'settings.json')
    assert.equal(existsSync(settingsPath), true)
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    assert.ok(settings.mcpServers?.supabase?.command)
    assert.ok(settings.mcpServers?.github?.command)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeMcpConfig merges into existing .claude/settings.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-merge-'))
  try {
    await mkdir(join(dir, '.claude'), { recursive: true })
    await writeFile(
      join(dir, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Bash(git:*)'] } }, null, 2)
    )
    await writeMcpConfig(dir, ['github'])
    const settings = JSON.parse(await readFile(join(dir, '.claude', 'settings.json'), 'utf8'))
    assert.deepEqual(settings.permissions?.allow, ['Bash(git:*)'])
    assert.ok(settings.mcpServers?.github?.command)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeMcpConfig is a no-op for empty server list', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-mcp-none-'))
  try {
    await writeMcpConfig(dir, [])
    assert.equal(existsSync(join(dir, '.claude', 'settings.json')), false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('MCP_SERVERS contains supabase, github, and filesystem', () => {
  assert.ok(MCP_SERVERS.supabase)
  assert.ok(MCP_SERVERS.github)
  assert.ok(MCP_SERVERS.filesystem)
})
