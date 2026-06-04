// CRUD operations on the mycelium repo.
// Plain functions — no Kafka records internally. Take arguments, return results.
// Throw on fatal error (conflict, not found). No hidden conditional routes.

export function createCrud (gitLayer) {

  async function getHeadTree (ref) {
    const log = await gitLayer.log(ref || 'main', 1)
    return log[0].commit.tree
  }

  // Rebuild a tree from the root, replacing/adding/removing at the target path.
  // Throws on conflict (file where folder expected, or vice versa).
  async function modifyTree (rootTreeOid, path, action) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) throw new Error('cannot modify root')

    async function walk (treeOid, depth) {
      const entries = treeOid ? await gitLayer.readTree(treeOid) : []
      const name = segments[depth]

      if (depth === segments.length - 1) {
        const existing = entries.find(e => e.path === name)
        const filtered = entries.filter(e => e.path !== name)

        if (action.type === 'remove') {
          if (!existing) throw new Error(`not found: ${path}`)
          return gitLayer.writeTree(filtered.map(e => ({
            mode: e.mode, path: e.path, oid: e.oid, type: e.type || 'blob'
          })))
        }

        // Put — conflict if types don't match
        if (existing) {
          const existingIsTree = existing.type === 'tree' || existing.mode === '040000'
          const newIsTree = action.mode === '040000'
          if (existingIsTree !== newIsTree) {
            throw new Error(`conflict: ${path} is a ${existingIsTree ? 'folder' : 'file'}`)
          }
        }

        filtered.push({
          mode: action.mode, path: name, oid: action.oid,
          type: action.mode === '040000' ? 'tree' : 'blob'
        })
        return gitLayer.writeTree(filtered.map(e => ({
          mode: e.mode, path: e.path, oid: e.oid, type: e.type || 'blob'
        })))
      }

      // Intermediate level — recurse
      const existing = entries.find(e => e.path === name)
      let subtreeOid
      if (existing && (existing.type === 'tree' || existing.mode === '040000')) {
        subtreeOid = await walk(existing.oid, depth + 1)
      } else if (!existing) {
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
    // Read value at path. Returns Buffer. Throws if not found or is a directory.
    async get (path, ref) {
      const rootTree = await getHeadTree(ref)
      const resolved = await gitLayer.resolvePath(rootTree, path)
      if (!resolved) throw new Error(`not found: ${path}`)
      if (resolved.type === 'tree' || resolved.mode === '040000') {
        throw new Error(`is a directory: ${path}`)
      }
      return gitLayer.readBlob(resolved.oid)
    },

    // Write value at path. Returns the new root tree OID.
    // Creates intermediate directories. Throws on type conflict.
    async put (path, value, ref) {
      let rootTree
      try {
        rootTree = await getHeadTree(ref)
      } catch (e) {
        rootTree = null
      }
      const blobOid = await gitLayer.writeBlob(value)
      return modifyTree(rootTree, path, { type: 'put', oid: blobOid, mode: '100644' })
    },

    // Remove entry at path. Returns the new root tree OID.
    // Throws if not found.
    async remove (path, ref) {
      const rootTree = await getHeadTree(ref)
      return modifyTree(rootTree, path, { type: 'remove' })
    }
  }
}
