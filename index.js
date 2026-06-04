// Mycelium — the data fabric base layer.
// Blends git, xpath, and URI CRUD into one module.
// All operations carry a Kafka record (key + value + headers).

import { createGitLayer } from './lib/git.js'
import { createXPath } from './lib/xpath.js'
import { createCrud } from './lib/crud.js'
import { getHeader } from './lib/record.js'

export { createRecord, addHeader, getHeader, withError, withStatus } from './lib/record.js'

export async function open (git, fs, dir, opts = {}) {
  const gitLayer = createGitLayer(git, fs, dir)
  const xpath = createXPath(gitLayer)
  const crud = createCrud(gitLayer)

  if (opts.init) {
    await gitLayer.init()
  }

  return {
    // XPath — select, always returns array
    select: xpath.select,

    // XPath — read value at path
    read: xpath.read,

    // CRUD — returns records
    get: crud.get,
    put: crud.put,
    remove: crud.remove,

    // Git — state management
    async commit (message, author) {
      // Collect all staged trees from recent operations
      // For now: build tree from current state and commit
      const ref = 'main'
      let headOid, rootTree
      try {
        headOid = await gitLayer.resolveRef('refs/heads/' + ref)
        const log = await gitLayer.log(ref, 1)
        rootTree = log[0].commit.tree
      } catch (e) {
        // No commits yet
        rootTree = await gitLayer.writeTree([])
        headOid = null
      }

      const parents = headOid ? [headOid] : []
      const commitOid = await gitLayer.commit(rootTree, parents, message, author)
      await gitLayer.updateRef('refs/heads/' + ref, commitOid)
      return commitOid
    },

    // Commit a specific tree (from a put/remove operation)
    async commitTree (treeOid, message, author) {
      const ref = 'main'
      let headOid
      try {
        headOid = await gitLayer.resolveRef('refs/heads/' + ref)
      } catch (e) {
        headOid = null
      }

      const parents = headOid ? [headOid] : []
      const commitOid = await gitLayer.commit(treeOid, parents, message, author)
      await gitLayer.updateRef('refs/heads/' + ref, commitOid)
      return commitOid
    },

    async log (ref, depth) {
      return gitLayer.log(ref || 'main', depth)
    },

    // Direct access to the git layer for advanced operations
    git: gitLayer
  }
}
