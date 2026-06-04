// XPath navigation over git trees.
// Read-only selection — always returns an array of nodes.
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
    const oid = await gitLayer.resolveRef(ref || 'main')
    const commit = await gitLayer.log(ref || 'main', 1)
    return commit[0].commit.tree
  }

  return {
    // Select nodes at a path. Always returns an array.
    // For a tree: returns the entries (children).
    // For a blob: returns a single-element array with the blob info.
    // For a non-existent path: returns empty array.
    async select (path, opts = {}) {
      const { ref, mode = 'raw' } = opts
      const rootTree = await getHeadTree(ref)

      // Root selection
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

      // It's a blob — return single-element array
      return [{
        key: path,
        type: 'blob',
        oid: resolved.oid,
        mode: resolved.mode
      }]
    },

    // Read the value at a path. Returns bytes or null.
    async read (path, opts = {}) {
      const { ref } = opts
      const rootTree = await getHeadTree(ref)
      const resolved = await gitLayer.resolvePath(rootTree, path)
      if (!resolved || resolved.type === 'tree' || resolved.mode === '040000') return null
      return gitLayer.readBlob(resolved.oid)
    }
  }
}
