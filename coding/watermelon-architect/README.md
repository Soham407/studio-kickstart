# WatermelonDB Sync Architecture

**Custom Studio Skill** — Offline-first database patterns for React Native using WatermelonDB.

## Overview

This skill provides production-grade architecture for building offline-first React Native apps with WatermelonDB. It enforces strict patterns for:

- **SQLite Schema Migrations** — Versioned, transactional schema changes
- **Conflict Resolution** — Per-column client-wins, last-in-wins, or custom strategies
- **Optimistic UI Updates** — Immediate local changes with eventual server sync

## Contents

- **watermelon-architect.md** — Complete skill guide with patterns, examples, and testing checklist
- This README

## Quick Start

1. Initialize WatermelonDB with migrations:
```javascript
import schema from './model/schema'
import migrations from './model/migrations'

const adapter = new SQLiteAdapter({ schema, migrations })
```

2. Define conflict resolution strategy (default: per-column client-wins)

3. Use `withObservables` for reactive UI updates tied to sync status

4. Call `synchronize()` to push/pull changes when network available

## Key Files in Your Project

```
src/
├── model/
│   ├── schema.js           # Tables and columns
│   ├── migrations.js       # Versioned migrations
│   └── Post.js            # Model with relations
├── services/
│   ├── syncService.js     # Sync orchestration
│   └── conflictResolution.js # Custom resolvers
└── screens/
    └── PostDetailScreen.js # withObservables wiring
```

## Three Strict Rules

### Rule 1: Migrations Must Be Versioned & Ordered
- Define in ascending `toVersion` order
- Each migration is atomic and testable
- Track `lastSyncedSchemaVersion` during sync

### Rule 2: Pick a Conflict Resolution Strategy
- **Default (Per-Column Client-Wins)** — Local edits take priority per-field
- **Last-in-Wins** — Newest timestamp wins (settings, immutable docs)
- **Custom Manual** — Complex business logic (merge arrays, aggregate)

### Rule 3: Optimistic Updates + Event-Based Sync
- Update UI instantly (optimistic)
- Sync asynchronously (push/pull)
- Use `withObservables` to track `_status` and `_changes`
- Handle conflicts post-sync via observer

## Common Patterns

**Immediate update with eventual sync:**
```javascript
await post.updateOptimistic({ title: newTitle })
scheduleSync() // Fire-and-forget
```

**Reactive UI:**
```javascript
withObservables(['post'], ({ post }) => ({
  post,
  syncStatus: post.observe().pipe(map(p => p._status)),
}))(PostDetail)
```

**Custom conflict resolver:**
```javascript
const resolver = (table, local, remote, resolved) => {
  if (table === 'order_items') {
    return { ...resolved, qty: Math.max(local.qty, remote.qty) }
  }
  return resolved
}
```

## Testing & Deployment

- ✅ Schema migrations on fresh and upgraded installs
- ✅ Conflict resolution edge cases
- ✅ Network interruption recovery
- ✅ Sync observable emits correct phases
- ✅ No data loss during partial syncs

## Related Skills

- `coding/matt-pocock-typescript/` — TypeScript patterns for type-safe models
- `architecture/tech-debt-audit/` — Code quality checks (including migrations)

## References

- [WatermelonDB Official Docs](https://watermelondb.dev)
- [Sync Implementation Guide](https://watermelondb.dev/docs/Implementation/SyncImpl)
- [Migrations](https://watermelondb.dev/docs/Advanced/Migrations)

---

**Status:** Custom Studio Skill | Based on WatermelonDB 2026 Docs | Production-Ready
