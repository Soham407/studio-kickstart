# Studio Kickstart

Bootstrap agent-ready apps with framework scaffolding, quality gates, agent docs, and reusable Studio Skills.

`kickstart` is a CLI for starting serious projects without rebuilding the same setup every time: create the app, add the core stack, wire database/auth starters, install tests and formatting, write agent instructions, and inject repeatable workflows for AI coding agents.

## Features

- Framework scaffolding for Next.js, Expo, and Turborepo + Solito projects.
- Skill Pack selection so new projects install focused Studio Skills instead of the full library by default.
- Design Staging Bridge via `.design-staging/.gitkeep` for Open Design exports and Artifact-Pro handoffs.
- Sandcastle installed in scaffolded projects for agent-assisted implementation work.
- Production Pipeline guidance for CodeRabbit review of Sandcastle-generated PRs before merge.
- Supabase, Better-Auth, WatermelonDB, Husky, lint-staged, Vitest, Playwright, and Prettier setup.
- Verified skill adapters for Claude Code, Codex, and Pi, plus a portable Agent Skills fallback.

```
   SETUP           SCAFFOLD          SKILLS          GUARDRAILS        SHIP
  ┌──────┐        ┌────────┐        ┌──────┐        ┌────────┐       ┌──────┐
  │ Init │  ───▶  │ App    │  ───▶  │ Agent│  ───▶  │ Tests  │ ───▶  │ Repo │
  │ Config        │ Stack  │        │ Work │        │ Hooks  │       │ Push │
  └──────┘        └────────┘        └──────┘        └────────┘       └──────┘
  --init          --web             skills install  pre-commit       --github
                  --mobile
                  --universal
```

## Commands

| What you are doing | Command | Result |
| --- | --- | --- |
| Configure the CLI | `kickstart --init` | Saves defaults in `~/.studio-skills/config.json` |
| Create a guided project | `kickstart` | Prompts for stack, name, local model mode, and GitHub mode |
| Create a web app | `kickstart --web my-app --github skip` | Scaffolds Next.js with Studio defaults |
| Create a mobile app | `kickstart --mobile my-app --github private` | Scaffolds Expo with mobile defaults |
| Create a universal app | `kickstart --universal my-app --github public` | Scaffolds Turborepo + Solito |
| Choose skill packs | `kickstart --web my-app --skill-pack essential,security` | Installs only selected Studio skill packs |
| Install everything | `kickstart --web my-app --all-skills` | Installs the full Studio Skills library |
| List skills | `kickstart skills list` | Reads available skills from the configured skills repo |
| Install one skill | `kickstart skills install tdd --agent codex` | Copies that skill into the selected agent target |

## Quick Start

Install the CLI:

```bash
npm install -g github:Soham407/studio-kickstart#v1.1.0
kickstart --init
```

Create a project interactively:

```bash
kickstart
```

Or run it non-interactively:

```bash
kickstart --web my-app --github skip
kickstart --mobile my-mobile-app --github private
kickstart --universal my-platform --github public
kickstart --web lean-app --skill-pack essential,security
kickstart --web pinned-app --skills-ref v1.1.0
```

Use a custom skills repository:

```bash
kickstart --skills https://github.com/your-org/your-skills.git --web custom-app
kickstart skills list --skills https://github.com/your-org/your-skills.git
```

## What Gets Set Up

| Area | Included |
| --- | --- |
| Framework | Next.js, Expo, or Turborepo + Solito |
| Repository | Optional GitHub repo creation through `gh` |
| Database | Supabase client starter |
| Auth | Better-Auth starter |
| Offline-first | WatermelonDB starter for mobile and universal projects |
| Quality gates | Husky, lint-staged, Vitest, Playwright, Prettier, and Sandcastle |
| Agent docs | `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` |
| Skills | Selected Studio Skill Packs injected into `.claude/skills/` by default |
| Design staging | `.design-staging/.gitkeep` for Open Design exports and Artifact-Pro handoffs |
| PR pipeline | CodeRabbit guidance for auditing Sandcastle-generated PRs before merge |
| Local models | Optional guidance for Ollama, LM Studio, llama.cpp, Open WebUI, or another runtime |
| Containers | Docker-compatible runtime guidance for Docker Desktop, Docker Engine, Podman, or OrbStack |

Local model support is optional. If a user selects "Do not assume local models", generated agent docs tell Claude Code, Codex, Gemini CLI, or another active agent to use its configured model instead.

## Skill Packs

New projects install the Essential Pack by default unless another pack is selected.

| Pack | Contents |
| --- | --- |
| Essential Pack | Manual-SDD, Antivibe, Watermelon Architect, Matt Pocock TypeScript, Usage Limit Reducer |
| Agency Pack | Agentic SEO, Marp Slides, Spider-King lead extraction, Email Campaigns |
| Security & Safety | Shannon-Pro, Tech Debt Audit |
| All Skills | Complete library for projects that want every workflow available |

Interactive runs use a multi-select prompt. Scripted runs can use:

```bash
kickstart --web my-app --skill-pack essential
kickstart --web my-app --skill-pack essential,agency,security
kickstart --web my-app --all-skills
```

## Agent Targets

Skills are plain Markdown workflows. The CLI can install them into agent-specific discovery paths:

| Agent | Target |
| --- | --- |
| Claude Code | `.claude/skills/` |
| Codex | `.agents/skills/` |
| Pi | `.agents/skills/` |
| Portable Agent Skills fallback | `.agents/skills/` |

Scaffolds write flattened, standard-compliant skills to both `.agents/skills/` and `.claude/skills/`. Git-backed installs default to the immutable `v1.1.0` release tag. Pass `--skills-ref latest` to follow the repository default branch explicitly.

Install examples:

```bash
kickstart skills install tdd
kickstart skills install tdd --agent codex
kickstart skills install hue --agent pi
```

## All 31 Skills

The generated catalog is `skills.json`. A directory becomes an installable skill when it lives under `architecture/`, `coding/`, `business/`, or `design/` and contains a `SKILL.md`.

### Architecture

| Skill | Path | What it does |
| --- | --- | --- |
| `antivibe` | `architecture/antivibe` | Explains AI-written code with curated resources so users understand the what and why. |
| `caveman` | `architecture/caveman` | Ultra-compressed communication mode for reducing token use. |
| `claude-plugin-powerpack` | `architecture/claude-plugin-powerpack` | Documents the recommended Claude Code plugin stack: skill-creator, superpowers, context-mode, claude-mem, frontend-design, and get-shit-done-cc. |
| `diagnose` | `architecture/diagnose` | Reproduce, minimize, hypothesize, instrument, fix, and regression-test bugs. |
| `git-guardrails-claude-code` | `architecture/git-guardrails-claude-code` | Sets up Claude Code hooks that block dangerous git commands. |
| `grill-me` | `architecture/grill-me` | Stress-tests a plan through focused questioning. |
| `grill-with-docs` | `architecture/grill-with-docs` | Challenges a plan against project docs and updates domain decisions. |
| `improve-codebase-architecture` | `architecture/improve-codebase-architecture` | Finds deeper refactoring and architecture opportunities. |
| `manual-sdd` | `architecture/manual-sdd` | Applies a skills-first spec-driven development workflow. |
| `migrate-to-shoehorn` | `architecture/migrate-to-shoehorn` | Migrates test data from `as` assertions to `@total-typescript/shoehorn`. |
| `prototype` | `architecture/prototype` | Builds throwaway terminal or UI prototypes before committing to a design. |
| `scaffold-exercises` | `architecture/scaffold-exercises` | Creates exercise folders with problems, solutions, and explainers. |
| `setup-matt-pocock-skills` | `architecture/setup-matt-pocock-skills` | Adds repo-level agent skill docs and issue-tracker conventions. |
| `setup-pre-commit` | `architecture/setup-pre-commit` | Adds Husky pre-commit hooks with formatting, type checks, and tests. |
| `tdd` | `architecture/tdd` | Runs a red-green-refactor loop for features and bug fixes. |
| `to-issues` | `architecture/to-issues` | Breaks plans or PRDs into independently grabbable implementation issues. |
| `to-prd` | `architecture/to-prd` | Turns conversation context into a PRD and publishes it to the issue tracker. |
| `triage` | `architecture/triage` | Triage issues through role-driven workflow states. |
| `write-a-skill` | `architecture/write-a-skill` | Creates new agent skills with proper structure and progressive disclosure. |
| `zoom-out` | `architecture/zoom-out` | Maps an unfamiliar code area at a higher level. |
| `tech-debt-audit` | `architecture/tech-debt-audit` | Produces a file-cited codebase health and architecture audit. |
| `usage-limit-reducer` | `architecture/usage-limit-reducer` | Diagnoses token usage and applies usage-reduction rules. |

### Business

| Skill | Path | What it does |
| --- | --- | --- |
| `agentic-seo` | `business/agentic-seo` | Audits documentation and websites for AI-agent discoverability. |
| `email-campaigns` | `business/email-campaigns` | Designs and sends HTML email campaigns through Resend. |
| `marp-slides` | `business/marp-slides` | Creates MARP presentation decks with charts, themes, and visual components. |
| `shannon-security` | `business/shannon-security` | Guides white-box application security testing with Shannon. |
| `spider-king-lead-extraction` | `business/spider-king-lead-extraction` | Restores web protocols for reproducible browser-independent collection. |

### Design

| Skill | Path | What it does |
| --- | --- | --- |
| `artifact-pro-open-design` | `design/artifact-pro-open-design` | Converts Open Design JSON exports into NativeWind v4 production UI. |
| `hue` | `design/hue` | Generates new design language skills from references, screenshots, or prompts. |

### Coding

| Skill | Path | What it does |
| --- | --- | --- |
| `matt-pocock-typescript` | `coding/matt-pocock-typescript` | Applies the bundled TypeScript engineering workflows. |
| `watermelon-architect` | `coding/watermelon-architect` | Guides offline-first WatermelonDB synchronization design. |

## How Skills Work

Every installable skill follows the same shape:

```
skill-folder/
└── SKILL.md
    ├── frontmatter: name, description, type, category, tags
    ├── trigger rules: when the agent should use it
    ├── workflow: steps the agent must follow
    ├── references: optional files loaded only when needed
    └── verification: evidence required before the work is done
```

Design principles:

- Workflow over prose. A skill should tell the agent what to do, not just describe a topic.
- Progressive disclosure. Keep `SKILL.md` small enough to load first; put heavier references in nearby files.
- Clear triggers. The description should say when the skill applies.
- Verifiable output. The skill should define what proof is needed: tests, docs, screenshots, commands, or file changes.

## Sandcastle Status

Sandcastle is wired into scaffolded projects.

Matt Pocock's Sandcastle is a TypeScript library for orchestrating coding agents in isolated sandboxes with `sandcastle.run()`. Its current quick start is:

```bash
npm install --save-dev @ai-hero/sandcastle
npx sandcastle init
```

`kickstart` installs `@ai-hero/sandcastle` as a dev dependency in generated projects alongside Husky, lint-staged, Vitest, Playwright, and Prettier. The CLI package itself does not depend on Sandcastle at runtime; Sandcastle belongs in the project being scaffolded, where it can run AFK agent orchestration, review pipelines, and sandboxed parallel work.

## Project Structure

```
Studio_Skills/
├── bin/
│   └── kickstart.js              # CLI command definitions
├── lib/
│   ├── scaffold.js               # Project bootstrap orchestration
│   ├── skills.js                 # Skill clone/copy/install logic
│   ├── skill-catalog.js          # Skill discovery and linting
│   ├── wizard.js                 # First-time setup wizard
│   ├── config.js                 # ~/.studio-skills/config.json
│   └── updater.js                # Best-effort npm update checks
├── scripts/
│   ├── generate-skills-catalog.js
│   └── lint-skills.js
├── architecture/                 # Installable engineering workflow skills
├── coding/                       # Coding references and future coding skills
├── business/                     # Studio operation skills
├── design/                       # Design system skills
├── .design-staging/              # Created in scaffolded projects for Open Design exports
├── test/                         # Node test runner tests
├── skills.json                   # Generated public skill catalog
├── ARCHITECTURE.md
└── README.md
```

## Requirements

- Node.js 20+
- pnpm
- GitHub CLI authenticated with `gh auth login` when using `--github private` or `--github public`
- Docker-compatible runtime optional for container workloads
- Local model runtime optional

## Local Development

```bash
npm install
npm test
npm run skills:lint
npm run skills:catalog
npm pack --dry-run
```

Run all checks:

```bash
npm run check
```

## Similar Projects

Studio Kickstart sits between framework scaffolding, agent skills, and project guardrails:

- `create-next-app`, `create-expo-app`, and Solito starters for framework scaffolding
- `create-t3-app` for opinionated full-stack setup
- `anthropics/skills`, `openai/skills`, and `addyosmani/agent-skills` for agent skill packaging
- `obra/superpowers` for workflow-oriented agent skills
- Matt Pocock's `sandcastle` for sandboxed coding-agent orchestration
- Aider, OpenCode, Gemini CLI, Cline, Roo Code, Continue, Cursor, and Windsurf for agent workflow expectations

The intended differentiation is the combination: project scaffolding, tool setup, agent docs, reusable skills, and future sandboxed agent orchestration from one guided bootstrapper.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) for skill structure and pull request expectations, and [ARCHITECTURE.md](ARCHITECTURE.md) for how the CLI and skills library fit together.

## License

MIT
