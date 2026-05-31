# Portable Agent Skills Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install reproducible, standard-compliant Studio Skills for Claude Code, Codex, Pi, and portable Agent Skills consumers.

**Architecture:** Keep category folders in the source repository, parse each selected `SKILL.md`, and flatten copies into harness discovery roots using frontmatter names. Clone Git sources at a pinned release ref by default, with an explicit `latest` escape hatch.

**Tech Stack:** Node.js ESM, Node test runner, Git CLI, Bash fallback

---

### Task 1: Standards Validation

**Files:**
- Modify: `lib/skill-catalog.js`
- Modify: source skill directories whose folder names do not match frontmatter names
- Modify: `test/skill-catalog.test.js`

- [ ] Add a failing lint assertion for Agent Skills parent-directory naming.
- [ ] Rename source skill directories to match frontmatter names and update references.
- [ ] Run `npm run skills:lint`.

### Task 2: Portable Installer

**Files:**
- Modify: `lib/skills.js`
- Modify: `test/cli.test.js`
- Modify: `test/scaffold-wiring.test.js`

- [ ] Add failing tests for flat destinations, verified adapters, dual-root pack injection, and Git ref pinning.
- [ ] Implement `agents`, `claude`, `codex`, and `pi` targets.
- [ ] Flatten copied skill directories using parsed frontmatter names.
- [ ] Add default `v1.1.0` ref handling and `latest` support.
- [ ] Run targeted tests.

### Task 3: CLI and Scaffold Wiring

**Files:**
- Modify: `bin/kickstart.js`
- Modify: `lib/config.js`
- Modify: `lib/scaffold.js`

- [ ] Add `--skills-ref` to scaffold, list, and install commands.
- [ ] Pass the selected ref through scaffold injection and individual installation.
- [ ] Update generated docs and guardrail paths for the flat Claude adapter.
- [ ] Run CLI and scaffold tests.

### Task 4: Bash Fallback and Documentation

**Files:**
- Modify: `scripts/kickstart.sh`
- Modify: `scripts/templates/CLAUDE.md.template`
- Modify: `scripts/templates/pre-commit.template`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `scripts/README.md`

- [ ] Mirror pinned-ref, flat copy, and dual-root behavior in Bash.
- [ ] Remove unverified harness guarantees.
- [ ] Document the verified core and portable fallback.
- [ ] Run `bash -n scripts/kickstart.sh`.

### Task 5: Generated Catalog and Verification

**Files:**
- Modify: `skills.json`

- [ ] Regenerate `skills.json`.
- [ ] Run `npm run check`.
- [ ] Run `git diff --check`.
- [ ] Exercise real-folder installs under `~/projects/Tests`.
- [ ] Smoke-check locally available Claude Code and Codex binaries.
- [ ] Report that Pi native launch remains unavailable when its binary is absent.
