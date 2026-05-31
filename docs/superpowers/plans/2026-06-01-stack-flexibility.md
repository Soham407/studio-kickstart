# Stack Flexibility (Other/Bare Type) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `other` project type that skips framework scaffolding but still runs everything else (skills inject, MCP config, DB/auth, guardrails, agent docs). Users bring their own framework; kickstart still sets up the agent infrastructure.

**Architecture:** `createProject` gets an early-return branch for `type === 'other'` that creates a directory, writes a minimal `package.json`, and runs `git init`. `resolveType` gets a fourth option. `agentInstructions` gets a generic stack section for `other`. `bin/kickstart.js` adds `--other` flag. No changes to any other scaffold step — they all work with any project dir.

**Tech Stack:** Node.js 20+, `execa`, `@clack/prompts`, existing `lib/scaffold.js` patterns.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `lib/scaffold.js` — `createProject`, `resolveType`, `agentInstructions` |
| Modify | `bin/kickstart.js` — add `--other` flag, update `resolveType` check |
| Modify | `test/cli.test.js` — add `--other` flag test |

---

### Task 1: Add `other` branch to `createProject`

**Files:**
- Modify: `lib/scaffold.js` — `createProject` function

- [ ] **Step 1: Write the failing test**

Add to `test/cli.test.js`:

```js
test('--other flag appears in CLI help', async () => {
  const { stdout } = await execa('node', ['bin/kickstart.js', '--help'], { cwd: process.cwd() })
  assert.match(stdout, /--other/)
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "other flag"
```

Expected: FAIL — `--other` not in help

- [ ] **Step 3: Add `--other` flag to `bin/kickstart.js`**

In `bin/kickstart.js`, add after the `--universal` option:

```js
  .option('--other', 'Bare project: git init + agent setup only, no framework scaffold')
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "other flag"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bin/kickstart.js test/cli.test.js
git commit -m "feat: add --other flag to kickstart CLI"
```

---

### Task 2: Handle `other` in `resolveType` and `scaffold`

**Files:**
- Modify: `lib/scaffold.js` — `resolveType` and `scaffold` functions

- [ ] **Step 1: Update `resolveType` in `lib/scaffold.js`**

Find the `resolveType` function. Replace the `select` options array to add the fourth option:

```js
async function resolveType(options) {
  const selected = ['web', 'mobile', 'universal', 'other'].filter((type) => options[type])
  if (selected.length > 1) fail('Choose only one project type: --web, --mobile, --universal, or --other')
  if (selected[0]) return selected[0]

  return cancelIfNeeded(await select({
    message: 'What kind of project do you want to create?',
    options: [
      { value: 'web', label: 'Web app', hint: 'Next.js App Router' },
      { value: 'mobile', label: 'Mobile app', hint: 'Expo' },
      { value: 'universal', label: 'Universal app', hint: 'Turborepo + Solito' },
      { value: 'other', label: 'Other / Bare project', hint: 'Git init + agent setup, bring your own framework' },
    ],
    initialValue: 'web',
  }))
}
```

- [ ] **Step 2: Add `other` branch to `createProject`**

In `lib/scaffold.js`, find `createProject`. Insert an early-return block at the very top of the function body, before the `if (type === 'web')` line:

```js
async function createProject(type, projectName) {
  logStep(`Step 2/8: Scaffolding ${type}`)

  if (type === 'other') {
    const projectDir = resolve(projectName)
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'package.json'), `${JSON.stringify({
      name: projectName,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {},
    }, null, 2)}\n`)
    await execa('git', ['init', '-b', 'main'], { cwd: projectDir, stdio: 'inherit' })
    return projectDir
  }

  if (type === 'web') {
    // ... existing web code unchanged
```

The rest of `createProject` (NativeWind, ensureWorkspaceBuildApprovals, etc.) is untouched and only reached for `web`, `mobile`, and `universal`.

- [ ] **Step 3: Run existing tests to verify nothing broke**

```bash
npm test 2>&1 | tail -20
```

Expected: all existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/scaffold.js
git commit -m "feat: add other/bare project type to createProject and resolveType"
```

---

### Task 3: Generic agent docs for `other` type

**Files:**
- Modify: `lib/scaffold.js` — `agentInstructions` function

- [ ] **Step 1: Extract stack section as a helper**

In `lib/scaffold.js`, the `agentInstructions` function currently has a hardcoded `## Stack Standards` section inside the template literal. Replace it with a conditional.

Find this block inside `agentInstructions`:

```js
## Stack Standards

- Web: Next.js 16 App Router
- Mobile: Expo SDK 55
- Styling: NativeWind v4
- Universal logic: Solito 5 when applicable
- Cloud DB: Supabase
- Offline-first mobile: WatermelonDB
- Auth: Better-Auth
- Quality gates: Husky, lint-staged, Vitest, Playwright, Sandcastle
- Design staging: \`.design-staging/\` for Open Design exports and Artifact-Pro handoff files
```

Replace that block with a call to a new helper function. Add this function right before `agentInstructions`:

```js
function stackStandardsSection(type) {
  if (type === 'other') {
    return `## Stack Standards

Configure your framework, styling, and data layer here. The following are pre-installed — add your own on top:

- Auth: Better-Auth (\`lib/auth.ts\`)
- Cloud DB: Supabase (\`lib/supabase.ts\`)
- Quality gates: Husky, lint-staged, Vitest, Playwright, Sandcastle
- Design staging: \`.design-staging/\` for Open Design exports and Artifact-Pro handoff files`
  }

  return `## Stack Standards

- Web: Next.js 16 App Router
- Mobile: Expo SDK 55
- Styling: NativeWind v4
- Universal logic: Solito 5 when applicable
- Cloud DB: Supabase
- Offline-first mobile: WatermelonDB
- Auth: Better-Auth
- Quality gates: Husky, lint-staged, Vitest, Playwright, Sandcastle
- Design staging: \`.design-staging/\` for Open Design exports and Artifact-Pro handoff files`
}
```

Update the `agentInstructions` signature to accept `type` and call the helper:

```js
function agentInstructions(projectName, type, localModelMode, localModelName, localModelRuntime, skillPacks) {
  const localModelText = ...  // unchanged

  return `# ${projectName}

Studio-Grade **${type}** project bootstrapped via \`kickstart\`.

## Agent And Model Routing

${localModelText}

Compatible agent entrypoints:

- Claude Code: \`CLAUDE.md\` and \`.claude/skills/\`
- Codex and Pi: \`AGENTS.md\` and \`.agents/skills/\`
- Other Agent Skills-compatible harnesses: use \`.agents/skills/\` when supported

${stackStandardsSection(type)}

## Design Staging Bridge
...
```

The function signature and all other content stay the same; only the hardcoded stack block is replaced with `${stackStandardsSection(type)}`.

- [ ] **Step 2: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/scaffold.js
git commit -m "feat: add generic stack section in agent docs for other project type"
```

---

### Task 4: Final verification

- [ ] **Step 1: Run the complete check**

```bash
npm run check 2>&1 | tail -20
```

Expected: `skills:lint` passes, `npm test` passes, `npm pack --dry-run` succeeds

- [ ] **Step 2: Smoke-test the help**

```bash
node bin/kickstart.js --help
```

Expected: `--other` visible, no errors

- [ ] **Step 3: Confirm `resolveType` validates mutual exclusivity**

```bash
node bin/kickstart.js --web my-app --other my-app 2>&1
```

Expected: error `Choose only one project type`
