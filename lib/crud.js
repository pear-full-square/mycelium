// CRUD operations on the mycelium repo.
// Happy path: file operations on files, folder operations on folders.
// Exception path: conflict → error in the record headers.
// All operations take and return Kafka records.

import { createRecord, withError, withStatus, addHeader } from './record.js'

export function createCrud (gitLayer) {

  // Rebuild a tree from the root, replacing/adding/removing at the target path
  async function modifyTree (rootTreeOid, path, action) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) throw new Error('cannot modify root')

    async function walk (treeOid, depth) {
      const entries = treeOid ? await gitLayer.readTree(treeOid) : []
      const name = segments[depth]

      if (depth === segments.length - 1) {
        // Target level — apply the action
        const existing = entries.find(e => e.path === name)
        const filtered = entries.filter(e => e.path !== name)

        if (action.type === 'remove') {
          // Just remove it
        } else if (action.type === 'put') {
          // Check for conflict: putting a blob where a tree is, or vice versa
          if (existing) {
            const existingIsTree = existing.type === 'tree' || existing.mode === '040000'
            const newIsTree = action.mode === '040000'
            if (existingIsTree !== newIsTree) {
              throw new Error(`conflict: ${path} is a ${existingIsTree ? 'folder' : 'file'}, cannot replace with a ${newIsTree ? 'folder' : 'file'}`)
            }
          }
          filtered.push({ mode: action.mode, path: name, oid: action.oid, type: action.mode === '040000' ? 'tree' : 'blob' })
        }

        return gitLayer.writeTree(filtered.map(e => ({
          mode: e.mode, path: e.path, oid: e.oid, type: e.type || 'blob'
        })))
      }

      // Intermediate level — recurse into the subtree
      const existing = entries.find(e => e.path === name)
      let subtreeOid
      if (existing && (existing.type === 'tree' || existing.mode === '040000')) {
        subtreeOid = await walk(existing.oid, depth + 1)
      } else if (!existing && action.type === 'put') {
        // Create intermediate directory
        subtreeOid = await walk(null, depth + 1)
      } else {
        throw new Error(`conflict: ${segments.slice(0, depth + 1).join('/')} is not a folder`)
      }

      const filtered = entries.filter(e => e.path !== name)
      filtered.push({ mode: '040000', path: name, oid: subtreeOid, type: 'tree' })
      return gitLayer.writeTree(filtered.map(e => ({
        mode: e.mode, path: e.path, oid: e.oid, type: e.type || 'blob'
      })))
    }

    return walk(rootTreeOid, 0)
  }

  return {
    // GET — read value at path, return as a record
    async get (path, opts = {}) {
      const { ref } = opts
      const record = createRecord(path, null, [
        { key: 'spl.operation', value: 'get' }
      ])

      try {
        const oid = await gitLayer.resolveRef(ref || 'main')
        const log = await gitLayer.log(ref || 'main', 1)
        const rootTree = log[0].commit.tree
        const resolved = await gitLayer.resolvePath(rootTree, path)

        if (!resolved) {
          return withError(record, `not found: ${path}`)
        }

        if (resolved.type === 'tree' || resolved.mode === '040000') {
          const entries = await gitLayer.readTree(resolved.oid)
          const listing = entries.map(e => e.path).join('\n')
          return withStatus(
            { ...record, value: Buffer.from(listing) },
            'ok'
          )
        }

        const content = await gitLayer.readBlob(resolved.oid)
        return withStatus({ ...record, value: content }, 'ok')
      } catch (e) {
        return withError(record, e.message)
      }
    },

    // PUT — write value at path, return record with result
    async put (path, value, opts = {}) {
      const { ref } = opts
      const record = createRecord(path, value, [
        { key: 'spl.operation', value: 'put' }
      ])

      try {
        let rootTree
        let parents = []
        try {
          const headOid = await gitLayer.resolveRef(ref || 'main')
          const log = await gitLayer.log(ref || 'main', 1)
          rootTree = log[0].commit.tree
          parents = [headOid]
        } catch (e) {
          // No commits yet — start from empty tree
          rootTree = null
        }

        const blobOid = await gitLayer.writeBlob(value)
        const newTree = await modifyTree(rootTree, path, {
          type: 'put', oid: blobOid, mode: '100644'
        })

        return withStatus(
          addHeader(record, 'spl.tree', newTree),
          'staged'
        )
      } catch (e) {
        return withError(record, e.message)
      }
    },

    // REMOVE — delete entry at path, return record
    async remove (path, opts = {}) {
      const { ref } = opts
      const record = createRecord(path, null, [
        { key: 'spl.operation', value: 'remove' }
      ])

      try {
        const headOid = await gitLayer.resolveRef(ref || 'main')
        const log = await gitLayer.log(ref || 'main', 1)
        const rootTree = log[0].commit.tree

        const newTree = await modifyTree(rootTree, path, { type: 'remove' })

        return withStatus(
          addHeader(record, 'spl.tree', newTree),
          'staged'
        )
      } catch (e) {
        return withError(record, e.message)
      }
    }
  }
}
