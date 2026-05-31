import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const MCP_SERVERS = {
  supabase: {
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest', '--access-token', '${SUPABASE_ACCESS_TOKEN}'],
  },
  github: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: '${GITHUB_TOKEN}',
    },
  },
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
  },
}

export const DEFAULT_MCP_SERVERS = ['supabase', 'github']

export function resolveMcpServers(mcpFlag) {
  if (!mcpFlag) return DEFAULT_MCP_SERVERS
  if (mcpFlag === 'none') return []
  return mcpFlag.split(',').map((s) => s.trim()).filter(Boolean)
}

export async function writeMcpConfig(projectDir, serverNames) {
  if (!serverNames.length) return

  const settingsPath = join(projectDir, '.claude', 'settings.json')
  let existing = {}
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(await readFile(settingsPath, 'utf8'))
    } catch {}
  }

  existing.mcpServers ??= {}
  for (const name of serverNames) {
    const config = MCP_SERVERS[name]
    if (!config) {
      process.stderr.write(`[kickstart] unknown MCP server: ${name}, skipping\n`)
      continue
    }
    existing.mcpServers[name] = config
  }

  await mkdir(join(projectDir, '.claude'), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(existing, null, 2)}\n`)
}
