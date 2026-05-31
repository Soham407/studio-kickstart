import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readLockfile, writeLockfile } from '../lib/skills.js'
import { tmpdir } from 'node:os'
import { execa } from 'execa'

test('prints CLI help', async () => {
  const { stdout } = await execa('node', ['bin/kickstart.js', '--help'], { cwd: process.cwd() })

  assert.match(stdout, /kickstart/)
  assert.match(stdout, /--no-github/)
  assert.match(stdout, /--skill-pack/)
  assert.match(stdout, /--all-skills/)
  assert.match(stdout, /skills/)
})

test('prints CLI version from package metadata', async () => {
  const { stdout } = await execa('node', ['bin/kickstart.js', '--version'], { cwd: process.cwd() })

  assert.equal(stdout.trim(), '1.1.1')
})

test('installs a skill into a selected agent target', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-skills-test-'))

  try {
    await execa('node', [
      'bin/kickstart.js',
      'skills',
      'install',
      'tdd',
      '--agent',
      'codex',
      '--skills',
      `file://${process.cwd()}`,
      '--skills-ref',
      'latest',
      '--target',
      target,
    ], { cwd: process.cwd() })

    assert.equal(existsSync(join(target, '.agents', 'skills', 'tdd', 'SKILL.md')), true)
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test('installs skills into verified harness adapter roots', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-skills-targets-'))

  try {
    for (const [agent, expectedRoot] of [
      ['agents', '.agents'],
      ['claude', '.claude'],
      ['codex', '.agents'],
      ['pi', '.agents'],
    ]) {
      await execa('node', [
        'bin/kickstart.js',
        'skills',
        'install',
        'usage-limit-reducer',
        '--agent',
        agent,
        '--skills',
        `file://${process.cwd()}`,
        '--skills-ref',
        'latest',
        '--target',
        join(target, agent),
      ], { cwd: process.cwd() })

      assert.equal(existsSync(join(target, agent, expectedRoot, 'skills', 'usage-limit-reducer', 'SKILL.md')), true)
    }
  } finally {
    await rm(target, { recursive: true, force: true })
  }
})

test('installs a selected immutable skills ref unless latest is requested', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'studio-skills-ref-'))
  const pinnedTarget = join(fixture, 'pinned')
  const latestTarget = join(fixture, 'latest')

  try {
    const skillDir = join(fixture, 'repo', 'architecture', 'versioned')
    await mkdir(skillDir, { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: versioned\ndescription: pinned\n---\n\n# Pinned\n')
    await execa('git', ['init', '-q'], { cwd: join(fixture, 'repo') })
    await execa('git', ['add', '.'], { cwd: join(fixture, 'repo') })
    await execa('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'pinned'], { cwd: join(fixture, 'repo') })
    await execa('git', ['tag', 'v1.1.0'], { cwd: join(fixture, 'repo') })
    await writeFile(join(skillDir, 'SKILL.md'), '---\nname: versioned\ndescription: latest\n---\n\n# Latest\n')
    await execa('git', ['add', '.'], { cwd: join(fixture, 'repo') })
    await execa('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'latest'], { cwd: join(fixture, 'repo') })

    for (const [target, skillsRef] of [[pinnedTarget, 'v1.1.0'], [latestTarget, 'latest']]) {
      await execa('node', [
        'bin/kickstart.js',
        'skills',
        'install',
        'versioned',
        '--agent',
        'agents',
        '--skills',
        `file://${join(fixture, 'repo')}`,
        '--skills-ref',
        skillsRef,
        '--target',
        target,
      ], { cwd: process.cwd() })
    }

    assert.match(await readFile(join(pinnedTarget, '.agents', 'skills', 'versioned', 'SKILL.md'), 'utf8'), /# Pinned/)
    assert.match(await readFile(join(latestTarget, '.agents', 'skills', 'versioned', 'SKILL.md'), 'utf8'), /# Latest/)
  } finally {
    await rm(fixture, { recursive: true, force: true })
  }
})

// ── Lockfile helpers ─────────────────────────────────────────────────────────

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

// ── Lockfile written by install ───────────────────────────────────────────────

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

// ── getLatestTag ──────────────────────────────────────────────────────────────

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

// ── skills sync command ───────────────────────────────────────────────────────

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

// ── --other flag ──────────────────────────────────────────────────────────────

test('--other flag appears in CLI help', async () => {
  const { stdout } = await execa('node', ['bin/kickstart.js', '--help'], { cwd: process.cwd() })
  assert.match(stdout, /--other/)
})

// ── --mcp flag ────────────────────────────────────────────────────────────────

test('--mcp flag appears in CLI help', async () => {
  const { stdout } = await execa('node', ['bin/kickstart.js', '--help'], { cwd: process.cwd() })
  assert.match(stdout, /--mcp/)
})
