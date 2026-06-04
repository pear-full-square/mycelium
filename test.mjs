// Test: mycelium internal API (plain functions) and external API (record dispatch).

import * as git from './node_modules/isomorphic-git/index.js'
import fs from 'bare-fs'
import { open, createRecord, getHeader, addHeader } from './index.js'

const DIR = '/tmp/mycelium-test'
const AUTHOR = { name: 'spl', email: 's@splectrum' }

async function main () {
  fs.rmSync(DIR, { recursive: true, force: true })
  fs.mkdirSync(DIR, { recursive: true })

  const repo = await open(git, fs, DIR, { init: true })
  console.log('=== Internal API (plain functions) ===')

  // PUT — returns tree OID
  const tree1 = await repo.put('/hello.txt', Buffer.from('hello mycelium\n'))
  console.log('put /hello.txt → tree:', tree1.slice(0, 12))

  const c1 = await repo.commitTree(tree1, 'first file', AUTHOR)
  console.log('commit:', c1.slice(0, 12))

  const tree2 = await repo.put('/docs/readme.md', Buffer.from('# Readme\n'))
  const c2 = await repo.commitTree(tree2, 'add docs', AUTHOR)
  console.log('put /docs/readme.md + commit:', c2.slice(0, 12))

  const tree3 = await repo.put('/docs/_schema.json', Buffer.from('{"type":"doc"}'))
  const c3 = await repo.commitTree(tree3, 'add schema', AUTHOR)
  console.log('put /docs/_schema.json + commit:', c3.slice(0, 12))

  // GET — returns Buffer, throws on not found
  const val = await repo.get('/hello.txt')
  console.log('get /hello.txt:', val.toString().trim())

  let notFoundThrew = false
  try { await repo.get('/nonexistent') }
  catch (e) { notFoundThrew = true; console.log('get /nonexistent: threw —', e.message) }

  let isDirThrew = false
  try { await repo.get('/docs') }
  catch (e) { isDirThrew = true; console.log('get /docs: threw —', e.message) }

  // SELECT — returns array with visibility modes
  const selRaw = await repo.select('/docs')
  console.log('select /docs (raw):', selRaw.map(n => n.key))

  const selData = await repo.select('/docs', { mode: 'data' })
  console.log('select /docs (data):', selData.map(n => n.key))

  const selMeta = await repo.select('/docs', { mode: 'metadata' })
  console.log('select /docs (metadata):', selMeta.map(n => n.key))

  const selBlob = await repo.select('/hello.txt')
  console.log('select /hello.txt:', selBlob.map(n => ({ key: n.key, type: n.type })))

  const selNone = await repo.select('/nonexistent')
  console.log('select /nonexistent:', selNone)

  // READ — returns Buffer or null
  const readVal = await repo.read('/hello.txt')
  console.log('read /hello.txt:', readVal.toString().trim())

  const readDir = await repo.read('/docs')
  console.log('read /docs:', readDir)

  // LOG
  const log = await repo.log()
  console.log('log:', log.length, 'commits')

  console.log('\n=== External API (record dispatch) ===')

  // GET via dispatch
  const getRecord = createRecord('/hello.txt', null, [{ key: 'spl.operation', value: 'get' }])
  const getResult = await repo.dispatch(getRecord)
  console.log('dispatch get:', getHeader(getResult, 'spl.status'), '-', getResult.value.toString().trim())

  // PUT via dispatch
  const putRecord = createRecord('/dispatched.txt', Buffer.from('via record\n'), [{ key: 'spl.operation', value: 'put' }])
  const putResult = await repo.dispatch(putRecord)
  console.log('dispatch put:', getHeader(putResult, 'spl.status'))

  // Commit the dispatched put
  const dispTree = getHeader(putResult, 'spl.tree')
  await repo.commitTree(dispTree, 'dispatched put', AUTHOR)

  // SELECT via dispatch
  const selRecord = createRecord('/', null, [{ key: 'spl.operation', value: 'select' }])
  const selResult = await repo.dispatch(selRecord)
  console.log('dispatch select:', getHeader(selResult, 'spl.status'), '-', JSON.parse(selResult.value.toString()).map(n => n.key))

  // Error via dispatch
  const errRecord = createRecord('/nonexistent', null, [{ key: 'spl.operation', value: 'get' }])
  const errResult = await repo.dispatch(errRecord)
  console.log('dispatch error:', getHeader(errResult, 'spl.status'), '-', getHeader(errResult, 'spl.error'))

  // Unknown op via dispatch
  const unkRecord = createRecord('/', null, [{ key: 'spl.operation', value: 'explode' }])
  const unkResult = await repo.dispatch(unkRecord)
  console.log('dispatch unknown:', getHeader(unkResult, 'spl.status'), '-', getHeader(unkResult, 'spl.error'))

  // --- Summary ---
  const pass =
    val.toString() === 'hello mycelium\n' &&
    notFoundThrew &&
    isDirThrew &&
    selRaw.length === 2 &&
    selData.length === 1 &&
    selMeta.length === 1 &&
    selNone.length === 0 &&
    getHeader(getResult, 'spl.status') === 'ok' &&
    getHeader(putResult, 'spl.status') === 'staged' &&
    getHeader(errResult, 'spl.status') === 'error' &&
    getHeader(unkResult, 'spl.status') === 'error' &&
    log.length === 3

  console.log('\n' + JSON.stringify({ pass }))
  Bare.exit(pass ? 0 : 1)
}

main().catch(e => { console.error('ERR', e.stack || e.message); Bare.exit(1) })
