// Mycelium — the data fabric base layer.
//
// Two interfaces:
//   Internal: plain functions (select, read, get, put, remove, commit)
//   External: Kafka record dispatch via the mapper (single entry point)
//
// Internal functions throw on fatal error.
// The mapper catches and puts errors in record headers.

import { createGitLayer } from './lib/git.js'
import { createXPath } from './lib/xpath.js'
import { createCrud } from './lib/crud.js'
import { createMapper } from './lib/mapper.js'

export { createRecord, addHeader, getHeader, withError, withStatus } from './lib/record.js'

export async function open (git, fs, dir, opts = {}) {
  const gitLayer = createGitLayer(git, fs, dir)
  const xpath = createXPath(gitLayer)
  const crud = createCrud(gitLayer)
  const mapper = createMapper(crud, xpath)

  if (opts.init) {
    await gitLayer.init()
  }

  return {
    // --- Internal API: plain functions ---

    // XPath
    select: xpath.select,
    read: xpath.read,

    // CRUD
    get: crud.get,
    put: crud.put,
    list: crud.list,
    remove: crud.remove,

    // Git
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

    git: gitLayer,

    // --- External API: Kafka record dispatch ---

    dispatch: mapper.dispatch
  }
}
