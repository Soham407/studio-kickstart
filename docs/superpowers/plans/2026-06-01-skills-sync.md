# Skills Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a `.studio-skills.json` lockfile on every skill inject/install, and add a `kickstart skills sync [--upgrade]` command that re-applies or upgrades skills from that lockfile.

**Architecture:** Two new exported helpers (`readLockfile` / `writeLockfile`) are added to `lib/skills.js`. `injectSkills` and `installSkill` call them after copying files. A new `skills sync` sub-command in `bin/kickstart.js` reads the lockfile and calls a new `syncSkills` function. `getLatestTag` fetches the newest semver tag via `git ls-remote` for `--upgrade` support.

**Tech Stack:** Node.js 20+, `node:fs/promises`, `execa`, `commander`, existing `lib/skills.js` patterns.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `lib/skills.js` |
| Modify | `bin/kickstart.js` |
| Modify | `test/cli.test.js` |

---

### Task 1: `readLockfile` and `writeLockfile` helpers

**Files:**
- Modify: `lib/skills.js` (top of file, imports + two exports)
- Modify: `test/cli.test.js` (add lockfile unit tests)

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.js` (after existing imports):

```js
import { readLockfile, writeLockfile } from '../lib/skills.js'
```

Add these tests after the existing ones:

```js
test('writeLockfile writes JSON and readLockfile reads it back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-lockfile-'))
  try {
    const data = {
      kickstartVersion: '1.1.1',
      repoUrl: 'https://github.com/test/repo.git',
      ref: 'v1.1.1',
      packs: ['essential'],
      installedAt: '2026-06-01T00:00:00.000Z',
      lastSyncedAt: '2026-06-01T00:00:00.000Z',
      skills: [{ name: 'tdd', category: 'architecture' }],
    }
    await writeLockfile(dir, data)
    const result = await readLockfile(dir)
    assert.deepEqual(result, data)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readLockfile returns null when file is missing', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-nolockfile-'))
  try {
    const result = await readLockfile(dir)
    assert.equal(result, null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/cli.test.js 2>&1 | tail -20
```

Expected: FAIL — `readLockfile is not exported`

- [ ] **Step 3: Add helpers to `lib/skills.js`**

In `lib/skills.js`, add `writeFile` and `readFile` are already imported. Add `sep` to the `node:path` import:

```js
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
```

Add `readPackageVersion` import after the existing imports:

```js
import { readPackageVersion } from './config.js'
```

Add the two helpers after the `DEFAULT_SKILLS_REF` constant (around line 16):

```js
const LOCKFILE_NAME = '.studio-skills.json'

export async function readLockfile(projectDir) {
  try {
    const content = await readFile(join(projectDir, LOCKFILE_NAME), 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function writeLockfile(projectDir, data) {
  await writeFile(join(projectDir, LOCKFILE_NAME), `${JSON.stringify(data, null, 2)}\n`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/cli.test.js 2>&1 | tail -20
```

Expected: both new tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/skills.js test/cli.test.js
git commit -m "feat: add readLockfile and writeLockfile helpers to skills.js"
```

---

### Task 2: `injectSkills` writes the lockfile

**Files:**
- Modify: `lib/skills.js` — `injectSkills` function
- Modify: `test/cli.test.js` — add lockfile-after-inject test

- [ ] **Step 1: Write the failing test**

Add to `test/cli.test.js`:

```js
test('skills install writes .studio-skills.json lockfile', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-lockfile-inject-'))
  try {
    await execa('node', [
      'bin/kickstart.js', 'skills', 'install', 'tdd',
      '--agent', 'claude',
      '--skills', `file://${process.cwd()}`,
      '--skills-ref', 'latest',
      '--target', target,
    ], { cwd: process.cwd() })

    const lockfilePath = join(target, '.studio-skills.json')
    assert.equal(existsSync(lockfilePath), true)

    const lockfile = JSON.parse(await readFile(lockfilePath, 'utf8'))
    assert.ok(lockfile.kickstartVersion)
    assert.ok(lockfile.installedAt)
    assert.ok(lockfile.lastSyncedAt)
    assert.equal(Array.isArray(lockfile.skills), true)
    assert.ok(lockfile.skills.some((s) => s.name === 'tdd'))
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "lockfile-inject"
```

Expected: FAIL — `.studio-skills.json` does not exist

- [ ] **Step 3: Update `injectSkills` to collect installed skills and write lockfile**

Replace the loop and the code after it in `injectSkills` (the `try` block in `lib/skills.js`, from `const paths =` to the `cp` call for `SKILL_TEMPLATE.md`):

```js
export async function injectSkills(projectDir, repoUrl, skillPacks = ['essential'], skillsRef = DEFAULT_SKILLS_REF) {
  const tmp = await mkdtemp(join(tmpdir(), 'studio-skills-'))

  try {
    await cloneSkillsRepo(repoUrl, tmp, skillsRef)

    const paths = selectedSkillPaths(skillPacks)
    const selected = paths ?? (await readSkills(tmp)).map((skill) => join(skill.category, skill.slug))

    const installedSkills = []
    for (const relativePath of selected) {
      const source = join(tmp, relativePath)
      if (!existsSync(join(source, 'SKILL.md'))) {
        console.log(chalk.yellow(`[kickstart] skipped missing skill path: ${relativePath}`))
        continue
      }

      let skillName
      for (const targetRoot of [join(projectDir, '.agents', 'skills'), join(projectDir, '.claude', 'skills')]) {
        skillName = await copySkill(source, targetRoot)
      }
      const [category] = relativePath.split(sep)
      installedSkills.push({ name: skillName, category })
      console.log(chalk.green(`[kickstart] injected ${relativePath}`))
    }

    await cp(join(tmp, '.github', 'skills', 'SKILL_TEMPLATE.md'), join(projectDir, '.claude', 'skills', 'SKILL_TEMPLATE.md'), {
      force: true,
    }).catch(() => {})

    const now = new Date().toISOString()
    const existing = await readLockfile(projectDir)
    const packs = skillPacks === 'all' ? ['all'] : Array.isArray(skillPacks) ? skillPacks : [skillPacks]
    await writeLockfile(projectDir, {
      kickstartVersion: readPackageVersion(),
      repoUrl,
      ref: skillsRef,
      packs,
      installedAt: existing?.installedAt ?? now,
      lastSyncedAt: now,
      skills: installedSkills,
    })
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "lockfile-inject"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/skills.js test/cli.test.js
git commit -m "feat: write .studio-skills.json lockfile after injectSkills"
```

---

### Task 3: `installSkill` upserts the lockfile

**Files:**
- Modify: `lib/skills.js` — `installSkill` function

- [ ] **Step 1: Write the failing test**

Add to `test/cli.test.js`:

```js
test('installing a second skill merges into existing lockfile', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-lockfile-merge-'))
  try {
    for (const skill of ['tdd', 'usage-limit-reducer']) {
      await execa('node', [
        'bin/kickstart.js', 'skills', 'install', skill,
        '--agent', 'claude',
        '--skills', `file://${process.cwd()}`,
        '--skills-ref', 'latest',
        '--target', target,
      ], { cwd: process.cwd() })
    }

    const lockfile = JSON.parse(await readFile(join(target, '.studio-skills.json'), 'utf8'))
    assert.ok(lockfile.skills.some((s) => s.name === 'tdd'))
    assert.ok(lockfile.skills.some((s) => s.name === 'usage-limit-reducer'))
    assert.equal(lockfile.skills.length, 2)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "merge"
```

Expected: FAIL — second install overwrites the lockfile (only 1 skill)

- [ ] **Step 3: Update `installSkill` to upsert**

Replace the `installSkill` function in `lib/skills.js`:

```js
export async function installSkill(projectDir, repoUrl, skillName, agent = 'claude', skillsRef = DEFAULT_SKILLS_REF) {
  return withSkillsRepo(repoUrl, async (repoDir) => {
    const skills = await readSkills(repoDir)
    const skill = skills.find((candidate) => candidate.name === skillName || candidate.slug === skillName)
    if (!skill) throw new Error(`Skill not found: ${skillName}`)
    if (!AGENT_SKILL_TARGETS[agent]) {
      throw new Error(`Unsupported agent target "${agent}". Use one of: ${Object.keys(AGENT_SKILL_TARGETS).join(', ')}`)
    }

    const sourceDir = join(repoDir, skill.category, skill.slug)
    const targetRoot = join(projectDir, AGENT_SKILL_TARGETS[agent])
    await copySkill(sourceDir, targetRoot)

    const now = new Date().toISOString()
    const entry = { name: skill.name, category: skill.category }
    const existing = await readLockfile(projectDir)
    if (existing) {
      const idx = existing.skills.findIndex((s) => s.name === skill.name)
      if (idx >= 0) {
        existing.skills[idx] = entry
      } else {
        existing.skills.push(entry)
      }
      existing.lastSyncedAt = now
      await writeLockfile(projectDir, existing)
    } else {
      await writeLockfile(projectDir, {
        kickstartVersion: readPackageVersion(),
        repoUrl,
        ref: skillsRef,
        packs: [],
        installedAt: now,
        lastSyncedAt: now,
        skills: [entry],
      })
    }

    return { ...skill, targetDir: join(targetRoot, skill.name) }
  }, skillsRef)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "merge"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/skills.js test/cli.test.js
git commit -m "feat: installSkill upserts .studio-skills.json lockfile"
```

---

### Task 4: `getLatestTag` and `syncSkills`

**Files:**
- Modify: `lib/skills.js` — add two new exported functions

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.js`:

```js
test('getLatestTag returns the highest semver tag from a local repo', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'studio-latesttag-'))
  try {
    const repoDir = join(fixture, 'repo')
    await mkdir(repoDir, { recursive: true })
    await writeFile(join(repoDir, 'README.md'), 'test')
    await execa('git', ['init', '-q'], { cwd: repoDir })
    await execa('git', ['add', '.'], { cwd: repoDir })
    await execa('git', ['-c', 'user.name=T', '-c', 'user.email=t@t.com', 'commit', '-qm', 'init'], { cwd: repoDir })
    await execa('git', ['tag', 'v1.0.0'], { cwd: repoDir })
    await execa('git', ['tag', 'v1.2.0'], { cwd: repoDir })
    await execa('git', ['tag', 'v1.1.0'], { cwd: repoDir })

    const { getLatestTag } = await import('../lib/skills.js')
    const tag = await getLatestTag(`file://${repoDir}`)
    assert.equal(tag, 'v1.2.0')
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "getLatestTag"
```

Expected: FAIL — `getLatestTag is not exported`

- [ ] **Step 3: Add `getLatestTag` and `syncSkills` to `lib/skills.js`**

Add after `installSkill`:

```js
export async function getLatestTag(repoUrl) {
  try {
    const { stdout } = await execa('git', ['ls-remote', '--tags', repoUrl])
    const tags = stdout
      .split('\n')
      .map((line) => line.split('\t')[1])
      .filter((ref) => ref && /^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref))
      .map((ref) => ref.replace('refs/tags/', ''))
      .sort((a, b) => {
        const parse = (t) => t.replace('v', '').split('.').map(Number)
        const [aMaj, aMin, aPatch] = parse(a)
        const [bMaj, bMin, bPatch] = parse(b)
        return bMaj - aMaj || bMin - aMin || bPatch - aPatch
      })
    return tags[0] ?? null
  } catch {
    return null
  }
}

export async function syncSkills(projectDir, repoUrl, skills, ref) {
  return withSkillsRepo(repoUrl, async (repoDir) => {
    const allSkills = await readSkills(repoDir)
    for (const { name } of skills) {
      const skill = allSkills.find((s) => s.name === name)
      if (!skill) {
        console.log(chalk.yellow(`[kickstart] skill not found at ${ref}, skipping: ${name}`))
        continue
      }
      const sourceDir = join(repoDir, skill.category, skill.slug)
      for (const targetRoot of [join(projectDir, '.agents', 'skills'), join(projectDir, '.claude', 'skills')]) {
        await copySkill(sourceDir, targetRoot)
      }
      console.log(chalk.green(`[kickstart] synced ${name}`))
    }

    const now = new Date().toISOString()
    const lockfile = await readLockfile(projectDir)
    if (lockfile) {
      lockfile.ref = ref
      lockfile.lastSyncedAt = now
      await writeLockfile(projectDir, lockfile)
    }
  }, ref)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "getLatestTag"
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/skills.js test/cli.test.js
git commit -m "feat: add getLatestTag and syncSkills to skills.js"
```

---

### Task 5: `kickstart skills sync` command

**Files:**
- Modify: `bin/kickstart.js` — add sync sub-command
- Modify: `test/cli.test.js` — sync integration test

- [ ] **Step 1: Write the failing tests**

Add to `test/cli.test.js`:

```js
test('kickstart skills sync restores deleted skill files', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-sync-'))
  try {
    await execa('node', [
      'bin/kickstart.js', 'skills', 'install', 'tdd',
      '--agent', 'claude',
      '--skills', `file://${process.cwd()}`,
      '--skills-ref', 'latest',
      '--target', target,
    ], { cwd: process.cwd() })

    await rm(join(target, '.claude', 'skills', 'tdd'), { recursive: true, force: true })
    assert.equal(existsSync(join(target, '.claude', 'skills', 'tdd', 'SKILL.md')), false)

    await execa('node', [
      'bin/kickstart.js', 'skills', 'sync',
      '--project', target,
    ], { cwd: process.cwd() })

    assert.equal(existsSync(join(target, '.claude', 'skills', 'tdd', 'SKILL.md')), true)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test('kickstart skills sync exits non-zero when lockfile is missing', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-sync-nolockfile-'))
  try {
    await assert.rejects(
      execa('node', ['bin/kickstart.js', 'skills', 'sync', '--project', target], { cwd: process.cwd() }),
      (err) => {
        assert.equal(err.exitCode, 1)
        return true
      }
    )
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "sync"
```

Expected: FAIL — `error: unknown command 'sync'`

- [ ] **Step 3: Add imports to `bin/kickstart.js`**

Update the skills import line at the top of `bin/kickstart.js`:

```js
import { AGENT_SKILL_TARGETS, getLatestTag, installSkill, listRepoSkills, readLockfile, syncSkills } from '../lib/skills.js'
```

- [ ] **Step 4: Add the sync command to `bin/kickstart.js`**

Add after the `skills install` command block (before `checkForUpdate()`):

```js
skills
  .command('sync')
  .description('Re-apply or upgrade skills from the project lockfile (.studio-skills.json)')
  .option('--upgrade', 'Upgrade to the latest available tag in the skills repo')
  .option('--project <dir>', 'Project directory', process.cwd())
  .action(async (options) => {
    const lockfile = await readLockfile(options.project)
    if (!lockfile) {
      console.error('[kickstart] No .studio-skills.json found. Run kickstart inside a scaffolded project first.')
      process.exit(1)
    }

    let { ref, repoUrl, skills } = lockfile

    if (options.upgrade) {
      const latestTag = await getLatestTag(repoUrl)
      if (latestTag && latestTag !== ref) {
        console.log(chalk.cyan(`Upgrading from ${ref} → ${latestTag}`))
        ref = latestTag
      } else {
        console.log(chalk.cyan(`Already at latest (${ref})`))
      }
    }

    await syncSkills(options.project, repoUrl, skills, ref)
    console.log(chalk.green(`Synced ${skills.length} skills at ${ref}`))
  })
```

Also add `chalk` import to `bin/kickstart.js` (it is not currently imported there):

```js
import chalk from 'chalk'
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
node --test test/cli.test.js 2>&1 | grep -A3 "sync"
```

Expected: both PASS

- [ ] **Step 6: Verify help text shows sync command**

```bash
node bin/kickstart.js skills --help
```

Expected output contains `sync` command description.

- [ ] **Step 7: Commit**

```bash
git add bin/kickstart.js test/cli.test.js
git commit -m "feat: add kickstart skills sync --upgrade command"
```

---

### Task 6: Final check

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: all tests pass

- [ ] **Step 2: Verify skills catalog lint passes**

```bash
npm run skills:lint 2>&1 | tail -10
```

Expected: no errors

- [ ] **Step 3: Commit if anything was fixed**

Only commit if there were fixes needed. Otherwise skip.
