import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
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
