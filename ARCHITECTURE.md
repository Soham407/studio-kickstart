# Architecture

Studio Kickstart has two parts:

- The CLI package, published to npm as `studio-kickstart`, which bootstraps new projects
- The skills library, fetched at runtime from a Git repository and injected into scaffolded projects

The CLI is the main product. The skills library is one layer of the project setup, alongside framework scaffolding, auth/database setup, MCP server wiring, quality gates, and agent docs.

Keeping skills out of the npm tarball keeps installs small and lets teams point `kickstart` at their own skills repo without forking the bootstrapper.

## CLI Modules

- `bin/kickstart.js`: parses CLI flags, runs update checks, dispatches to wizard or scaffold
- `lib/wizard.js`: first-time setup wizard for tools, GitHub auth, local-model preference, and default skills repo
- `lib/config.js`: manages `~/.studio-skills/config.json`
- `lib/updater.js`: daily best-effort npm registry check
- `lib/scaffold.js`: project creation and setup orchestration
- `lib/skills.js`: shallow-clones a skills repo, copies skills into agent directories, writes and reads the `.studio-skills.json` lockfile, and handles sync/upgrade
- `lib/mcp.js`: MCP server registry (`supabase`, `github`, `filesystem`) and `.claude/settings.json` config writing
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

## Project Scaffold Flow

`kickstart` runs the same flow interactively when decisions are omitted. `kickstart --web|--mobile|--universal|--other <name>` keeps the flow scriptable.

1. Validate required tools.
2. Create the framework project (`--web` → Next.js, `--mobile` → Expo, `--universal` → Turborepo + Solito, `--other` → bare `package.json` + `git init`).
3. Create a GitHub repository when requested, or skip it with `--github skip` / `--no-github`.
4. Inject Studio Skills → writes `.studio-skills.json` lockfile.
5. Write MCP server config into `.claude/settings.json`.
6. Install Supabase, Better-Auth, and WatermelonDB where applicable.
7. Install guardrails (Husky, lint-staged, Vitest, Playwright, Sandcastle).
8. Write `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
9. Commit and push final bootstrap changes.

## Injection Flow

1. Resolve the skills repository and immutable ref from flags, user config, or defaults.
2. Clone the repo into a temporary directory and check out the selected tag or SHA.
3. Select pack skills or all catalog skills.
4. Copy each skill by frontmatter name into `.agents/skills/` and `.claude/skills/`.
5. Copy `.github/skills/SKILL_TEMPLATE.md` when present.
6. Remove the temporary clone.
7. Write `.studio-skills.json` to the project root, recording the repo URL, ref, packs, kickstart version, install timestamp, and the name + category of every injected skill.

If a lockfile already exists (re-inject), `installedAt` is preserved and only `lastSyncedAt`, `ref`, `packs`, and `skills` are updated.

## Skills Sync Flow

`kickstart skills sync` re-applies skills without re-running the full scaffold.

1. Read `.studio-skills.json` from the project directory.
2. Exit with a clear error if no lockfile is found.
3. Clone the skills repo at the locked `ref`.
4. Re-copy each skill listed in `skills[]` into `.agents/skills/` and `.claude/skills/`.
5. Update `lastSyncedAt` in the lockfile; write it back.

With `--upgrade`:

1. Run `git ls-remote --tags` on the repo URL to collect all `v*.*.*` tags.
2. Sort by semver (major → minor → patch), take the highest.
3. If the latest tag is newer than the locked `ref`, clone at that tag instead.
4. Sync skills and update `ref` + `lastSyncedAt` in the lockfile.

## MCP Config Flow

Called during scaffold after skills injection.

1. Resolve the server list: default is `['supabase', 'github']`; `--mcp none` returns `[]`; a comma-separated flag overrides.
2. If the list is empty, return without touching the filesystem.
3. Read `.claude/settings.json` if it already exists; parse it; merge rather than overwrite.
4. For each requested server, look up its config in `MCP_SERVERS` and set `settings.mcpServers[name]`.
5. Write the merged settings back to `.claude/settings.json`.

Available servers in `lib/mcp.js`:

| Key | Command | Auth |
| --- | --- | --- |
| `supabase` | `npx @supabase/mcp-server-supabase@latest` | `${SUPABASE_ACCESS_TOKEN}` arg |
| `github` | `npx @modelcontextprotocol/server-github` | `${GITHUB_TOKEN}` env var |
| `filesystem` | `npx @modelcontextprotocol/server-filesystem .` | none |

## Other / Bare Project Type

When `--other` is passed (or the user selects "Other / Bare project" in the interactive prompt), `createProject` short-circuits the framework scaffold and instead:

1. Creates the project directory.
2. Writes a minimal `package.json` (`private: true`, `type: module`, empty `scripts`).
3. Runs `git init -b main`.

All subsequent steps (GitHub setup, skills inject, MCP config, DB/auth, guardrails, agent docs) are identical to `--web` and `--mobile`. The generated `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` use a generic stack section instead of the Next.js/Expo-specific one.

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
