#!/usr/bin/env node

import { Command } from 'commander'
import { cancel, isCancel, select } from '@clack/prompts'
import chalk from 'chalk'
import { checkForUpdate } from '../lib/updater.js'
import { runWizard } from '../lib/wizard.js'
import { scaffold } from '../lib/scaffold.js'
import { getSkillsRepo, readPackageVersion } from '../lib/config.js'
import { AGENT_SKILL_TARGETS, getLatestTag, installSkill, listRepoSkills, readLockfile, syncSkills } from '../lib/skills.js'

const program = new Command()

function cancelIfNeeded(value) {
  if (isCancel(value)) {
    cancel('Command cancelled.')
    process.exit(0)
  }
  return value
}

program
  .name('kickstart')
  .description('Bootstrap agent-ready apps with frameworks, tools, guardrails, and skills')
  .version(readPackageVersion())
  .option('--init', 'Run the first-time setup wizard')
  .option('--web', 'Scaffold a Next.js web project')
  .option('--mobile', 'Scaffold an Expo mobile project')
  .option('--universal', 'Scaffold a Turborepo + Solito universal project')
  .option('--other', 'Bare project: git init + agent setup only, no framework scaffold')
  .option('--skills <url>', 'Custom skills repo URL')
  .option('--skills-ref <ref>', 'Skills Git tag, commit SHA, or latest')
  .option('--skill-pack <packs>', 'Comma-separated skill packs: essential, agency, security, or all')
  .option('--all-skills', 'Install every Studio Skill instead of selecting a pack')
  .option('--github <mode>', 'GitHub repo mode: private, public, or skip')
  .option('--no-github', 'Skip GitHub repository creation')
  .option('--mcp <servers>', 'MCP servers to wire: supabase, github, filesystem (comma-separated). Use "none" to skip. Default: supabase,github')
  .argument('[name]', 'Project name')
  .action(async (name, options) => {
    if (options.init) {
      await runWizard()
      return
    }

    await scaffold(name, options)
  })

const skills = program.command('skills').description('Browse and install Studio Skills')

skills
  .command('list')
  .description('List available skills from the configured skills repository')
  .option('--skills <url>', 'Custom skills repo URL')
  .option('--skills-ref <ref>', 'Skills Git tag, commit SHA, or latest')
  .action(async (options) => {
    const repoUrl = getSkillsRepo(options.skills ?? program.opts().skills)
    const available = await listRepoSkills(repoUrl, options.skillsRef ?? program.opts().skillsRef)
    for (const skill of available) {
      console.log(`${skill.category}/${skill.slug}  ${skill.name}  ${skill.description}`)
    }
  })

skills
  .command('install')
  .description('Install one skill into the current project for a supported agent')
  .argument('<skill>', 'Skill name or folder slug')
  .option('--skills <url>', 'Custom skills repo URL')
  .option('--skills-ref <ref>', 'Skills Git tag, commit SHA, or latest')
  .option('--target <dir>', 'Project directory', process.cwd())
  .option('--agent <agent>', `Agent target: ${Object.keys(AGENT_SKILL_TARGETS).join(', ')}`)
  .action(async (skillName, options) => {
    const repoUrl = getSkillsRepo(options.skills ?? program.opts().skills)
    const agent = options.agent ?? cancelIfNeeded(await select({
      message: 'Which agent should receive this skill?',
      options: Object.keys(AGENT_SKILL_TARGETS).map((agentName) => ({
        value: agentName,
        label: agentName,
        hint: AGENT_SKILL_TARGETS[agentName],
      })),
      initialValue: 'claude',
    }))
    const skill = await installSkill(options.target, repoUrl, skillName, agent, options.skillsRef ?? program.opts().skillsRef)
    console.log(`Installed ${skill.category}/${skill.slug} into ${skill.targetDir}`)
  })

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

checkForUpdate()
program.parseAsync().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
