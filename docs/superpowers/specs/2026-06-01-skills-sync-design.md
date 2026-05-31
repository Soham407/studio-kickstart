# Skills Sync — Design Spec

**Date:** 2026-06-01
**Status:** Approved

## Problem

Skills are copied from the remote repo once at scaffold time and never updated. There is no record of what was installed or at which ref, so there is no way to refresh or upgrade skills after the initial inject.

## Goal

1. Write a `.studio-skills.json` lockfile into every scaffolded project so the installed state is always known.
2. Add `kickstart skills sync` to re-apply or upgrade skills from that lockfile.

---

## Lockfile — `.studio-skills.json`

Written to the project root after any skill injection (full inject or individual install). Committed to git.

```json
{
  "kickstartVersion": "1.1.1",
  "repoUrl": "https://github.com/Soham407/studio-kickstart.git",
  "ref": "v1.1.1",
  "packs": ["essential"],
  "installedAt": "2026-06-01T00:00:00Z",
  "lastSyncedAt": "2026-06-01T00:00:00Z",
  "skills": [
    { "name": "manual-sdd", "category": "architecture" },
    { "name": "antivibe", "category": "architecture" },
    { "name": "tdd", "category": "architecture" }
  ]
}
```

**Fields:**
- `kickstartVersion` — version of studio-kickstart that wrote this file; enables future migration logic
- `repoUrl` — skills repo URL used; supports custom skills repos
- `ref` — the git tag or SHA that was checked out
- `packs` — skill packs selected at scaffold time (`essential`, `agency`, `security`, or `all`)
- `installedAt` — ISO timestamp of first inject; never updated after creation
- `lastSyncedAt` — ISO timestamp updated on every sync or re-inject
- `skills` — array of installed skills with `name` (frontmatter name) and `category`

---

## Code Changes — `lib/skills.js`

### New helpers

```js
readLockfile(projectDir)   // returns parsed JSON or null if missing
writeLockfile(projectDir, data)  // writes .studio-skills.json atomically
```

Single source of truth for the file format. Used by all callers.

### `injectSkills()` changes

After copying all skills, call `writeLockfile()` with the full state. If a lockfile already exists (re-inject), preserve `installedAt` and update only `lastSyncedAt`, `ref`, `packs`, and `skills`.

### `installSkill()` changes

After copying a single skill, read the lockfile (if present), upsert the skill entry by name, update `lastSyncedAt`, and write back. If no lockfile exists yet, create one with just this skill.

---

## New Command — `kickstart skills sync`

```
kickstart skills sync [--upgrade] [--project <path>]
```

### Default behavior (re-apply locked ref)

1. Read `.studio-skills.json` from cwd (or `--project` dir).
2. Error clearly if no lockfile: `No .studio-skills.json found. Run kickstart inside a scaffolded project first.`
3. Clone skills repo at the locked `ref`.
4. Re-copy each skill in `skills[]` to `.agents/skills/` and `.claude/skills/`.
5. Update `lastSyncedAt`, write lockfile.
6. Print: `Synced 5 skills at v1.1.1`

### `--upgrade` flag

1. Run `git ls-remote --tags` on the repo URL to collect all `v*.*.*` tags.
2. Sort them by semver (major → minor → patch), take the highest. If it is newer than the locked `ref`, clone at that tag.
3. Re-copy all skills, update `ref`, `lastSyncedAt` in the lockfile.
4. Print: `Upgraded from v1.1.1 → v1.2.0 and synced 5 skills`
5. If already at latest: `Already at v1.2.0, synced 5 skills`

### Error handling

- No lockfile → clear message, non-zero exit
- Skill path not found in repo at that ref → warn and skip (matches current `injectSkills` behavior)
- Network failure → surface the git error, exit non-zero

---

## Out of Scope

- Removing skills that were deleted from the lockfile (too destructive without dry-run)
- Per-skill independent refs (over-engineered for a single-repo skills library)
- Dry-run flag (deferred to a future iteration)
