import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execa } from 'execa'
import chalk from 'chalk'
import { readSkills } from './skill-catalog.js'

export const AGENT_SKILL_TARGETS = {
  agents: join('.agents', 'skills'),
  claude: join('.claude', 'skills'),
  codex: join('.agents', 'skills'),
  pi: join('.agents', 'skills'),
}

export const DEFAULT_SKILLS_REF = 'v1.1.0'

export const SKILL_PACKS = {
  essential: {
    label: 'Essential Pack',
    hint: 'Manual-SDD, Antivibe, Watermelon Architect, Matt Pocock TS, Usage Limit Reducer',
    paths: [
      join('architecture', 'manual-sdd'),
      join('architecture', 'antivibe'),
      join('coding', 'watermelon-architect'),
      join('coding', 'matt-pocock-typescript'),
      join('architecture', 'usage-limit-reducer'),
    ],
  },
  agency: {
    label: 'Agency Pack',
    hint: 'SEO, Marp Slides, Spider-King, Email Campaigns',
    paths: [
      join('business', 'agentic-seo'),
      join('business', 'marp-slides'),
      join('business', 'spider-king-lead-extraction'),
      join('business', 'email-campaigns'),
    ],
  },
  security: {
    label: 'Security & Safety',
    hint: 'Shannon-Pro and Tech Debt Audit',
    paths: [
      join('business', 'shannon-security'),
      join('architecture', 'tech-debt-audit'),
    ],
  },
}

export function normalizeSkillPacks(skillPacks = ['essential']) {
  if (skillPacks === 'all') return 'all'
  const requested = Array.isArray(skillPacks) ? skillPacks : String(skillPacks).split(',')
  const normalized = requested.map((pack) => String(pack).trim()).filter(Boolean)

  if (normalized.includes('all')) return 'all'
  for (const pack of normalized) {
    if (!SKILL_PACKS[pack]) {
      throw new Error(`Unsupported skill pack "${pack}". Use one of: ${Object.keys(SKILL_PACKS).join(', ')}, all`)
    }
  }

  return normalized.length > 0 ? [...new Set(normalized)] : ['essential']
}

function selectedSkillPaths(skillPacks) {
  const normalized = normalizeSkillPacks(skillPacks)
  if (normalized === 'all') return null
  return [...new Set(normalized.flatMap((pack) => SKILL_PACKS[pack].paths))]
}

async function cloneSkillsRepo(repoUrl, targetDir, skillsRef = DEFAULT_SKILLS_REF) {
  await execa('git', ['clone', '--depth', '1', repoUrl, targetDir], { stdio: 'inherit' })
  if (skillsRef !== 'latest') {
    await execa('git', ['fetch', '--depth', '1', 'origin', `refs/tags/${skillsRef}:refs/tags/${skillsRef}`], {
      cwd: targetDir,
      stdio: 'inherit',
    }).catch(() => execa('git', ['fetch', '--depth', '1', 'origin', skillsRef], { cwd: targetDir, stdio: 'inherit' }))
    await execa('git', ['checkout', '--detach', skillsRef], { cwd: targetDir, stdio: 'inherit' })
  }
}

async function readSkillName(skillDir) {
  const content = await readFile(join(skillDir, 'SKILL.md'), 'utf8')
  const match = content.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)
  if (!match) throw new Error(`Missing valid frontmatter name: ${join(skillDir, 'SKILL.md')}`)
  return match[1]
}

async function copySkill(sourceDir, targetRoot) {
  const skillName = await readSkillName(sourceDir)
  const targetDir = join(targetRoot, skillName)
  await mkdir(targetRoot, { recursive: true })
  await cp(sourceDir, targetDir, { recursive: true, force: true })
  return skillName
}

export async function injectSkills(projectDir, repoUrl, skillPacks = ['essential'], skillsRef = DEFAULT_SKILLS_REF) {
  const tmp = await mkdtemp(join(tmpdir(), 'studio-skills-'))

  try {
    await cloneSkillsRepo(repoUrl, tmp, skillsRef)

    const paths = selectedSkillPaths(skillPacks)
    const selected = paths ?? (await readSkills(tmp)).map((skill) => join(skill.category, skill.slug))

    for (const relativePath of selected) {
      const source = join(tmp, relativePath)
      if (!existsSync(join(source, 'SKILL.md'))) {
        console.log(chalk.yellow(`[kickstart] skipped missing skill path: ${relativePath}`))
        continue
      }

      for (const targetRoot of [join(projectDir, '.agents', 'skills'), join(projectDir, '.claude', 'skills')]) {
        await copySkill(source, targetRoot)
      }
      console.log(chalk.green(`[kickstart] injected ${relativePath}`))
    }

    await cp(join(tmp, '.github', 'skills', 'SKILL_TEMPLATE.md'), join(projectDir, '.claude', 'skills', 'SKILL_TEMPLATE.md'), {
      force: true,
    }).catch(() => {})
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

export async function withSkillsRepo(repoUrl, callback, skillsRef = DEFAULT_SKILLS_REF) {
  const tmp = await mkdtemp(join(tmpdir(), 'studio-skills-'))

  try {
    await cloneSkillsRepo(repoUrl, tmp, skillsRef)
    return await callback(tmp)
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

export async function listRepoSkills(repoUrl, skillsRef = DEFAULT_SKILLS_REF) {
  return withSkillsRepo(repoUrl, (repoDir) => readSkills(repoDir), skillsRef)
}

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
    const targetDir = join(targetRoot, skill.name)
    await copySkill(sourceDir, targetRoot)
    return { ...skill, targetDir }
  }, skillsRef)
}
