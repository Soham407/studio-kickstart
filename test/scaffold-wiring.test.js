import test from 'node:test'
import assert from 'node:assert/strict'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import { DEFAULTS } from '../lib/config.js'
import { normalizeUniversalProjectPackageManager, pnpmAddArgs } from '../lib/scaffold.js'
import { injectSkills, normalizeSkillPacks, SKILL_PACKS } from '../lib/skills.js'
import { validateSkillsRepo } from '../lib/wizard.js'

test('uses the Studio Skills repository as the default skills source', async () => {
  assert.equal(DEFAULTS.skillsRepo, 'https://github.com/Soham407/studio-kickstart.git')

  const bash = await readFile('scripts/kickstart.sh', 'utf8')
  assert.match(bash, /STUDIO_SKILLS_REPO="https:\/\/github\.com\/Soham407\/studio-kickstart\.git"/)
})

test('accepts the wizard default skills repository', () => {
  assert.equal(validateSkillsRepo(DEFAULTS.skillsRepo), undefined)
  assert.match(validateSkillsRepo('not-a-git-url'), /HTTPS or SSH/)
})

test('installs Sandcastle into scaffolded projects', async () => {
  const scaffold = await readFile('lib/scaffold.js', 'utf8')
  const bash = await readFile('scripts/kickstart.sh', 'utf8')

  assert.match(scaffold, /'@ai-hero\/sandcastle'/)
  assert.match(bash, /@ai-hero\/sandcastle/)
})

test('creates the design staging folder in scaffolded projects', async () => {
  const scaffold = await readFile('lib/scaffold.js', 'utf8')
  const bash = await readFile('scripts/kickstart.sh', 'utf8')

  assert.match(scaffold, /\.design-staging/)
  assert.match(scaffold, /\.gitkeep/)
  assert.match(bash, /mkdir -p \.design-staging/)
  assert.match(bash, /touch \.design-staging\/\.gitkeep/)
})

test('defines anti-bloat skill packs for scaffold injection', () => {
  assert.deepEqual(Object.keys(SKILL_PACKS), ['essential', 'agency', 'security'])
  assert.equal(normalizeSkillPacks('agency,security').join(','), 'agency,security')
  assert.equal(normalizeSkillPacks('all'), 'all')
  assert.throws(() => normalizeSkillPacks('unknown'), /Unsupported skill pack/)
})

test('keeps the Bash fallback pinned and portable', async () => {
  const bash = await readFile('scripts/kickstart.sh', 'utf8')

  assert.match(bash, /SKILLS_REF="\$\{SKILLS_REF:-v1\.1\.1\}"/)
  assert.match(bash, /mkdir -p \.agents\/skills \.claude\/skills/)
  assert.match(bash, /cp -r "\$skill_dir" "\.agents\/skills\/\$skill_name"/)
  assert.match(bash, /cp -r "\$skill_dir" "\.claude\/skills\/\$skill_name"/)
})

test('configures skill packs with discoverable skill directories', () => {
  for (const pack of Object.values(SKILL_PACKS)) {
    for (const skillPath of pack.paths) {
      assert.equal(existsSync(join(skillPath, 'SKILL.md')), true, `${skillPath} must contain SKILL.md`)
    }
  }
})

test('injects flattened essential skills into portable and Claude roots', async () => {
  const target = await mkdtemp(join(tmpdir(), 'studio-skills-pack-'))
  const fixture = await mkdtemp(join(tmpdir(), 'studio-skills-pack-repo-'))

  try {
    for (const [skillPath, name] of [
      ['architecture/manual-sdd', 'manual-sdd'],
      ['architecture/antivibe', 'antivibe'],
      ['coding/watermelon-architect', 'watermelon-architect'],
      ['coding/matt-pocock-typescript', 'matt-pocock-typescript'],
      ['architecture/usage-limit-reducer', 'usage-limit-reducer'],
    ]) {
      await mkdir(join(fixture, skillPath), { recursive: true })
      await writeFile(join(fixture, skillPath, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture\n---\n`)
    }
    await execa('git', ['init', '-q'], { cwd: fixture })
    await execa('git', ['add', '.'], { cwd: fixture })
    await execa('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-qm', 'fixture'], { cwd: fixture })

    await injectSkills(target, `file://${fixture}`, ['essential'], 'latest')

    for (const root of ['.agents', '.claude']) {
      assert.equal(existsSync(join(target, root, 'skills', 'manual-sdd', 'SKILL.md')), true)
      assert.equal(existsSync(join(target, root, 'skills', 'watermelon-architect', 'SKILL.md')), true)
      assert.equal(existsSync(join(target, root, 'skills', 'matt-pocock-typescript', 'SKILL.md')), true)
      assert.equal(existsSync(join(target, root, 'skills', 'architecture')), false)
    }
  } finally {
    await rm(target, { recursive: true, force: true })
    await rm(fixture, { recursive: true, force: true })
  }
})

test('documents CodeRabbit production pipeline in generated project docs', async () => {
  const scaffold = await readFile('lib/scaffold.js', 'utf8')
  const bash = await readFile('scripts/kickstart.sh', 'utf8')
  const template = await readFile('scripts/templates/CLAUDE.md.template', 'utf8')

  assert.match(scaffold, /CodeRabbit/)
  assert.match(scaffold, /Sandcastle-generated PRs/)
  assert.match(bash, /CodeRabbit/)
  assert.match(bash, /Sandcastle-generated PRs/)
  assert.match(template, /CodeRabbit/)
  assert.match(template, /Sandcastle-generated PRs/)
})

test('normalizes Solito universal projects to pnpm', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'studio-universal-'))
  const projectDir = join(tempDir, 'app')
  const binDir = join(tempDir, 'bin')
  const oldPath = process.env.PATH

  try {
    await mkdir(join(projectDir, '.yarn'), { recursive: true })
    await mkdir(join(projectDir, 'node_modules'), { recursive: true })
    await mkdir(join(projectDir, 'apps', 'next', 'node_modules'), { recursive: true })
    await mkdir(join(projectDir, 'packages', 'app', 'node_modules'), { recursive: true })
    await mkdir(binDir)
    await writeFile(join(projectDir, 'yarn.lock'), '')
    await writeFile(join(projectDir, '.yarnrc.yml'), 'nodeLinker: node-modules\n')
    await writeFile(join(projectDir, 'package.json'), `${JSON.stringify({
      name: 'app',
      packageManager: 'yarn@4.7.0',
      workspaces: ['apps/*', 'packages/*'],
      scripts: { dev: 'turbo dev' },
    }, null, 2)}\n`)
    await writeFile(join(binDir, 'pnpm'), '#!/usr/bin/env sh\necho "$@" > "$PWD/.pnpm-args"\n')
    await chmod(join(binDir, 'pnpm'), 0o755)

    process.env.PATH = `${binDir}:${oldPath}`
    await normalizeUniversalProjectPackageManager(projectDir)

    const pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'))
    assert.equal(pkg.packageManager, undefined)
    assert.equal(pkg.workspaces, undefined)
    assert.equal(existsSync(join(projectDir, 'yarn.lock')), false)
    assert.equal(existsSync(join(projectDir, '.yarn')), false)
    assert.equal(existsSync(join(projectDir, '.yarnrc.yml')), false)
    assert.equal(existsSync(join(projectDir, 'node_modules')), false)
    assert.equal(existsSync(join(projectDir, 'apps', 'next', 'node_modules')), false)
    assert.equal(existsSync(join(projectDir, 'packages', 'app', 'node_modules')), false)
    assert.equal(await readFile(join(projectDir, 'pnpm-workspace.yaml'), 'utf8'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n")
    assert.equal((await readFile(join(projectDir, '.pnpm-args'), 'utf8')).trim(), 'install')
  } finally {
    process.env.PATH = oldPath
    await rm(tempDir, { recursive: true, force: true })
  }
})

test('uses pnpm workspace root flags for universal dependency installs', () => {
  assert.deepEqual(pnpmAddArgs('universal', ['nativewind@latest']), ['add', '-w', '--allow-build=sharp', '--allow-build=msgpackr-extract', '--allow-build=unrs-resolver', 'nativewind@latest'])
  assert.deepEqual(pnpmAddArgs('universal', ['vitest'], { dev: true }), ['add', '-w', '-D', '--allow-build=sharp', '--allow-build=msgpackr-extract', '--allow-build=unrs-resolver', 'vitest'])
  assert.deepEqual(pnpmAddArgs('web', ['nativewind@latest']), ['add', 'nativewind@latest'])
})
