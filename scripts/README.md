# Studio Kickstart

A bootstrapper script that scaffolds production-ready Web, Mobile, and Universal projects with the full Studio Skills library injected.

## What It Does

In <2 minutes, `kickstart` builds a project that:

1. ✅ Validates your environment (pnpm, gh, Docker-compatible runtime, node ≥20, local model runtime)
2. ✅ Scaffolds Next.js 16 / Expo SDK 55 / Turborepo+Solito 5
3. ✅ Creates a private GitHub repo and pushes initial commit
4. ✅ Injects selected studio skills into `.agents/skills/` and `.claude/skills/`
5. ✅ Installs and configures Supabase + Better-Auth (+ WatermelonDB for mobile)
6. ✅ Wires Husky + lint-staged + Vitest + Playwright + Shannon-Pro hook
7. ✅ Generates agent docs with local-model soft preference for routine tasks
8. ✅ Final commit and push

## Install

```bash
# From the studio-kickstart repo root:
sudo cp scripts/kickstart.sh /usr/local/bin/kickstart
sudo chmod +x /usr/local/bin/kickstart

# Verify
ls -l /usr/local/bin/kickstart
kickstart --help
```

To update later:
```bash
cd ~/projects/studio-kickstart
git pull
sudo cp scripts/kickstart.sh /usr/local/bin/kickstart
```

## Usage

```bash
kickstart --web my-app          # Next.js 16 only
kickstart --mobile my-app       # Expo SDK 55 only
kickstart --universal my-app    # Turborepo + Solito 5
```

Project name must be **lowercase, alphanumeric, with hyphens** (no spaces, underscores, or capitals).

## Requirements

| Tool | Required | Install |
|------|----------|---------|
| `pnpm` | Yes | `brew install pnpm` |
| `gh` (authenticated) | Yes | `brew install gh && gh auth login` |
| `node` ≥ 20 | Yes | `brew install node` |
| Docker-compatible runtime | Recommended | Docker Desktop, Docker Engine, Podman, or OrbStack |
| Local model runtime | Recommended | Ollama, LM Studio, llama.cpp, Open WebUI, or an agent-supported provider |

## What Gets Installed

### All project types
- TypeScript, Prettier, Husky, lint-staged
- Vitest (unit), Playwright (E2E)
- Supabase JS client (`lib/supabase.ts`)
- Better-Auth (`lib/auth.ts`)
- Portable Studio Skills at `.agents/skills/` plus a Claude Code adapter at `.claude/skills/`
- Agent docs with local-model guidance

### Mobile / Universal additions
- Expo SDK 55
- WatermelonDB with starter schema (`model/schema.ts`, `model/migrations.ts`, `model/database.ts`)
- Babel decorator plugin for WatermelonDB models

## Post-Setup Configuration

After `kickstart` finishes:

1. **Add Supabase credentials** to `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   *(For mobile, use `EXPO_PUBLIC_*` prefix.)*

2. **Set `DATABASE_URL`** for Better-Auth:
   ```
   DATABASE_URL=postgresql://...
   ```

3. **Configure Better-Auth providers** in `lib/auth.ts` (Google, Apple, passkey, etc.)

4. **Mobile only:** Define WatermelonDB models and add to `model/database.ts` `modelClasses`.

## Troubleshooting

### `gh repo create` fails
- Likely the repo name already exists. The script will prompt for an alternate name.
- Or: `skip` to bypass and add a remote manually later.

### Husky pre-commit doesn't run
```bash
pnpm dlx husky init
chmod +x .husky/pre-commit
```

### TypeScript errors during pre-commit
Add a `typecheck` script to `package.json` (the script attempts this automatically):
```json
"scripts": { "typecheck": "tsc --noEmit" }
```

### Local model not picked up
```bash
ollama pull qwen2.5-coder:14b
ollama list
```

## Files in This Folder

```
scripts/
├── kickstart.sh                     Main bootstrapper
├── README.md                        This file
└── templates/
    ├── CLAUDE.md.template           Legacy agent-doc template
    └── pre-commit.template          Husky pre-commit hook
```

## Verification

After install, smoke-test all three project types:

```bash
cd ~/projects
kickstart --web kt-test-web
kickstart --mobile kt-test-mobile
kickstart --universal kt-test-universal

# Verify each
for p in kt-test-web kt-test-mobile kt-test-universal; do
  echo "=== $p ==="
  ls "$p/.claude/skills/"
  test -f "$p/AGENTS.md" && echo "✓ AGENTS.md"
  test -f "$p/.husky/pre-commit" && echo "✓ pre-commit"
done

# Cleanup
for p in kt-test-web kt-test-mobile kt-test-universal; do
  gh repo delete "$p" --yes 2>/dev/null || true
  rm -rf "$p"
done
```
