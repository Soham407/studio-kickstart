import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import chalk from 'chalk'
import { isCancel, text, cancel, select, multiselect } from '@clack/prompts'
import { getSkillsRepo, loadConfig } from './config.js'
import { injectSkills, normalizeSkillPacks, SKILL_PACKS } from './skills.js'
import { resolveMcpServers, writeMcpConfig } from './mcp.js'

const SUPABASE_TS = `import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
`

const AUTH_TS = `import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  database: {
    provider: 'pg',
    url: process.env.DATABASE_URL ?? '',
  },
  emailAndPassword: { enabled: true },
  socialProviders: {},
  plugins: [],
})

export type Auth = typeof auth
`

const WATERMELON_SCHEMA_TS = `import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'posts',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
})
`

const WATERMELON_MIGRATIONS_TS = `import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

export default schemaMigrations({
  migrations: [],
})
`

const WATERMELON_DATABASE_TS = `import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import schema from './schema'
import migrations from './migrations'

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    console.error('[watermelondb] setup failed:', error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [],
})
`

const PRE_COMMIT = `#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

set -e

echo "Running lint-staged..."
pnpm lint-staged

if [ -f tsconfig.json ]; then
  echo "Type checking..."
  pnpm typecheck
fi

if [ -f .claude/skills/shannon-security/SHANNON-PRO.md ]; then
  STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\\.(ts|tsx|js|jsx)$' || true)
  if [ -n "$STAGED_FILES" ]; then
    echo "Shannon-Pro: security audit available at .claude/skills/shannon-security/"
  fi
fi

echo "Pre-commit checks passed"
`

function skillPackText(skillPacks) {
  const normalized = normalizeSkillPacks(skillPacks)
  if (normalized === 'all') return 'All Studio Skills'
  return normalized.map((pack) => SKILL_PACKS[pack].label).join(', ')
}

function productionPipelineSection() {
  return `## Production Pipeline

Sandcastle-generated PRs must be reviewed before merge. Use CodeRabbit as the automated PR audit layer for logic integrity, regression risk, and test coverage.

- Sandcastle may open or prepare implementation PRs.
- CodeRabbit should audit those PRs before human merge.
- Do not merge Sandcastle-generated changes until the CodeRabbit review has been read and any material logic or coverage findings are resolved.
- Treat CodeRabbit as a review aid, not a replacement for maintainer judgment.
`
}

function agentInstructions(projectName, type, localModelMode, localModelName, localModelRuntime, skillPacks) {
  const localModelText = localModelMode === 'skip'
    ? 'Do not assume a local model runtime is available. Use the active agent model unless the user configures a local runtime.'
    : `Prefer local models through ${localModelRuntime} (${localModelName}) for routine tasks such as file edits, simple refactors, lookups, and formatting. Use the strongest available model for complex architecture, multi-file refactors, domain modeling, and PRD synthesis.`

  const stackStandards = type === 'other'
    ? `## Stack Standards

Configure your framework, styling, and data layer here. The following are pre-installed — add your own on top:

- Auth: Better-Auth (\`lib/auth.ts\`)
- Cloud DB: Supabase (\`lib/supabase.ts\`)
- Quality gates: Husky, lint-staged, Vitest, Playwright, Sandcastle
- Design staging: \`.design-staging/\` for Open Design exports and Artifact-Pro handoff files`
    : `## Stack Standards

- Web: Next.js 16 App Router
- Mobile: Expo SDK 55
- Styling: NativeWind v4
- Universal logic: Solito 5 when applicable
- Cloud DB: Supabase
- Offline-first mobile: WatermelonDB
- Auth: Better-Auth
- Quality gates: Husky, lint-staged, Vitest, Playwright, Sandcastle
- Design staging: \`.design-staging/\` for Open Design exports and Artifact-Pro handoff files`

  return `# ${projectName}

Studio-Grade **${type}** project bootstrapped via \`kickstart\`.

## Agent And Model Routing

${localModelText}

Compatible agent entrypoints:

- Claude Code: \`CLAUDE.md\` and \`.claude/skills/\`
- Codex and Pi: \`AGENTS.md\` and \`.agents/skills/\`
- Other Agent Skills-compatible harnesses: use \`.agents/skills/\` when supported

${stackStandards}

## Design Staging Bridge

\`.design-staging/\` is for raw UI exports, screenshots, and handoff files such as \`index.html\` from Open Design. Treat files in this folder as staging inputs for the Artifact-Pro Open Design skill before translating them into production components.

## Skills Library

This project ships with portable skills at \`.agents/skills/\` and a Claude Code adapter at \`.claude/skills/\`.

Selected pack: ${skillPackText(skillPacks)}

Use \`kickstart skills install <skill> --agent <agent>\` to install individual skills for other agents.

- \`architecture/\`: engineering process, diagnosis, TDD, architecture, planning
- \`coding/\`: TypeScript, Next.js, Expo, and offline-first patterns
- \`business/\`: studio operations, security, SEO, demos, outreach
- \`design/\`: design tokens and UI systems

${productionPipelineSection()}

## MCP Servers

\`.claude/settings.json\` ships with pre-configured MCP servers. Replace placeholder values with real tokens before use:

| Server | Token required |
| --- | --- |
| \`supabase\` | \`SUPABASE_ACCESS_TOKEN\` — create at https://supabase.com/dashboard/account/tokens |
| \`github\` | \`GITHUB_TOKEN\` — create at https://github.com/settings/tokens |

To disable a server, remove its entry from \`.claude/settings.json\`. To add more, run \`kickstart --mcp filesystem\` or edit the file directly.

## Quick Commands

\`\`\`bash
pnpm dev
pnpm test
pnpm test:e2e
pnpm typecheck
\`\`\`

## Configuration Required

Add Supabase keys to \`.env.local\`, configure Better-Auth in \`lib/auth.ts\`, and define WatermelonDB models in \`model/\` for mobile or universal projects.
`
}

function logStep(label) {
  console.log(chalk.cyan(`\n━━━ ${label} ━━━`))
}

function fail(message) {
  throw new Error(chalk.red(`[kickstart] ${message}`))
}

function cancelIfNeeded(value) {
  if (isCancel(value)) {
    cancel('Scaffold cancelled.')
    process.exit(0)
  }
  return value
}

async function commandExists(command) {
  try {
    await execa(command, ['--version'])
    return true
  } catch {
    return false
  }
}

async function approveBuilds(projectDir) {
  // Let's set it globally for the user session so no child package or workspace script fails
  await execa('pnpm', ['config', 'set', 'only-built-dependencies', 'sharp,msgpackr-extract,unrs-resolver'], { cwd: projectDir }).catch(() => {})
  const packagePath = join(projectDir, 'package.json')
  if (existsSync(packagePath)) {
    try {
      const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
      pkg.pnpm ??= {}
      pkg.pnpm.onlyBuiltDependencies ??= []
      for (const dep of ['sharp', 'msgpackr-extract', 'unrs-resolver']) {
        if (!pkg.pnpm.onlyBuiltDependencies.includes(dep)) {
          pkg.pnpm.onlyBuiltDependencies.push(dep)
        }
      }
      await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
    } catch {}
  }
  await execa('pnpm', ['approve-builds', '--all'], { cwd: projectDir, stdio: 'inherit' }).catch(() => {})
}

async function ensureWorkspaceBuildApprovals(projectDir) {
  const workspacePath = join(projectDir, 'pnpm-workspace.yaml')
  if (!existsSync(workspacePath)) {
    await approveBuilds(projectDir)
    return
  }

  const contents = await readFile(workspacePath, 'utf8')
  const lines = contents.split('\n')
  const kept = []
  let skippingBlock = false

  for (const line of lines) {
    const isTopLevelKey = /^[A-Za-z0-9_-]+:/.test(line)

    if (skippingBlock) {
      if (!isTopLevelKey && line.trim() !== '') continue
      skippingBlock = false
    }

    if (line.startsWith('allowBuilds:') || line.startsWith('ignoredBuiltDependencies:')) {
      skippingBlock = true
      continue
    }

    kept.push(line)
  }

  while (kept.length > 0 && kept[kept.length - 1] === '') kept.pop()
  kept.push('allowBuilds:', '  sharp: true', '  unrs-resolver: true', '  msgpackr-extract: true')
  kept.push('')
  await writeFile(workspacePath, `${kept.join('\n')}`)
  await approveBuilds(projectDir)
}

export function pnpmAddArgs(type, deps, options = {}) {
  const args = ['add']
  if (type === 'universal') args.push('-w')
  if (options.dev) args.push('-D')
  if (type === 'mobile' || type === 'universal') {
    args.push('--allow-build=sharp', '--allow-build=msgpackr-extract', '--allow-build=unrs-resolver')
  }
  return [...args, ...deps]
}

async function removeWorkspaceNodeModules(projectDir, workspaceDir) {
  const root = join(projectDir, workspaceDir)
  let entries = []
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => rm(join(root, entry.name, 'node_modules'), { recursive: true, force: true })))
}

export async function normalizeUniversalProjectPackageManager(projectDir) {
  await rm(join(projectDir, 'yarn.lock'), { force: true })
  await rm(join(projectDir, '.yarn'), { recursive: true, force: true })
  await rm(join(projectDir, '.yarnrc.yml'), { force: true })
  await rm(join(projectDir, 'node_modules'), { recursive: true, force: true })
  await removeWorkspaceNodeModules(projectDir, 'apps')
  await removeWorkspaceNodeModules(projectDir, 'packages')

  const packagePath = join(projectDir, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  delete pkg.packageManager
  delete pkg.workspaces
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
  await writeFile(join(projectDir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n")

  const pkgUpdated = JSON.parse(await readFile(packagePath, 'utf8'))
  pkgUpdated.pnpm ??= {}
  pkgUpdated.pnpm.onlyBuiltDependencies ??= []
  for (const dep of ['sharp', 'msgpackr-extract', 'unrs-resolver']) {
    if (!pkgUpdated.pnpm.onlyBuiltDependencies.includes(dep)) {
      pkgUpdated.pnpm.onlyBuiltDependencies.push(dep)
    }
  }
  await writeFile(packagePath, `${JSON.stringify(pkgUpdated, null, 2)}\n`)
  // Let's write to .npmrc to be absolutely sure pnpm picks it up at the workspace level
  await writeFile(join(projectDir, '.npmrc'), 'only-built-dependencies[]=sharp\nonly-built-dependencies[]=unrs-resolver\nonly-built-dependencies[]=msgpackr-extract\n')

  await approveBuilds(projectDir)
  try {
    await execa('pnpm', ['install'], { cwd: projectDir, stdio: 'inherit' })
  } catch (err) {
    // If it failed because of ignored built dependencies, run approve-builds again and retry
    await execa('pnpm', ['approve-builds', '--all'], { cwd: projectDir, stdio: 'inherit' }).catch(() => {})
    await execa('pnpm', ['install'], { cwd: projectDir, stdio: 'inherit' })
  }
}

async function validateEnvironment(githubMode) {
  logStep('Step 1/8: Validating environment')
  const missing = []

  const requiredCommands = githubMode === 'skip' ? ['pnpm', 'node'] : ['pnpm', 'gh', 'node']
  for (const command of requiredCommands) {
    if (!(await commandExists(command))) missing.push(command)
  }

  if (await commandExists('node')) {
    const { stdout } = await execa('node', ['--version'])
    const major = Number(stdout.replace(/^v/, '').split('.')[0])
    if (major < 20) missing.push(`node >= 20 (current: ${stdout})`)
  }

  if (githubMode !== 'skip' && await commandExists('gh')) {
    try {
      await execa('gh', ['auth', 'status'])
      console.log(chalk.green('[kickstart] gh authenticated'))
    } catch {
      missing.push('gh auth login')
    }
  }

  if (!(await commandExists('docker'))) {
    console.log(chalk.yellow('[kickstart] docker not found; install Docker Desktop, Docker Engine, Podman, or OrbStack for container workloads'))
  }

  if (missing.length > 0) {
    fail(`Missing required tools: ${missing.join(', ')}`)
  }
}

async function createProject(type, projectName) {
  logStep(`Step 2/8: Scaffolding ${type}`)
  if (type === 'web') {
    await execa('pnpm', [
      'dlx',
      '--allow-build=sharp',
      'create-next-app@latest',
      projectName,
      '--typescript',
      '--tailwind',
      '--app',
      '--src-dir',
      '--import-alias',
      '@/*',
      '--use-pnpm',
      '--no-eslint',
      '--no-turbopack',
    ], { stdio: 'inherit' })
  } else if (type === 'mobile') {
    // Make sure we approve builds or set only-built-dependencies globally/locally first
    await execa('pnpm', ['config', 'set', 'only-built-dependencies', 'sharp', 'msgpackr-extract', 'unrs-resolver'], { cwd: process.cwd() }).catch(() => {})
    await execa('pnpm', ['dlx', '--allow-build=sharp', '--allow-build=msgpackr-extract', 'create-expo-app@latest', projectName, '--template', 'blank-typescript', '--yes'], { stdio: 'inherit' })
  } else {
    await execa('pnpm', ['config', 'set', 'only-built-dependencies', 'sharp', 'msgpackr-extract', 'unrs-resolver'], { cwd: process.cwd() }).catch(() => {})
    await execa('pnpm', ['dlx', '--allow-build=sharp', 'create-solito-app@latest', projectName], { stdio: 'inherit' })
  }

  const projectDir = resolve(projectName)
  await ensureWorkspaceBuildApprovals(projectDir)
  if (type === 'universal') {
    await normalizeUniversalProjectPackageManager(projectDir)
    await ensureWorkspaceBuildApprovals(projectDir)
  }

  const nativeWindDeps = type === 'web' ? ['nativewind@latest', 'react-native-web'] : ['nativewind@latest']
  await approveBuilds(projectDir)
  await execa('pnpm', [...pnpmAddArgs(type, nativeWindDeps)], { cwd: projectDir, stdio: 'inherit' })
  if (type === 'mobile') {
    await execa('pnpm', [...pnpmAddArgs(type, ['tailwindcss@^3'], { dev: true })], { cwd: projectDir, stdio: 'inherit' })
  }

  return projectDir
}

async function setupGithubRepo(projectDir, projectName, githubMode) {
  if (githubMode === 'skip') {
    logStep('Step 3/8: Skipping GitHub repository')
    return
  }

  logStep(`Step 3/8: Creating ${githubMode} GitHub repository`)
  if (!existsSync(join(projectDir, '.git'))) {
    await execa('git', ['init', '-b', 'main'], { cwd: projectDir, stdio: 'inherit' })
    await execa('git', ['add', '.'], { cwd: projectDir })
    await execa('git', ['commit', '-m', 'chore: initial scaffold'], { cwd: projectDir }).catch(() => {})
  }

  try {
    await execa('gh', ['repo', 'create', projectName, `--${githubMode}`, '--source=.', '--remote=origin', '--push'], { cwd: projectDir, stdio: 'inherit' })
  } catch {
    const alternate = cancelIfNeeded(await text({
      message: `Repo "${projectName}" could not be created. Enter an alternate name, or "skip".`,
      defaultValue: 'skip',
    }))
    if (alternate && alternate !== 'skip') {
      await execa('gh', ['repo', 'create', alternate, `--${githubMode}`, '--source=.', '--remote=origin', '--push'], { cwd: projectDir, stdio: 'inherit' }).catch(() => {
        console.log(chalk.yellow('[kickstart] GitHub repo creation failed; continuing without remote'))
      })
    }
  }
}

async function installDatabaseAndAuth(projectDir, type) {
  logStep('Step 5/8: Installing database & auth')
  await approveBuilds(projectDir)
  await execa('pnpm', [...pnpmAddArgs(type, ['@supabase/supabase-js', 'better-auth'])], { cwd: projectDir, stdio: 'inherit' })
  await mkdir(join(projectDir, 'lib'), { recursive: true })
  await mkdir(join(projectDir, '.design-staging'), { recursive: true })
  await writeFile(join(projectDir, '.design-staging', '.gitkeep'), '')
  await writeFile(join(projectDir, 'lib', 'supabase.ts'), SUPABASE_TS)
  await writeFile(join(projectDir, 'lib', 'auth.ts'), AUTH_TS)

  if (type === 'mobile' || type === 'universal') {
    await execa('pnpm', [...pnpmAddArgs(type, ['@nozbe/watermelondb'])], { cwd: projectDir, stdio: 'inherit' })
    await execa('pnpm', [...pnpmAddArgs(type, ['@babel/plugin-proposal-decorators'], { dev: true })], { cwd: projectDir, stdio: 'inherit' })
    await mkdir(join(projectDir, 'model'), { recursive: true })
    await writeFile(join(projectDir, 'model', 'schema.ts'), WATERMELON_SCHEMA_TS)
    await writeFile(join(projectDir, 'model', 'migrations.ts'), WATERMELON_MIGRATIONS_TS)
    await writeFile(join(projectDir, 'model', 'database.ts'), WATERMELON_DATABASE_TS)
  }
}

async function setupGuardrails(projectDir, type) {
  logStep('Step 6/8: Installing production guardrails')
  await approveBuilds(projectDir)
  await execa('pnpm', [...pnpmAddArgs(type, ['husky', 'lint-staged', 'vitest', '@playwright/test', 'prettier', '@ai-hero/sandcastle'], { dev: true })], { cwd: projectDir, stdio: 'inherit' })
  await execa('pnpm', ['dlx', 'husky', 'init'], { cwd: projectDir }).catch(() => {})
  await mkdir(join(projectDir, '.husky'), { recursive: true })
  await writeFile(join(projectDir, '.husky', 'pre-commit'), PRE_COMMIT)
  await chmod(join(projectDir, '.husky', 'pre-commit'), 0o755)

  const packagePath = join(projectDir, 'package.json')
  const pkg = JSON.parse(await readFile(packagePath, 'utf8'))
  pkg['lint-staged'] ??= {
    '*.{ts,tsx,js,jsx}': ['prettier --write'],
    '*.{json,md,yml}': ['prettier --write'],
  }
  pkg.scripts ??= {}
  pkg.scripts.test ??= 'vitest'
  pkg.scripts['test:e2e'] ??= 'playwright test'
  pkg.scripts.typecheck ??= 'tsc --noEmit'
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

async function writeAgentDocs(projectDir, projectName, type, localModelMode, localModelName, localModelRuntime, skillPacks) {
  logStep('Step 7/8: Writing agent docs')
  const instructions = agentInstructions(projectName, type, localModelMode, localModelName, localModelRuntime, skillPacks)
  await writeFile(join(projectDir, 'AGENTS.md'), instructions)
  await writeFile(join(projectDir, 'CLAUDE.md'), instructions)
  await writeFile(join(projectDir, 'GEMINI.md'), instructions)
  await writeProjectReadmePipeline(projectDir)
}

async function finalize(projectDir, projectName, type, githubMode) {
  logStep('Step 8/8: Finalizing')
  await execa('git', ['add', '-A'], { cwd: projectDir }).catch(() => {})
  await execa('git', ['commit', '-m', 'chore: studio kickstart - inject skills, guardrails, DB/Auth'], { cwd: projectDir }).catch(() => {})
  if (githubMode === 'skip') {
    console.log(chalk.yellow('[kickstart] GitHub push skipped'))
    console.log(chalk.green(`\n${projectName} ready.`))
    console.log(`cd ${projectName}`)
    console.log(type === 'mobile' ? 'pnpm start' : 'pnpm dev')
    return
  }

  await execa('git', ['push', '-u', 'origin', 'main'], { cwd: projectDir }).catch(() => {
    console.log(chalk.yellow('[kickstart] Push skipped or failed; run git push -u origin main manually if needed'))
  })

  console.log(chalk.green(`\n${projectName} ready.`))
  console.log(`cd ${projectName}`)
  console.log(type === 'mobile' ? 'pnpm start' : 'pnpm dev')
}

async function resolveType(options) {
  const selected = ['web', 'mobile', 'universal'].filter((type) => options[type])
  if (selected.length > 1) fail('Choose only one project type: --web, --mobile, or --universal')
  if (selected[0]) return selected[0]

  return cancelIfNeeded(await select({
    message: 'What kind of project do you want to create?',
    options: [
      { value: 'web', label: 'Web app', hint: 'Next.js App Router' },
      { value: 'mobile', label: 'Mobile app', hint: 'Expo' },
      { value: 'universal', label: 'Universal app', hint: 'Turborepo + Solito' },
    ],
    initialValue: 'web',
  }))
}

async function resolveProjectName(name) {
  const projectName = name ?? cancelIfNeeded(await text({
    message: 'Project name',
    placeholder: 'my-app',
    validate(value) {
      if (!value) return 'Enter a project name.'
      if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) return 'Use lowercase letters, numbers, and hyphens only.'
      if (existsSync(value)) return `Directory already exists: ${value}`
    },
  }))

  if (!/^[a-z0-9][a-z0-9-]*$/.test(projectName)) fail(`Project name must be lowercase alphanumeric with hyphens: ${projectName}`)
  if (existsSync(projectName)) fail(`Directory already exists: ${projectName}`)
  return projectName
}

async function resolveGithubMode(options) {
  if (options.github === false) return 'skip'
  if (!options.github) {
    return cancelIfNeeded(await select({
      message: 'Create a GitHub repository?',
      options: [
        { value: 'skip', label: 'Skip GitHub', hint: 'Local project only' },
        { value: 'private', label: 'Private GitHub repo', hint: 'Requires gh auth' },
        { value: 'public', label: 'Public GitHub repo', hint: 'Requires gh auth' },
      ],
      initialValue: 'skip',
    }))
  }

  const mode = options.github
  if (!['private', 'public', 'skip'].includes(mode)) fail('GitHub mode must be private, public, or skip')
  return mode
}

async function resolveLocalModelMode(config) {
  const mode = config.localModel ?? config.ollama ?? 'ask'
  if (mode !== 'ask') return mode

  return cancelIfNeeded(await select({
    message: 'How should this project describe local model usage?',
    options: [
      { value: 'prefer', label: 'Prefer local models', hint: 'Ollama, LM Studio, llama.cpp, Open WebUI, etc.' },
      { value: 'skip', label: 'Do not assume local models', hint: 'Use Claude Code, Codex, Gemini CLI, or your active agent model' },
    ],
    initialValue: 'skip',
  }))
}

async function resolveSkillPacks(options) {
  if (options.allSkills) return 'all'
  if (options.skillPack) return normalizeSkillPacks(options.skillPack)

  return normalizeSkillPacks(cancelIfNeeded(await multiselect({
    message: 'Which Studio skill packs should be installed?',
    options: Object.entries(SKILL_PACKS).map(([value, pack]) => ({
      value,
      label: pack.label,
      hint: pack.hint,
    })),
    initialValues: ['essential'],
    required: true,
  })))
}

async function writeProjectReadmePipeline(projectDir) {
  const readmePath = join(projectDir, 'README.md')
  const section = `\n${productionPipelineSection()}`

  try {
    const current = await readFile(readmePath, 'utf8')
    if (current.includes('## Production Pipeline')) return
    await writeFile(readmePath, `${current.trimEnd()}\n${section}`)
  } catch {
    await writeFile(readmePath, `# Project\n${section}`)
  }
}

export async function scaffold(name, options = {}) {
  const type = await resolveType(options)
  const projectName = await resolveProjectName(name)

  const config = loadConfig()
  const repoUrl = getSkillsRepo(options.skills)
  const localModelMode = await resolveLocalModelMode(config)
  const localModelName = config.localModelName ?? config.ollamaModel
  const localModelRuntime = config.localModelRuntime ?? 'ollama'
  const githubMode = await resolveGithubMode(options)
  const skillPacks = await resolveSkillPacks(options)

  console.log(chalk.cyan('\nkickstart'))
  console.log(`Bootstrapping ${projectName} (${type})`)
  console.log(`Skill packs: ${skillPackText(skillPacks)}`)

  await validateEnvironment(githubMode)
  const projectDir = await createProject(type, projectName)
  await setupGithubRepo(projectDir, projectName, githubMode)
  logStep('Step 4/8: Injecting Studio Skills library')
  await injectSkills(projectDir, repoUrl, skillPacks, options.skillsRef ?? config.skillsRef)
  await writeMcpConfig(projectDir, resolveMcpServers(options.mcp))
  await installDatabaseAndAuth(projectDir, type)
  await setupGuardrails(projectDir, type)
  await writeAgentDocs(projectDir, projectName, type, localModelMode, localModelName, localModelRuntime, skillPacks)
  await finalize(projectDir, projectName, type, githubMode)
}
