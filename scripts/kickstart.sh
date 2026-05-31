#!/usr/bin/env bash

# kickstart - Studio-Grade project bootstrapper
#
# Usage: kickstart <type> <project-name>
#   --web         Next.js 16 with NativeWind v4
#   --mobile      Expo SDK 55 with WatermelonDB
#   --universal   Turborepo + Solito 5
#
# Optimized for: pnpm / Docker-compatible runtimes / local-model-friendly agents
# Source: https://github.com/Soham407/studio-kickstart

set -euo pipefail

# ============================================================================
# Constants & Colors
# ============================================================================
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

STUDIO_SKILLS_REPO="https://github.com/Soham407/studio-kickstart.git"
SKILLS_REF="${SKILLS_REF:-v1.1.1}"
SKILL_PACKS="${SKILL_PACKS:-essential}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES_DIR="$SCRIPT_DIR/templates"
TEMP_DIR=""
PROJECT_DIR=""

# ============================================================================
# Helpers
# ============================================================================
log_info()    { echo -e "${BLUE}[kickstart]${NC} $1"; }
log_success() { echo -e "${GREEN}[kickstart]${NC} ✓ $1"; }
log_warn()    { echo -e "${YELLOW}[kickstart]${NC} ⚠ $1"; }
log_error()   { echo -e "${RED}[kickstart]${NC} ✗ $1" >&2; }
log_step()    { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

usage() {
  cat <<EOF
${BOLD}kickstart${NC} - Studio-Grade project bootstrapper

${BOLD}USAGE:${NC}
  kickstart <type> <project-name>

${BOLD}TYPES:${NC}
  --web         Next.js 16 (App Router, NativeWind v4, Supabase, Better-Auth)
  --mobile      Expo SDK 55 (NativeWind v4, WatermelonDB, Better-Auth)
  --universal   Turborepo + Solito 5 (Web + Mobile shared logic)

${BOLD}EXAMPLES:${NC}
  kickstart --web my-app
  kickstart --mobile my-mobile-app
  kickstart --universal my-platform

${BOLD}REQUIREMENTS:${NC}
  pnpm, gh (authenticated), Docker-compatible runtime optional, node ≥ 20

EOF
}

cleanup() {
  if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
  fi
}
trap cleanup EXIT

# ============================================================================
# Step 1: Validation
# ============================================================================
validate_environment() {
  log_step "Step 1/8: Validating environment"

  local missing=()

  if ! command -v pnpm &>/dev/null; then
    missing+=("pnpm (install: brew install pnpm)")
  else
    log_success "pnpm $(pnpm --version)"
  fi

  if ! command -v gh &>/dev/null; then
    missing+=("gh (install: brew install gh)")
  elif ! gh auth status &>/dev/null; then
    missing+=("gh authentication (run: gh auth login)")
  else
    log_success "gh authenticated"
  fi

  if ! command -v docker &>/dev/null; then
    log_warn "docker not found (install Docker Desktop, Docker Engine, Podman, or OrbStack for container workloads)"
  else
    log_success "docker-compatible runtime present"
  fi

  if ! command -v node &>/dev/null; then
    missing+=("node ≥ 20 (install: brew install node)")
  else
    local node_major
    node_major=$(node --version | sed 's/v//' | cut -d. -f1)
    if [ "$node_major" -lt 20 ]; then
      missing+=("node ≥ 20 (current: $(node --version))")
    else
      log_success "node $(node --version)"
    fi
  fi

  if command -v ollama &>/dev/null; then
    if ollama list 2>/dev/null | grep -qi "qwen"; then
      log_success "Ollama Qwen model available (local inference enabled)"
    else
      log_warn "Ollama installed but no Qwen model. Run: ollama pull qwen2.5-coder:14b"
    fi
  else
    log_warn "Ollama not found (optional; LM Studio, llama.cpp, Open WebUI, or agent-native local providers also work)"
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "Missing required tools:"
    for tool in "${missing[@]}"; do
      echo "  • $tool"
    done
    exit 1
  fi
}

# ============================================================================
# Step 2: Scaffolding
# ============================================================================
scaffold_web() {
  log_step "Step 2/8: Scaffolding Next.js 16 (Web)"
  pnpm create next-app@latest "$PROJECT_NAME" \
    --typescript --tailwind --app --src-dir --import-alias "@/*" --use-pnpm \
    --no-eslint --no-turbopack
  cd "$PROJECT_NAME"
  PROJECT_DIR="$(pwd)"
  log_info "Adding NativeWind v4..."
  pnpm add nativewind@latest react-native-web
  log_success "Web scaffold complete"
}

scaffold_mobile() {
  log_step "Step 2/8: Scaffolding Expo SDK 55 (Mobile)"
  pnpm create expo-app@latest "$PROJECT_NAME" --template blank-typescript --yes
  cd "$PROJECT_NAME"
  PROJECT_DIR="$(pwd)"
  log_info "Adding NativeWind v4..."
  pnpm add nativewind@latest
  pnpm add -D tailwindcss@^3
  log_success "Mobile scaffold complete"
}

scaffold_universal() {
  log_step "Step 2/8: Scaffolding Universal (Turborepo + Solito 5)"
  pnpm create solito-app@latest "$PROJECT_NAME"
  cd "$PROJECT_NAME"
  PROJECT_DIR="$(pwd)"
  normalize_universal_package_manager
  log_info "Adding NativeWind v4..."
  pnpm add -w nativewind@latest
  log_success "Universal scaffold complete"
}

normalize_universal_package_manager() {
  log_info "Converting Solito template to pnpm..."
  rm -rf yarn.lock .yarn .yarnrc.yml node_modules apps/*/node_modules packages/*/node_modules
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    delete pkg.packageManager;
    delete pkg.workspaces;
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  cat > pnpm-workspace.yaml <<'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF
  pnpm install
}

# ============================================================================
# Step 3: Cloud Sync (Private GitHub Repo)
# ============================================================================
setup_github_repo() {
  log_step "Step 3/8: Creating private GitHub repository"

  if [ ! -d ".git" ]; then
    git init -b main
    git add .
    git commit -m "chore: initial scaffold" >/dev/null
  fi

  if ! gh repo create "$PROJECT_NAME" --private --source=. --remote=origin --push 2>/dev/null; then
    log_warn "Repo '$PROJECT_NAME' creation failed (name taken or other error)"
    read -r -p "Try alternate name? Enter new name (or 'skip' to skip): " alt_name
    if [ "$alt_name" = "skip" ] || [ -z "$alt_name" ]; then
      log_warn "Skipping GitHub repo creation. Set up remote manually later."
      return 0
    fi
    if ! gh repo create "$alt_name" --private --source=. --remote=origin --push; then
      log_error "GitHub repo creation failed again. Continuing without remote."
      return 0
    fi
  fi

  log_success "Private repo created: $(gh repo view --json url -q .url 2>/dev/null || echo 'created')"
}

# ============================================================================
# Step 4: Brain Injection (Skills Library)
# ============================================================================
inject_skills() {
  log_step "Step 4/8: Injecting Studio Skills library"

  TEMP_DIR=$(mktemp -d)
  log_info "Cloning $STUDIO_SKILLS_REPO..."
  git clone --depth 1 --quiet "$STUDIO_SKILLS_REPO" "$TEMP_DIR/studio_skills"
  if [ "$SKILLS_REF" != "latest" ]; then
    git -C "$TEMP_DIR/studio_skills" fetch --depth 1 origin "refs/tags/$SKILLS_REF:refs/tags/$SKILLS_REF" ||
      git -C "$TEMP_DIR/studio_skills" fetch --depth 1 origin "$SKILLS_REF"
    git -C "$TEMP_DIR/studio_skills" checkout --detach "$SKILLS_REF"
  fi

  mkdir -p .agents/skills .claude/skills

  copy_skill() {
    local skill_path="$1"
    local skill_dir="$TEMP_DIR/studio_skills/$skill_path"
    local skill_name
    skill_name=$(sed -n 's/^name:[[:space:]]*//p' "$skill_dir/SKILL.md" | head -n 1 | tr -d "\"'")
    if [ -z "$skill_name" ]; then
      log_warn "Missing skill name: $skill_path"
      return
    fi
    cp -r "$skill_dir" ".agents/skills/$skill_name"
    cp -r "$skill_dir" ".claude/skills/$skill_name"
    log_success "Injected $skill_name"
  }

  if [ "$SKILL_PACKS" = "all" ]; then
    while IFS= read -r skill_file; do
      copy_skill "${skill_file#"$TEMP_DIR/studio_skills/"}"
    done < <(find "$TEMP_DIR/studio_skills"/architecture "$TEMP_DIR/studio_skills"/coding "$TEMP_DIR/studio_skills"/business "$TEMP_DIR/studio_skills"/design -mindepth 2 -maxdepth 2 -name SKILL.md -type f | sort | sed 's|/SKILL.md$||')
  else
    IFS=',' read -ra packs <<< "$SKILL_PACKS"
    for pack in "${packs[@]}"; do
      case "$(echo "$pack" | xargs)" in
        essential)
          skill_paths=("architecture/manual-sdd" "architecture/antivibe" "coding/watermelon-architect" "coding/matt-pocock-typescript" "architecture/usage-limit-reducer")
          ;;
        agency)
          skill_paths=("business/agentic-seo" "business/marp-slides" "business/spider-king-lead-extraction" "business/email-campaigns")
          ;;
        security)
          skill_paths=("business/shannon-security" "architecture/tech-debt-audit")
          ;;
        *)
          log_error "Unsupported skill pack: $pack. Use essential, agency, security, or all."
          exit 1
          ;;
      esac

      for skill_path in "${skill_paths[@]}"; do
        if [ -f "$TEMP_DIR/studio_skills/$skill_path/SKILL.md" ]; then
          copy_skill "$skill_path"
        else
          log_warn "Missing skill path: $skill_path"
        fi
      done
    done
  fi

  if [ -f "$TEMP_DIR/studio_skills/.github/skills/SKILL_TEMPLATE.md" ]; then
    cp "$TEMP_DIR/studio_skills/.github/skills/SKILL_TEMPLATE.md" .claude/skills/
  fi
}

# ============================================================================
# Step 5: Database & Auth
# ============================================================================
install_database_and_auth() {
  log_step "Step 5/8: Installing database & auth"

  log_info "Adding Supabase..."
  if [ "$TYPE" = "universal" ]; then
    pnpm add -w @supabase/supabase-js
  else
    pnpm add @supabase/supabase-js
  fi
  mkdir -p lib
  mkdir -p .design-staging
  touch .design-staging/.gitkeep
  cat > lib/supabase.ts <<'EOF'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
EOF
  log_success "Supabase configured at lib/supabase.ts"

  log_info "Adding Better-Auth (passkey/FaceID-ready)..."
  if [ "$TYPE" = "universal" ]; then
    pnpm add -w better-auth
  else
    pnpm add better-auth
  fi
  cat > lib/auth.ts <<'EOF'
import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  database: {
    provider: 'pg',
    url: process.env.DATABASE_URL ?? '',
  },
  emailAndPassword: { enabled: true },
  socialProviders: {
    // Configure as needed
  },
  plugins: [
    // Passkey / WebAuthn support
    // Uncomment after `pnpm add better-auth/plugins`
    // passkey({ rpName: 'Studio App' }),
  ],
})

export type Auth = typeof auth
EOF
  log_success "Better-Auth configured at lib/auth.ts"

  if [ "$TYPE" = "mobile" ] || [ "$TYPE" = "universal" ]; then
    log_info "Adding WatermelonDB (offline-first)..."
    if [ "$TYPE" = "universal" ]; then
      pnpm add -w @nozbe/watermelondb
      pnpm add -w -D @babel/plugin-proposal-decorators
    else
      pnpm add @nozbe/watermelondb
      pnpm add -D @babel/plugin-proposal-decorators
    fi

    mkdir -p model
    cat > model/schema.ts <<'EOF'
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'posts',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'body', type: 'string' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
})
EOF

    cat > model/migrations.ts <<'EOF'
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations'

export default schemaMigrations({
  migrations: [
    // Add migrations here as schema versions increase
    // {
    //   toVersion: 2,
    //   steps: [
    //     addColumns({ table: 'posts', columns: [{ name: 'is_pinned', type: 'boolean' }] }),
    //   ],
    // },
  ],
})
EOF

    cat > model/database.ts <<'EOF'
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import schema from './schema'
import migrations from './migrations'

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  onSetUpError: (error) => {
    console.error('[watermelondb] setup failed:', error)
  },
})

export const database = new Database({
  adapter,
  modelClasses: [],
})
EOF
    log_success "WatermelonDB scaffolded at model/"
  fi
}

# ============================================================================
# Step 6: Production Guardrails
# ============================================================================
setup_guardrails() {
  log_step "Step 6/8: Installing production guardrails"

  log_info "Adding Husky + lint-staged + Vitest + Playwright + Sandcastle..."
  if [ "$TYPE" = "universal" ]; then
    pnpm add -w -D husky lint-staged vitest @playwright/test prettier @ai-hero/sandcastle
  else
    pnpm add -D husky lint-staged vitest @playwright/test prettier @ai-hero/sandcastle
  fi

  pnpm dlx husky init >/dev/null 2>&1 || true

  if [ -f "$TEMPLATES_DIR/pre-commit.template" ]; then
    cp "$TEMPLATES_DIR/pre-commit.template" .husky/pre-commit
  else
    cat > .husky/pre-commit <<'EOF'
#!/usr/bin/env sh
. "$(dirname "$0")/_/husky.sh"

pnpm lint-staged

if [ -f .claude/skills/shannon-security/SHANNON-PRO.md ]; then
  echo "🛡️  Shannon-Pro: review security skill at .claude/skills/shannon-security/"
fi
EOF
  fi
  chmod +x .husky/pre-commit

  if [ -f package.json ]; then
    node -e "
      const fs = require('fs');
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      pkg['lint-staged'] = pkg['lint-staged'] || {
        '*.{ts,tsx,js,jsx}': ['prettier --write'],
        '*.{json,md,yml}': ['prettier --write']
      };
      pkg.scripts = pkg.scripts || {};
      pkg.scripts.test = pkg.scripts.test || 'vitest';
      pkg.scripts['test:e2e'] = pkg.scripts['test:e2e'] || 'playwright test';
      pkg.scripts.typecheck = pkg.scripts.typecheck || 'tsc --noEmit';
      fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
    "
  fi

  log_success "Guardrails active (Husky + Vitest + Playwright + Shannon-Pro hook)"
}

# ============================================================================
# Step 7: Agent docs injection
# ============================================================================
inject_claude_md() {
  log_step "Step 7/8: Writing agent docs"

  if [ -f "$TEMPLATES_DIR/CLAUDE.md.template" ]; then
    cp "$TEMPLATES_DIR/CLAUDE.md.template" AGENTS.md
    if [ "$(uname)" = "Darwin" ]; then
      sed -i '' "s/{{PROJECT_NAME}}/$PROJECT_NAME/g; s/{{PROJECT_TYPE}}/$TYPE/g" AGENTS.md
    else
      sed -i "s/{{PROJECT_NAME}}/$PROJECT_NAME/g; s/{{PROJECT_TYPE}}/$TYPE/g" AGENTS.md
    fi
  else
    cat > AGENTS.md <<EOF
# $PROJECT_NAME

Studio-Grade $TYPE project. Bootstrapped via kickstart.

## Agent And Model Routing
- Prefer local models for routine tasks.
- Use the strongest available model for complex architectural work.
- Container workloads can use Docker Desktop, Docker Engine, Podman, or OrbStack.

## Skills Library
See \`.agents/skills/\` for portable studio skills and \`.claude/skills/\` for the Claude Code adapter.

Selected skill packs: $SKILL_PACKS

## Design Staging Bridge
\`.design-staging/\` is for raw UI exports, screenshots, and handoff files such as \`index.html\` from Open Design. Treat files in this folder as staging inputs for the Artifact-Pro Open Design skill before translating them into production components.

## Production Pipeline
Sandcastle-generated PRs must be reviewed before merge. Use CodeRabbit as the automated PR audit layer for logic integrity, regression risk, and test coverage.

- Sandcastle may open or prepare implementation PRs.
- CodeRabbit should audit those PRs before human merge.
- Do not merge Sandcastle-generated changes until the CodeRabbit review has been read and any material logic or coverage findings are resolved.
EOF
  fi

  cp AGENTS.md CLAUDE.md
  cp AGENTS.md GEMINI.md

  log_success "AGENTS.md, CLAUDE.md, and GEMINI.md created"
}

# ============================================================================
# Step 8: Final Commit & Push
# ============================================================================
finalize() {
  log_step "Step 8/8: Finalizing"

  git add -A
  git commit -m "chore: studio kickstart — inject skills, guardrails, DB/Auth" >/dev/null 2>&1 || true

  if git remote get-url origin &>/dev/null; then
    git push -u origin main 2>/dev/null || log_warn "Push failed (run manually: git push -u origin main)"
  fi

  echo ""
  echo -e "${GREEN}${BOLD}✅ $PROJECT_NAME ready!${NC}"
  echo ""
  echo -e "${BOLD}Next steps:${NC}"
  echo "  cd $PROJECT_NAME"
  if [ "$TYPE" = "web" ]; then
    echo "  pnpm dev"
  elif [ "$TYPE" = "mobile" ]; then
    echo "  pnpm start"
  else
    echo "  pnpm dev   # runs both web + mobile"
  fi
  echo ""
  echo -e "${BOLD}Configure:${NC}"
  echo "  • Supabase keys → .env.local"
  echo "  • Better-Auth → lib/auth.ts"
  if [ "$TYPE" != "web" ]; then
    echo "  • WatermelonDB models → model/"
  fi
  echo ""
  if git remote get-url origin &>/dev/null; then
    echo -e "${BOLD}GitHub:${NC} $(gh repo view --json url -q .url 2>/dev/null || echo '(check manually)')"
  fi
}

# ============================================================================
# Main
# ============================================================================
if [ $# -lt 2 ]; then
  usage
  exit 1
fi

case "$1" in
  --web)        TYPE="web" ;;
  --mobile)     TYPE="mobile" ;;
  --universal)  TYPE="universal" ;;
  -h|--help)    usage; exit 0 ;;
  *)
    log_error "Unknown type: $1"
    usage
    exit 1 ;;
esac

PROJECT_NAME="$2"

if [[ ! "$PROJECT_NAME" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  log_error "Project name must be lowercase, alphanumeric, with hyphens (got: $PROJECT_NAME)"
  exit 1
fi

if [ -d "$PROJECT_NAME" ]; then
  log_error "Directory '$PROJECT_NAME' already exists. Aborting."
  exit 1
fi

echo -e "${BOLD}${CYAN}"
cat <<'EOF'
   ┓ • ┓     ┓
   ┃┏┓┃┏┓┏╋┏┓┏┓╋
   ┛┗ ┻┗┛┗┛┻┛┛┻┛
EOF
echo -e "${NC}"
log_info "Bootstrapping: ${BOLD}$PROJECT_NAME${NC} (${BOLD}$TYPE${NC})"

validate_environment

case "$TYPE" in
  web)        scaffold_web ;;
  mobile)     scaffold_mobile ;;
  universal)  scaffold_universal ;;
esac

setup_github_repo
inject_skills
install_database_and_auth
setup_guardrails
inject_claude_md
finalize
