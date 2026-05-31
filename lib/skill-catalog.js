import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'

export const SKILL_CATEGORIES = ['architecture', 'coding', 'business', 'design']

function parseFrontmatter(content) {
  if (!content.startsWith('---\n')) return {}
  const end = content.indexOf('\n---', 4)
  if (end === -1) return {}

  const frontmatter = content.slice(4, end).trim()
  const metadata = {}
  let currentKey = null

  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match) {
      currentKey = match[1]
      const raw = match[2].trim()
      metadata[currentKey] = raw === '|' || raw === '>' ? '' : raw.replace(/^["']|["']$/g, '')
      continue
    }

    if (currentKey && metadata[currentKey] !== undefined) {
      metadata[currentKey] = `${metadata[currentKey]} ${line.trim()}`.trim()
    }
  }

  return metadata
}

async function walkSkillDirs(rootDir) {
  const skillDirs = []

  for (const category of SKILL_CATEGORIES) {
    const categoryDir = join(rootDir, category)
    if (!existsSync(categoryDir)) continue

    for (const entry of await readdir(categoryDir)) {
      const skillDir = join(categoryDir, entry)
      if ((await stat(skillDir)).isDirectory() && existsSync(join(skillDir, 'SKILL.md'))) {
        skillDirs.push({ category, slug: entry, dir: skillDir })
      }
    }
  }

  return skillDirs.sort((left, right) => `${left.category}/${left.slug}`.localeCompare(`${right.category}/${right.slug}`))
}

export async function readSkills(rootDir = process.cwd()) {
  const skills = []

  for (const skill of await walkSkillDirs(rootDir)) {
    const skillPath = join(skill.dir, 'SKILL.md')
    const readmePath = join(skill.dir, 'README.md')
    const content = await readFile(skillPath, 'utf8')
    const metadata = parseFrontmatter(content)

    skills.push({
      name: metadata.name ?? skill.slug,
      slug: skill.slug,
      category: metadata.category ?? skill.category,
      type: metadata.type ?? 'skill',
      description: metadata.description ?? '',
      tags: metadata.tags ?? '',
      path: relative(rootDir, skillPath),
      readme: existsSync(readmePath) ? relative(rootDir, readmePath) : null,
      supportedAgents: inferSupportedAgents(content),
    })
  }

  return skills
}

function inferSupportedAgents(content) {
  const agents = new Set(['claude'])
  if (/\bCodex\b|\.codex|\.agents\/skills/i.test(content)) agents.add('codex')
  if (/\bCursor\b|\.cursor/i.test(content)) agents.add('cursor')
  if (/\bGemini\b/i.test(content)) agents.add('gemini')
  if (/\bOpenCode\b/i.test(content)) agents.add('opencode')
  return [...agents].sort()
}

export async function lintSkills(rootDir = process.cwd()) {
  const issues = []
  const names = new Map()
  const skills = await readSkills(rootDir)

  for (const skill of skills) {
    if (!skill.name) issues.push(`${skill.path}: missing frontmatter name`)
    if (!skill.description) issues.push(`${skill.path}: missing frontmatter description`)
    if (skill.name && names.has(skill.name)) {
      issues.push(`${skill.path}: duplicate skill name "${skill.name}" also used by ${names.get(skill.name)}`)
    }
    names.set(skill.name, skill.path)

    if (!/^[a-z0-9][a-z0-9-]*$/.test(skill.name)) {
      issues.push(`${skill.path}: skill name must be lowercase kebab-case`)
    }
    if (skill.name !== skill.slug) {
      issues.push(`${skill.path}: skill name "${skill.name}" must match parent directory "${skill.slug}"`)
    }
    if (!SKILL_CATEGORIES.includes(skill.category)) {
      issues.push(`${skill.path}: invalid category "${skill.category}"`)
    }
  }

  return { skills, issues }
}
