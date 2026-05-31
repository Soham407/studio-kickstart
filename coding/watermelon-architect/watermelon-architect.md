---
name: watermelon-architect
description: Offline-first WatermelonDB architecture patterns for React Native apps with strict rules for migrations, sync conflict resolution, and optimistic UI updates
type: pattern
category: coding
tags: [watermelondb, react-native, offline-first, sync, sqlite, conflict-resolution]
source: https://watermelondb.dev (2026 docs)
---

# WatermelonDB Architect Skill

Master offline-first database architecture for React Native using WatermelonDB with production-grade sync, migrations, and optimistic UI patterns.

## Overview

WatermelonDB is a reactive database framework for React Native that enables:
- **Lazy-loaded, fast queries** via indexed SQLite
- **Offline-first sync** with server reconciliation
- **Content-based conflict resolution** (per-column client-wins strategy)
- **Automatic UI reactivity** through `withObservables`

This skill enforces three strict architectural rules:
1. **Schema Migrations** — versioned, ordered, transactional
2. **Conflict Resolution** — client-wins per-column or custom manual logic
3. **Optimistic Updates** — immediate local changes with eventual server sync

---

## Rule 1: SQLite Schema Migrations

### Strict Requirements

✅ **DO:**
- Define migrations in ascending `toVersion` order
- Use semantic versioning (v1, v2, v3...)
- Ensure each migration is a complete, atomic step
- Track `lastSyncedSchemaVersion` and `migrationsEnabledAtVersion`
- Test migrations against both fresh and upgraded schemas

❌ **DO NOT:**
- Modify schema outside of migration blocks
- Skip versions or define out-of-order migrations
- Mix data transformation with schema changes
- Forget to handle backward compatibility

### Pattern: Versioned Migrations

```javascript
// src/model/migrations.js
import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema'

export default schemaMigrations({
  migrations: [
    // Version 3: Add comments table and post metadata
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'comments',
          columns: [
            { name: 'post_id', type: 'string', isIndexed: true },
            { name: 'body', type: 'string' },
            { name: 'created_at', type: 'number' },
            { name: 'author_id', type: 'string', isIndexed: true },
          ],
        }),
        addColumns({
          table: 'posts',
          columns: [
            { name: 'subtitle', type: 'string', isOptional: true },
            { name: 'is_pinned', type: 'boolean', isOptional: true },
            { name: 'comment_count', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    // Version 2: Add status tracking
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'posts',
          columns: [
            { name: 'published_at', type: 'number', isOptional: true },
            { name: 'view_count', type: 'number' },
          ],
        }),
      ],
    },
    // Version 1: Initial schema (defined in schema.js)
  ],
})
```

### Migration Sync Tracking

Track schema versions during synchronization to support incremental migrations:

```javascript
// src/services/syncService.js
const syncState = {
  lastPulledAt: null,
  lastSyncedSchemaVersion: 1,
  migrationsEnabledAtVersion: 2, // Migrations supported from v2 onward
  currentSchemaVersion: 3,
}

async function synchronize(database) {
  const pullChanges = await fetchFromServer(syncState.lastPulledAt)
  
  const result = await database.write(async () => {
    return await synchronize({
      pullChanges,
      pushChanges: await getPushChanges(),
      migrationsEnabledAtVersion: syncState.migrationsEnabledAtVersion,
      onSuccess: () => {
        syncState.lastSyncedSchemaVersion = syncState.currentSchemaVersion
        syncState.lastPulledAt = new Date()
      },
    })
  })
  
  return result
}
```

---

## Rule 2: Conflict Resolution Strategies

### Strategy 1: Per-Column Client-Wins (Default)

**When to use:** Most production apps where local user edits take priority

**How it works:**
1. Server sends remote changes
2. WatermelonDB applies remote record
3. Any columns modified locally since last sync are re-applied over remote
4. Record remains marked as "updated" until pushed to server

```javascript
// Default behavior - no custom resolver needed
const result = await database.write(async () => {
  return await synchronize({
    pullChanges: await server.pull(lastPulledAt),
    pushChanges: getPushChanges(),
    // No conflictResolver = uses per-column client-wins
  })
})
```

**Tracking mechanism:**
```javascript
// WatermelonDB tracks via _status and _changes fields:
{
  id: 'post-123',
  title: 'Updated Title', // Changed locally
  body: 'Original body', // Remote wins (not changed locally)
  _status: 'updated',
  _changes: ['title'], // Only this column was changed
}
```

### Strategy 2: Last-in-Wins (Full Replace)

**When to use:** Settings, preferences, or immutable documents where latest change wins regardless of origin

```javascript
// src/model/schema.js - Define at table level
export const tableSchema = {
  name: 'user_settings',
  columns: [
    { name: 'id', type: 'string', isIndexed: true },
    { name: 'theme', type: 'string' },
    { name: 'language', type: 'string' },
    { name: 'updated_at', type: 'number' }, // Track for Last-in-Wins
    { name: 'synced_at', type: 'number' },
  ],
}

// During sync: compare timestamps
const conflictResolver = (tableName, local, remote, resolved) => {
  if (tableName === 'user_settings') {
    // Last-in-wins: take whichever has newer timestamp
    return local.updated_at > remote.updated_at ? local : remote
  }
  // Default client-wins for other tables
  return resolved
}
```

### Strategy 3: Manual Custom Resolution

**When to use:** Complex business logic (e.g., merge arrays, aggregate values)

```javascript
// src/services/conflictResolution.js
export const customConflictResolver = (tableName, local, remote, resolved) => {
  switch (tableName) {
    case 'order_items':
      // Merge quantities if both sides modified
      if (local.quantity_ordered !== remote.quantity_ordered) {
        return {
          ...resolved,
          quantity_ordered: Math.max(local.quantity_ordered, remote.quantity_ordered),
          conflict_resolved_at: Date.now(),
          resolution_strategy: 'max-quantity',
        }
      }
      return resolved
      
    case 'cart_items':
      // Custom: local additions, remote deletions
      if (local._status === 'updated' && remote._status === 'deleted') {
        return local // Keep local if user added after server deleted
      }
      return resolved
      
    default:
      return resolved
  }
}

// Use in sync call
const result = await database.write(async () => {
  return await synchronize({
    pullChanges: await server.pull(lastPulledAt),
    pushChanges: getPushChanges(),
    conflictResolver: customConflictResolver,
  })
})
```

### Conflict Resolution Flow Diagram

```
┌─────────────────────────────┐
│  Pull changes from server   │
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ Record exists locally?      │
└──────────────┬──────────────┘
        Yes  ▼  No
            ▼ ▼
     ┌──────────────────┐
     │ Apply as-is      │
     └──────────────────┘
            ▲
            │
    ┌───────┴────────┐
    ▼                ▼
Was locally   Use custom
modified?     resolver?
    │                │
   Yes              Yes
    │                │
    ▼                ▼
Per-column    Apply custom
Client-wins   logic
    │                │
    └────────┬───────┘
             ▼
    ┌─────────────────┐
    │ Apply resolved  │
    │ record locally  │
    └─────────────────┘
```

---

## Rule 3: Optimistic UI Updates

### Pattern: Immediate Local Changes with Eventual Server Sync

**Principle:** Update UI instantly, push changes asynchronously, handle conflicts gracefully.

### Step 1: Structure Data with Status Tracking

```javascript
// src/model/Post.js
import { Model } from '@nozbe/watermelondb'
import { field, lazy, readonly, date } from '@nozbe/watermelondb/decorators'

export default class Post extends Model {
  static table = 'posts'

  @field('title') title
  @field('body') body
  @field('is_pinned') isPinned
  
  @readonly @date('created_at') createdAt
  @readonly @date('updated_at') updatedAt
  @field('_status') syncStatus // 'created', 'updated', 'synced', 'deleted'
  @field('_changes') changedFields // ['title', 'body']

  // Relation
  @lazy comments = this.collections
    .get('comments')
    .query(Q.where('post_id', this.id))

  async updateOptimistic(updates) {
    // Update locally first (optimistic)
    await this.update(record => {
      Object.assign(record, updates)
      record._status = record._status === 'synced' ? 'updated' : record._status
    })

    // Then sync when network available
    return scheduleSync()
  }
}
```

### Step 2: Reactive Query with `withObservables`

```javascript
// src/screens/PostDetailScreen.js
import { withObservables } from '@nozbe/watermelondb/react'
import { Q } from '@nozbe/watermelondb'

const PostDetail = ({ post, comments, verifiedCount, isLoading }) => {
  return (
    <SafeAreaView>
      <Text style={styles.title}>{post.title}</Text>
      <Text style={styles.body}>{post.body}</Text>
      
      {/* Show sync status */}
      {post.syncStatus !== 'synced' && (
        <Text style={styles.syncIndicator}>
          Syncing... {post.syncStatus}
        </Text>
      )}
      
      <FlatList
        data={comments}
        renderItem={({ item }) => <CommentRow comment={item} />}
        ListHeaderComponent={() => <Text>{verifiedCount} verified</Text>}
      />
    </SafeAreaView>
  )
}

// Wire up observations
export default withObservables(['post'], ({ post }) => ({
  post,
  comments: post.comments.observeWithColumns(['verified_at']),
  verifiedCount: post.verifiedComments.observeCount(),
  isLoading: post.observe().pipe(
    map(p => p.syncStatus === 'synced'),
  ),
}))(PostDetail)
```

### Step 3: Handle Optimistic Updates

```javascript
// src/services/postService.js
export async function updatePostTitle(post, newTitle) {
  // 1. Optimistic update (instant UI feedback)
  const originalTitle = post.title
  
  try {
    await post.updateOptimistic({ title: newTitle })
    
    // 2. Schedule sync (fire-and-forget)
    scheduleSync()
    
    return { success: true }
  } catch (error) {
    // 3. Rollback on local error
    await post.updateOptimistic({ title: originalTitle })
    
    return { success: false, error: error.message }
  }
}
```

### Step 4: Conflict Resolution Post-Sync

```javascript
// src/services/syncService.js
import { observeSync } from '@nozbe/watermelondb/sync'

function setupSyncObserver(database) {
  observeSync(database).subscribe(syncState => {
    if (syncState.phase === 'conflict') {
      handleConflict(syncState.tableName, syncState.local, syncState.remote)
    }
    
    if (syncState.phase === 'success') {
      showToast('All changes synced')
      resetSyncIndicators()
    }
    
    if (syncState.phase === 'error') {
      showToast('Sync failed: ' + syncState.error.message)
      retrySync()
    }
  })
}

function handleConflict(tableName, local, remote) {
  // Option 1: Show user choice
  Alert.alert('Update conflict', `Keep local or accept remote?`, [
    { text: 'Keep mine', onPress: () => keepLocal() },
    { text: 'Accept theirs', onPress: () => acceptRemote() },
  ])
  
  // Option 2: Auto-resolve with custom logic
  // (handled via conflictResolver in sync config)
}
```

---

## Complete Setup Example

```javascript
// src/database/index.js
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import schema from './schema'
import migrations from './migrations'
import { customConflictResolver } from '../services/conflictResolution'

export async function initializeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: 'studio_app',
    jsi: true, // Use JSI for better performance
    onSetUpError: error => {
      console.error('Database setup failed:', error)
      // Offer user to retry or reset app
    },
  })

  const database = new Database({
    adapter,
    modelClasses: [Post, Comment, User],
  })

  // Setup sync observer
  setupSyncObserver(database)

  return database
}

// src/services/syncService.js
export async function synchronizeWithServer(database) {
  const lastPulledAt = await getLastPulledTimestamp()

  try {
    const result = await database.write(async () => {
      return await synchronize({
        pullChanges: async (lastPulledAt) => {
          const response = await api.get('/sync/pull', { lastPulledAt })
          return {
            changes: response.changes,
            timestamp: response.timestamp,
          }
        },
        
        pushChanges: async (changes) => {
          await api.post('/sync/push', changes)
        },
        
        conflictResolver: customConflictResolver,
        
        onWillApplyRemoteChanges: (stats) => {
          console.log(`Pulling ${stats.posts} posts, ${stats.comments} comments`)
        },
      })
    })

    saveLastPulledTimestamp(result.timestamp)
    return { success: true }
  } catch (error) {
    console.error('Sync failed:', error)
    return { success: false, error }
  }
}
```

---

## Testing Checklist

- [ ] Schema migrations execute in order without errors
- [ ] Fresh install applies all migrations correctly
- [ ] Existing databases upgrade through version steps
- [ ] Per-column client-wins correctly re-applies local changes
- [ ] Custom conflict resolver handles edge cases
- [ ] Optimistic updates don't trigger unnecessary syncs
- [ ] `withObservables` properly tracks _status and _changes
- [ ] Sync observable emits correct phase events
- [ ] Conflict scenarios are resolved deterministically
- [ ] No data loss on network interruption mid-sync

---

## Performance Tips

1. **Index strategically** — Use `isIndexed: true` on foreign keys and query columns
2. **Lazy-load relations** — Use `@lazy` for comments, related posts
3. **Pagination** — Limit queries with `.limit()` and `.skip()` for large tables
4. **Batch sync** — Push/pull in chunks for large datasets
5. **Use `withObservables`** — Leverages RxJS for efficient subscriptions
6. **Debounce sync** — Don't sync on every keystroke; use 2-5s debounce

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Forgetting to call `synchronize()` after writes | Use sync observer or schedule sync automatically |
| Migrations out of order | Always use ascending `toVersion` numbers |
| Not tracking `_changes` field | WatermelonDB auto-tracks; just use it for conflict detection |
| Blocking UI during sync | Use `.write()` for writes; sync happens asynchronously |
| Assuming server is source of truth | Use client-wins for UX; server is backup only |

---

## References

- [WatermelonDB Sync Docs](https://watermelondb.dev/docs/Sync)
- [WatermelonDB Migrations](https://watermelondb.dev/docs/Advanced/Migrations)
- [WatermelonDB Conflict Resolution](https://watermelondb.dev/docs/Implementation/SyncImpl)
- [WatermelonDB Query API](https://watermelondb.dev/docs/Query)
