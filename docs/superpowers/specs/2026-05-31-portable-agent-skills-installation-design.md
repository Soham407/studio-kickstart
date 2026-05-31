# Portable Agent Skills Installation Design

## Goal

Make Studio Kickstart installs reproducible and defensible across a verified core of Claude Code, Codex, and Pi while retaining a portable Agent Skills fallback.

## Supported Harness Contract

- Claude Code receives project skills in `.claude/skills/`.
- Codex and Pi receive portable project skills in `.agents/skills/`.
- Other Agent Skills-compatible harnesses may consume `.agents/skills/`, but Studio Kickstart does not claim native verification for them.
- Generated skills use the Agent Skills layout `<skills-root>/<skill-name>/SKILL.md`.
- Installed folder names match the `name` field in each `SKILL.md`.

## Installation Flow

The source repository remains organized by category. Installation flattens selected source skills into a destination root named by frontmatter `name`, preserving supporting files.

Scaffolding installs each selected pack twice:

1. `.agents/skills/` as the portable canonical location.
2. `.claude/skills/` as the Claude Code adapter.

Individual installs support `agents`, `claude`, `codex`, and `pi`. The `codex` and `pi` adapters resolve to `.agents/skills/`.

## Reproducibility

Git-backed skill installs default to the release tag `v1.1.0`. Users can pass `--skills-ref <tag-or-sha>` to select another immutable ref or `--skills-ref latest` to follow the repository default branch.

The clone flow clones the repository and then checks out the selected ref. Release publication must create the matching `v1.1.0` Git tag after verification.

## Bash Fallback

The legacy Bash bootstrapper mirrors the Node CLI contract:

- Default `SKILLS_REF=v1.1.0`.
- `SKILLS_REF=latest` follows the default branch.
- Selected pack skills are flattened by their frontmatter names.
- Skills are copied to `.agents/skills/` and `.claude/skills/`.

## Tests

Automated tests verify:

- Every source skill passes catalog lint, including Agent Skills parent-directory naming.
- Essential, Agency, and Security packs contain discoverable skills.
- Pack installs create flattened standard-compliant directories.
- Scaffold-style installs write both `.agents/skills/` and `.claude/skills/`.
- Individual Claude, Codex, Pi, and portable installs target the documented directories.
- A pinned Git ref installs tagged content while `latest` installs the default branch content.
- Bash fallback syntax remains valid.

Native smoke checks run for locally available Claude Code and Codex binaries. Pi path compatibility is verified against Pi's documented `.agents/skills/` project discovery location; native Pi launch verification requires a local Pi binary.
