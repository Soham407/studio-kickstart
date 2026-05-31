# Contributing

Studio Skills welcomes improvements to the CLI, documentation, and skills library.

## Add a Skill

1. Choose the right category: `architecture/`, `coding/`, `business/`, or `design/`.
2. Create a folder with a descriptive kebab-case name.
3. Add a `SKILL.md` with clear trigger guidance and a focused workflow.
4. Add a `README.md` when the skill needs human-facing background, examples, or references.
5. Keep bundled scripts, templates, and assets inside the skill folder.

Use `.github/skills/SKILL_TEMPLATE.md` as the starting point when creating a new skill.

## Skill Checklist

- `SKILL.md` exists and explains when to use the skill.
- The skill has a narrow purpose and does not duplicate an existing skill.
- Frontmatter includes lowercase kebab-case `name` and a clear `description`.
- The folder lives in the category that matches the work it supports.
- Extra references are loaded progressively instead of requiring the agent to read everything upfront.
- Scripts are executable where needed and documented in the skill.
- Run `npm run skills:lint` before opening a PR.
- Run `npm run skills:catalog` after adding, removing, or renaming a skill.

## CLI Checklist

- Keep new dependencies small and justified.
- Do not package the full skills library into npm; skills are fetched at runtime.
- Keep scaffold defaults friendly to open-source users. GitHub repo creation must remain skippable.
- Any new scaffold step that writes files must be idempotent: re-running scaffold on an existing project should not clobber user edits.
- Skills written by `injectSkills` or `installSkill` must update `.studio-skills.json`. New skill-install paths that bypass these functions need to call `writeLockfile` themselves.
- MCP servers added to `lib/mcp.js` must use placeholder tokens (e.g. `${TOKEN_NAME}`) rather than real values, and must be documented in the `writeMcpConfig` flow in `ARCHITECTURE.md`.
- Test `kickstart --help`, `kickstart --version`, `npm test`, and `npm pack --dry-run` before opening a PR.

## Pull Requests

Open a PR with:

- A short description of the problem solved.
- Files changed and why.
- Manual verification steps.
- Screenshots or terminal output when CLI UX changes.
- Any compatibility notes for Claude Code, Codex, Cursor, Gemini, or OpenCode.

## Code of Conduct

Be direct, respectful, and specific. Keep feedback about the work, and help contributors leave the project clearer than they found it.
