import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

export const CONFIG_PATH = join(homedir(), '.studio-skills', 'config.json')

export const DEFAULTS = {
  skillsRepo: 'https://github.com/Soham407/studio-kickstart.git',
  skillsRef: 'v1.1.1',
  localModel: 'ask',
  localModelRuntime: 'ollama',
  localModelName: 'qwen2.5-coder:14b',
  ollama: 'ask',
  ollamaModel: 'qwen2.5-coder:14b',
  version: '1.0.0',
  lastUpdateCheck: 0,
}

export function loadConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(updates) {
  const next = { ...loadConfig(), ...updates }
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

export function getSkillsRepo(flagOverride) {
  return flagOverride ?? loadConfig().skillsRepo ?? DEFAULTS.skillsRepo
}

export function readPackageVersion() {
  const here = dirname(fileURLToPath(import.meta.url))
  const packagePath = join(here, '..', 'package.json')
  try {
    return JSON.parse(readFileSync(packagePath, 'utf8')).version
  } catch {
    return DEFAULTS.version
  }
}
