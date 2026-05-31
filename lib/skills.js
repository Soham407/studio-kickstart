import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { execa } from 'execa'
import chalk from 'chalk'
import { readSkills } from './skill-catalog.js'
import { readPackageVersion } from './config.js'

export const AGENT_SKILL_TARGETS = {
  agents: join('.agents', 'skills'),
  claude: join('.claude', 'skills'),
  codex: join('.agents', 'skills'),
  pi: join('.agents', 'skills'),
}

export const DEFAULT_SKILLS_REF = 'v1.1.1'

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
