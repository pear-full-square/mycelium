// Test: mycelium CRUD + XPath over a git repo on bare-fs.
// Exercises: put (create), get (read), select (xpath), commit, remove.
// All operations carry Kafka records with headers.

import * as git from './node_modules/isomorphic-git/index.js'
import fs from 'bare-fs'
import { open, getHeader } from './index.js'

const DIR = '/tmp/mycelium-test'
const AUTHOR = { name: 'spl', email: 's@splectrum' }

async function main () {
  // Clean start
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })

  // Open a new mycelium repo
  const repo = await open(git, fs, DIR, { init: true })
  console.log('opened repo')

  // --- PUT: create files ---
  const r1 = await repo.put('/hello.txt', Buffer.from('hello mycelium\n'))
  console.log('put /hello.txt:', getHeader(r1, 'spl.status'))
  const tree1 = getHeader(r1, 'spl.tree')

  const r2 = await repo.put('/docs/readme.md', Buffer.from('# Readme\n'))
  console.log('put /docs/readme.md:', getHeader(r2, 'spl.status'))

  // Commit the first put
  const c1 = await repo.commitTree(tree1, 'first file', AUTHOR)
  console.log('commit 1:', c1.slice(0, 12))

  // Put docs after first commit — need to build on the committed tree
  const r3 = await repo.put('/docs/readme.md', Buffer.from('# Readme\n'))
  const tree2 = getHeader(r3, 'spl.tree')
  const c2 = await repo.commitTree(tree2, 'add docs', AUTHOR)
  console.log('commit 2:', c2.slice(0, 12))

  // Add metadata (underscore-prefixed)
  const r4 = await repo.put('/docs/_schema.json', Buffer.from('{"type":"doc"}'))
  const tree3 = getHeader(r4, 'spl.tree')
  const c3 = await repo.commitTree(tree3, 'add schema metadata', AUTHOR)
  console.log('commit 3:', c3.slice(0, 12))

  // --- GET: read files ---
  const g1 = await repo.get('/hello.txt')
  console.log('get /hello.txt:', getHeader(g1, 'spl.status'), '-', g1.value.toString().trim())

  const g2 = await repo.get('/docs/readme.md')
  console.log('get /docs/readme.md:', getHeader(g2, 'spl.status'), '-', g2.value.toString().trim())

  const g3 = await repo.get('/nonexistent')
  console.log('get /nonexistent:', getHeader(g3, 'spl.status'))

  // --- SELECT: XPath navigation ---
  const s1 = await repo.select('/')
  console.log('select / (raw):', s1.map(n => n.key))

  const s2 = await repo.select('/docs')
  console.log('select /docs (raw):', s2.map(n => n.key))

  const s3 = await repo.select('/docs', { mode: 'data' })
  console.log('select /docs (data):', s3.map(n => n.key))

  const s4 = await repo.select('/docs', { mode: 'metadata' })
  console.log('select /docs (metadata):', s4.map(n => n.key))

  const s5 = await repo.select('/hello.txt')
  console.log('select /hello.txt:', s5.map(n => ({ key: n.key, type: n.type })))

  const s6 = await repo.select('/nonexistent')
  console.log('select /nonexistent:', s6)

  // --- READ: direct value read via XPath ---
  const v1 = await repo.read('/hello.txt')
  console.log('read /hello.txt:', v1.toString().trim())

  const v2 = await repo.read('/docs')
  console.log('read /docs (directory):', v2)

  // --- LOG ---
  const log = await repo.log()
  console.log('log:', log.length, 'commits:', log.map(l => l.commit.message.trim()))

  // --- CONFLICT: put folder where file is ---
  // (This should error in happy-path mode)
  // We'd need to put a tree at /hello.txt — for now test that
  // get/select work correctly on both types

  // --- Summary ---
  const pass =
    getHeader(r1, 'spl.status') === 'staged' &&
    getHeader(g1, 'spl.status') === 'ok' &&
    g1.value.toString() === 'hello mycelium\n' &&
    getHeader(g3, 'spl.status') === 'error' &&
    s1.length === 2 && // hello.txt + docs
    s3.length === 1 && // readme.md (data only, no _schema.json)
    s4.length === 1 && // _schema.json (metadata only)
    s6.length === 0 &&
    log.length === 3

  console.log('\n' + JSON.stringify({ pass }))
  Bare.exit(pass ? 0 : 1)
}

main().catch(e => { console.error('ERR', e.stack || e.message); Bare.exit(1) })
