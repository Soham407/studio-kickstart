# MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-inject MCP server configs into `.claude/settings.json` during scaffold so new projects have Supabase and GitHub MCP wired from day one. Opt out with `--mcp none`.

**Architecture:** New `lib/mcp.js` module owns the server registry, resolution, and file writing. `scaffold.js` calls `writeMcpConfig` right after `injectSkills`. `writeAgentDocs` gains a short MCP setup section. `bin/kickstart.js` adds `--mcp <servers>` flag.

**Tech Stack:** Node.js 20+, `node:fs/promises`, `commander`, JSON merge into `.claude/settings.json`.

---

## File Map

| Action | Path |
|--------|------|
| Create | `lib/mcp.js` |
| Modify | `lib/scaffold.js` |
| Modify | `bin/kickstart.js` |
| Create | `test/mcp.test.js` |

---

### Task 1: `lib/mcp.js` — MCP server registry and `writeMcpConfig`

**Files:**
- Create: `lib/mcp.js`
- Create: `test/mcp.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/mcp.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
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
    await (await import('node:fs/promises')).writeFile(
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/mcp.test.js 2>&1 | tail -20
```

Expected: FAIL — `lib/mcp.js` does not exist

- [ ] **Step 3: Create `lib/mcp.js`**

```js
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/mcp.test.js 2>&1 | tail -20
```

Expected: all 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/mcp.js test/mcp.test.js
git commit -m "feat: add lib/mcp.js with MCP server registry and writeMcpConfig"
```

---

### Task 2: Wire `writeMcpConfig` into the scaffold flow

**Files:**
- Modify: `lib/scaffold.js` — import and call `writeMcpConfig`
- Modify: `bin/kickstart.js` — add `--mcp` flag

- [ ] **Step 1: Write the failing test**

Add to `test/mcp.test.js`:

```js
test('scaffold.js exports resolveMcpServers passthrough via --mcp none flag in CLI help', async () => {
  const { execa } = await import('execa')
  const { stdout } = await execa('node', ['bin/kickstart.js', '--help'], { cwd: process.cwd() })
  assert.match(stdout, /--mcp/)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test test/mcp.test.js 2>&1 | grep -A3 "mcp.*flag"
```

Expected: FAIL — `--mcp` not in help output

- [ ] **Step 3: Add import and call in `lib/scaffold.js`**

At the top of `lib/scaffold.js`, add the import after the existing imports:

```js
import { resolveMcpServers, writeMcpConfig } from './mcp.js'
```

In the `scaffold` function, add the `writeMcpConfig` call right after `injectSkills`:

```js
  logStep('Step 4/8: Injecting Studio Skills library')
  await injectSkills(projectDir, repoUrl, skillPacks, options.skillsRef ?? config.skillsRef)
  await writeMcpConfig(projectDir, resolveMcpServers(options.mcp))
```

- [ ] **Step 4: Add `--mcp` flag to `bin/kickstart.js`**

Add after the `--github` option:

```js
  .option('--mcp <servers>', 'MCP servers to wire: supabase, github, filesystem (comma-separated). Use "none" to skip. Default: supabase,github')
```

- [ ] **Step 5: Run test to verify it passes**

```bash
node --test test/mcp.test.js 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 6: Verify help shows --mcp**

```bash
node bin/kickstart.js --help | grep mcp
```

Expected: `--mcp <servers>`

- [ ] **Step 7: Commit**

```bash
git add lib/scaffold.js bin/kickstart.js test/mcp.test.js
git commit -m "feat: wire MCP config into scaffold flow with --mcp flag"
```

---

### Task 3: Add MCP setup section to agent docs

**Files:**
- Modify: `lib/scaffold.js` — `agentInstructions` function

- [ ] **Step 1: Add MCP setup section to `agentInstructions`**

In `lib/scaffold.js`, find the `agentInstructions` function. Add a new section before the `## Quick Commands` section by replacing the template string. Find the line:

```js
## Quick Commands
```

And change the template literal so it reads:

```js
## MCP Servers

\`.claude/settings.json\` ships with pre-configured MCP servers. Replace placeholder values with real tokens before use:

| Server | Env var required |
| --- | --- |
| \`supabase\` | \`SUPABASE_ACCESS_TOKEN\` — create at https://supabase.com/dashboard/account/tokens |
| \`github\` | \`GITHUB_TOKEN\` — create at https://github.com/settings/tokens |

To opt out of a server, remove its entry from \`.claude/settings.json\`. To add \`filesystem\`, run:
\`kickstart skills sync\` or manually add it under \`mcpServers\` in \`.claude/settings.json\`.

## Quick Commands
```

The full replacement in `agentInstructions`: find the line before `## Quick Commands` and insert the MCP section above it. The exact edit is to replace:

```js
${productionPipelineSection()}

## Quick Commands
```

with:

```js
${productionPipelineSection()}

## MCP Servers

\`.claude/settings.json\` ships with pre-configured MCP servers. Replace placeholder values with real tokens before use:

| Server | Env var required |
| --- | --- |
| \`supabase\` | \`SUPABASE_ACCESS_TOKEN\` — create at https://supabase.com/dashboard/account/tokens |
| \`github\` | \`GITHUB_TOKEN\` — create at https://github.com/settings/tokens |

To add more servers, run \`kickstart --mcp filesystem\` or edit \`.claude/settings.json\` directly.

## Quick Commands
```

- [ ] **Step 2: Run the full test suite to verify nothing broke**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/scaffold.js
git commit -m "docs: add MCP server setup section to scaffolded agent docs"
```

---

### Task 4: Final check

- [ ] **Step 1: Run the complete check**

```bash
npm run check 2>&1 | tail -20
```

Expected: `npm run skills:lint` passes, `npm test` passes, `npm pack --dry-run` succeeds

- [ ] **Step 2: Verify help is clean**

```bash
node bin/kickstart.js --help
node bin/kickstart.js skills --help
```

Expected: no errors, `--mcp` visible in main help
