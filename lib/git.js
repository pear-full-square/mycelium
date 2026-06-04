// Git layer — wraps p2p-git plumbing for mycelium operations.
// Provides: open repo, read tree/blob, write tree/blob, commit.
// All operations work on the git object model directly.

export function createGitLayer (git, fs, dir) {
  const gitdir = dir === '/' ? '/.git' : dir + '/.git'

  return {
    async init () {
      await git.init({ fs, dir })
    },

    async readTree (oid) {
      const result = await git.readTree({ fs, dir, oid })
      return result.tree
    },

    async readBlob (oid) {
      const result = await git.readBlob({ fs, dir, oid })
      return Buffer.from(result.blob)
    },

    async writeBlob (content) {
      if (typeof content === 'string') content = Buffer.from(content)
      return git.writeBlob({ fs, dir, blob: new Uint8Array(content) })
    },

    async writeTree (entries) {
      return git.writeTree({ fs, dir, tree: entries })
    },

    async commit (tree, parents, message, author) {
      const ts = Math.floor(Date.now() / 1000)
      const committer = author
      return git.writeCommit({
        fs, dir,
        commit: {
          tree,
          parent: parents,
          author: { ...author, timestamp: ts, timezoneOffset: 0 },
          committer: { ...committer, timestamp: ts, timezoneOffset: 0 },
          message: message + '\n'
        }
      })
    },

    async updateRef (ref, oid) {
      await git.writeRef({ fs, dir, ref, value: oid, force: true })
    },

    async resolveRef (ref) {
      return git.resolveRef({ fs, dir, ref })
    },

    async log (ref, depth) {
      return git.log({ fs, dir, ref, depth })
    },

    // Resolve a path to a blob OID by walking the tree
    async resolvePath (rootTreeOid, path) {
      const segments = path.split('/').filter(Boolean)
      let currentOid = rootTreeOid

      for (let i = 0; i < segments.length; i++) {
        const entries = await this.readTree(currentOid)
        const match = entries.find(e => e.path === segments[i])
        if (!match) return null

        if (i === segments.length - 1) {
          return { oid: match.oid, type: match.type, mode: match.mode }
        }

        if (match.type === 'tree' || match.mode === '040000') {
          currentOid = match.oid
        } else {
          return null // trying to traverse into a blob
        }
      }

      // Empty path = the root tree itself
      return { oid: rootTreeOid, type: 'tree', mode: '040000' }
    }
  }
}
