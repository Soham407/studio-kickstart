# Architecture

Studio Kickstart has two parts:

- The CLI package, installable from a pinned GitHub release tag and prepared for future npm publication as `@studio-skills/kickstart`, which bootstraps new projects
- The skills library, fetched at runtime from a Git repository and injected into scaffolded projects

The CLI is the main product. The skills library is one layer of the project setup, alongside framework scaffolding, auth/database setup, quality gates, and agent docs.

Keeping skills out of the npm tarball keeps installs small and lets teams point `kickstart` at their own skills repo without forking the bootstrapper.

## CLI Modules

- `bin/kickstart.js`: parses CLI flags, runs update checks, dispatches to wizard or scaffold
- `lib/wizard.js`: first-time setup wizard for tools, GitHub auth, local-model preference, and default skills repo
- `lib/config.js`: manages `~/.studio-skills/config.json`
- `lib/updater.js`: daily best-effort npm registry check
- `lib/scaffold.js`: project creation and setup orchestration
- `lib/skills.js`: shallow-clones a skills repo and copies supported categories into agent-specific skills directories
- `lib/skill-catalog.js`: reads skill frontmatter, produces catalog records, and powers skill linting
- `scripts/generate-skills-catalog.js`: writes the public `skills.json` index
- `scripts/lint-skills.js`: validates skill metadata consistency

## Skills Categories

Skills are grouped by the type of decision they support:

- `architecture/`: process, planning, debugging, TDD, system design, issue workflows
- `coding/`: concrete implementation patterns for TypeScript, Next.js, Expo, and data sync
- `business/`: studio workflows such as security, SEO, pitches, demos, and outreach
- `design/`: design tokens, UI systems, and product interface guidance

Source skills remain grouped by category. New scaffolded projects receive flattened Agent Skills directories under `.agents/skills/<skill-name>/` plus a Claude Code adapter under `.claude/skills/<skill-name>/`. Individual installs support Claude Code, Codex, Pi, and the portable `.agents/skills/` target with `kickstart skills install <skill> --agent <agent>`.

## Injection Flow

1. Resolve the skills repository and immutable ref from flags, user config, or defaults.
2. Clone the repo into a temporary directory and check out the selected tag or SHA.
3. Select pack skills or all catalog skills.
4. Copy each skill by frontmatter name into `.agents/skills/` and `.claude/skills/`.
5. Copy `.github/skills/SKILL_TEMPLATE.md` when present.
6. Remove the temporary clone.

## Project Scaffold Flow

`kickstart` runs the same flow interactively when decisions are omitted. `kickstart --web|--mobile|--universal <name>` keeps the flow scriptable.

1. Validate required tools.
2. Create the framework project.
3. Create a GitHub repository when requested, or skip it with `--github skip` / `--no-github`.
4. Inject Studio Skills.
5. Install Supabase, Better-Auth, and WatermelonDB where applicable.
6. Install guardrails.
7. Write `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
8. Commit and push final bootstrap changes.

The legacy `scripts/kickstart.sh` remains as a readable bash fallback.

## Skill Catalog Flow

The generated `skills.json` file is the discovery surface for the skills layer.

1. Walk `architecture/`, `coding/`, `business/`, and `design/`.
2. Read each `SKILL.md` frontmatter.
3. Infer supported agents from the skill body.
4. Emit stable records with name, slug, category, description, readme path, and supported agents.

The catalog is generated from source rather than hand-edited:

```bash
npm run skills:catalog
```
