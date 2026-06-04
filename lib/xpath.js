// XPath navigation over git trees.
// Plain functions — no records. Always returns arrays.
// Three visibility modes: raw, data, metadata.

const METADATA_PREFIX = '_'

function isMetadata (name) {
  return name.startsWith(METADATA_PREFIX)
}

function filterByMode (entries, mode) {
  if (mode === 'raw') return entries
  if (mode === 'data') return entries.filter(e => !isMetadata(e.path))
  if (mode === 'metadata') return entries.filter(e => isMetadata(e.path))
  return entries
}

export function createXPath (gitLayer) {
  async function getHeadTree (ref) {
    const log = await gitLayer.log(ref || 'main', 1)
    return log[0].commit.tree
  }

  return {
    // Select nodes at a path. Always returns an array.
    // Tree: returns children. Blob: returns single-element. Not found: empty.
    async select (path, opts = {}) {
      const { ref, mode = 'raw' } = opts
      const rootTree = await getHeadTree(ref)

      if (path === '/' || path === '') {
        const entries = await gitLayer.readTree(rootTree)
        return filterByMode(entries, mode).map(e => ({
          key: '/' + e.path,
          type: e.type || (e.mode === '040000' ? 'tree' : 'blob'),
          oid: e.oid,
          mode: e.mode
        }))
      }

      const resolved = await gitLayer.resolvePath(rootTree, path)
      if (!resolved) return []

      if (resolved.type === 'tree' || resolved.mode === '040000') {
        const entries = await gitLayer.readTree(resolved.oid)
        return filterByMode(entries, mode).map(e => ({
          key: path + '/' + e.path,
          type: e.type || (e.mode === '040000' ? 'tree' : 'blob'),
          oid: e.oid,
          mode: e.mode
        }))
      }

      return [{
        key: path,
        type: 'blob',
        oid: resolved.oid,
        mode: resolved.mode
      }]
    },

    // Read value at a path. Returns Buffer or null (for directories/not found).
    async read (path, opts = {}) {
      const { ref } = opts
      const rootTree = await getHeadTree(ref)
      const resolved = await gitLayer.resolvePath(rootTree, path)
      if (!resolved || resolved.type === 'tree' || resolved.mode === '040000') return null
      return gitLayer.readBlob(resolved.oid)
    }
  }
}
