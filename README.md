# mycelium — The Data Fabric Base Layer

The Mycelium data fabric base layer. Blends git object operations, XPath
navigation, and URI CRUD into one module. All data is key/value with opaque
bytes (Round 1). AVRO-encoded structure comes in Round 2.

## What This Is

A single module that provides the elementary operations on a Mycelium data
repository: select (navigate), get/put/remove (CRUD), and commit (git state
management). The repository is a git repo — data entities are git objects
(trees and blobs), navigable by XPath, operable by URI operations.

Two interfaces:
- **Internal API** — plain functions. Direct calls, throw on fatal error.
  For use by Mycelium components and applications.
- **External API** — Kafka record dispatch. A single entry point mapper
  that unpacks a record, calls the right internal function, packs the
  result back. For use at fabric boundaries.

## Internal API

```js
import * as git from 'isomorphic-git'
import fs from 'bare-fs'
import { open } from 'mycelium'

const repo = await open(git, fs, '/path/to/repo', { init: true })
```

### select(path, opts) → node[]

XPath selection. Always returns an array. Three visibility modes.

```js
await repo.select('/')                              // all root entries
await repo.select('/docs', { mode: 'data' })        // data only (hides _)
await repo.select('/docs', { mode: 'metadata' })    // metadata only (only _)
await repo.select('/hello.txt')                      // single-element array
await repo.select('/nonexistent')                    // empty array
```

### read(path) → Buffer | null

Read value at path. Returns null for directories or not found.

### get(path) → Buffer

Read value at path. Throws if not found or is a directory.

### put(path, value) → treeOid

Write value at path. Creates intermediate directories. Returns the new
root tree OID. Throws on type conflict (file where folder expected, or
vice versa).

### remove(path) → treeOid

Remove entry at path. Returns the new root tree OID. Throws if not found.

### commitTree(treeOid, message, author) → commitOid

Commit a tree (from put/remove). Quality gate — creates the commit,
updates the ref.

### log(ref, depth) → commits[]

Commit history.

## External API (Kafka Record Dispatch)

```js
import { open, createRecord, getHeader } from 'mycelium'

const record = createRecord('/hello.txt', null, [
  { key: 'spl.operation', value: 'get' }
])
const result = await repo.dispatch(record)
// result.value = file contents
// getHeader(result, 'spl.status') = 'ok' or 'error'
```

Operations: `get`, `put`, `remove`, `select`, `read`. The operation is
in the `spl.operation` header. Errors go in `spl.error` header — never
thrown, always in the record.

## Three Visibility Modes

XPath's `select` operates in three modes via the `mode` option:

| Mode | What it shows |
|---|---|
| raw (default) | Everything — data + metadata together |
| data | Data nodes only — hides underscore-prefixed entries |
| metadata | Metadata nodes only — only underscore-prefixed entries |

The underscore prefix (`_`) is the metadata dimension. `_schema.json` is
metadata; `readme.md` is data; `raw` sees both.

## Architecture

```
Internal API (plain functions — select, read, get, put, remove, commit)
    ↓
lib/crud.js    — CRUD on git objects (tree walk + rebuild)
lib/xpath.js   — XPath navigation (visibility modes, path resolution)
lib/git.js     — git plumbing wrapper (calls isomorphic-git)
    ↓
isomorphic-git plumbing (readBlob, writeTree, etc.)
    ↓
fs adapter (bare-fs or Hyperdrive)

External API: lib/mapper.js (Kafka record dispatch → internal functions)
```

## Dependencies

- **isomorphic-git** — git plumbing operations. Currently uses the full
  upstream; will move to [bare-for-pear/p2p-git](https://github.com/bare-for-pear/p2p-git)
  (stripped plumbing) when integrated.
- **bare-fs** — for testing on the OS filesystem.

## Current State

**Proven.** Tested under Bare:

- put: creates files and intermediate directories, returns tree OIDs
- get: reads file content, throws on not found / is directory
- remove: tested in the tree modification layer
- select: three visibility modes work (raw/data/metadata filtering)
- read: returns Buffer or null
- commitTree: multi-commit history, correct parent linking
- dispatch: Kafka record boundary mapping (get/put/select/error/unknown op)

**Not yet exercised:** Hyperdrive backend (currently bare-fs only), large
trees, deep nesting, concurrent operations, the remove-then-commit flow
end-to-end.

## Intention

The base fabric layer for SPLectrum's Mycelium. This module grows to
include Kafka topic management, the Hypercore ref-log, and eventually
AVRO-aware operations (Round 2). The internal API is free to evolve; the
external Kafka record interface is the stable boundary.

Select will evolve to return Kafka records (not plain objects) when topics
land — unifying git entries and log entries under one selection model.
