import { execa } from 'execa'
import chalk from 'chalk'
import { intro, outro, select, text, confirm, spinner, isCancel, cancel } from '@clack/prompts'
import { CONFIG_PATH, DEFAULTS, saveConfig } from './config.js'

const TOOL_FIXES = {
  pnpm: 'brew install pnpm',
  gh: 'brew install gh',
  node: 'brew install node',
  docker: 'Install Docker Desktop, Docker Engine, Podman, or OrbStack',
  ollama: 'Install Ollama from https://ollama.com, or use LM Studio / llama.cpp',
}

async function commandExists(command) {
  try {
    await execa(command, ['--version'])
    return true
  } catch {
    return false
  }
}

async function checkTool(command, label, required = true) {
  const exists = await commandExists(command)
  return {
    command,
    label,
    required,
    ok: exists,
    fix: TOOL_FIXES[command],
  }
}

function exitIfCancel(value) {
  if (isCancel(value)) {
    cancel('Setup cancelled.')
    process.exit(0)
  }
  return value
}

export function validateSkillsRepo(value) {
  if (!value.startsWith('https://') && !value.startsWith('git@')) {
    return 'Enter an HTTPS or SSH git repository URL.'
  }
}

export async function runWizard() {
  intro(chalk.cyan('kickstart setup'))
  console.log('Studio Skills bootstraps agent-ready projects with shared skills, guardrails, database/auth defaults, and optional local-model guidance.\n')

  const s = spinner()
  s.start('Checking local tools')
  const checks = await Promise.all([
    checkTool('pnpm', 'pnpm'),
    checkTool('gh', 'GitHub CLI'),
    checkTool('node', 'Node.js'),
    checkTool('docker', 'Docker-compatible runtime', false),
    checkTool('ollama', 'Ollama / local model runtime', false),
  ])
  s.stop('Tool check complete')

  for (const check of checks) {
    const mark = check.ok ? chalk.green('OK') : check.required ? chalk.red('MISSING') : chalk.yellow('OPTIONAL')
    console.log(`${mark} ${check.label}${check.ok ? '' : ` - ${check.fix}`}`)
  }

  const ghInstalled = checks.find((check) => check.command === 'gh')?.ok
  if (ghInstalled) {
    try {
      await execa('gh', ['auth', 'status'])
      console.log(`${chalk.green('OK')} GitHub CLI authenticated`)
    } catch {
      const login = exitIfCancel(await confirm({
        message: 'GitHub CLI is not authenticated. Run gh auth login now?',
        initialValue: true,
      }))
      if (login) {
        await execa('gh', ['auth', 'login'], { stdio: 'inherit' })
      }
    }
  }

  const localModel = exitIfCancel(await select({
    message: 'How should new projects describe local model usage?',
    options: [
      { value: 'ask', label: 'Ask me each new project' },
      { value: 'prefer', label: 'Prefer local models for routine tasks' },
      { value: 'skip', label: 'Do not assume a local model is available' },
    ],
    initialValue: 'ask',
  }))

  const skillsRepo = exitIfCancel(await text({
    message: 'Default skills repository',
    placeholder: DEFAULTS.skillsRepo,
    initialValue: DEFAULTS.skillsRepo,
    validate: validateSkillsRepo,
  }))

  saveConfig({
    skillsRepo,
    localModel,
    ollama: localModel,
    version: DEFAULTS.version,
  })

  outro(`Setup complete. Config saved at ${CONFIG_PATH}\nRun: kickstart`)
}
