import test from 'node:test'
import assert from 'node:assert/strict'
import { readSkills, lintSkills } from '../lib/skill-catalog.js'

test('reads skills from the repository categories', async () => {
  const skills = await readSkills(process.cwd())

  assert.equal(skills.length, 31)
  assert.ok(skills.some((skill) => skill.name === 'tdd'))
  assert.ok(skills.some((skill) => skill.name === 'claude-plugin-powerpack'))
  assert.ok(skills.every((skill) => skill.path.endsWith('/SKILL.md')))
})

test('current skills pass catalog lint', async () => {
  const { issues } = await lintSkills(process.cwd())

  assert.deepEqual(issues, [])
})

test('installable skills use standard parent-directory names', async () => {
  const skills = await readSkills(process.cwd())

  assert.deepEqual(skills.filter((skill) => skill.name !== skill.slug), [])
})
