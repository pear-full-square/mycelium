// Boundary mapper — the single entry point between the Kafka record world
// and the internal plain-function world.
//
// Unpacks a record → dispatches to the right internal function → packs the
// result back into a record. Fatal errors go in the record headers.

import { createRecord, withError, withStatus, addHeader, getHeader } from './record.js'

export function createMapper (crud, xpath) {
  // Dispatch a Kafka record to the right operation.
  // The record's headers carry the operation type.
  // Returns a record with the result.
  async function dispatch (record) {
    const op = getHeader(record, 'spl.operation')
    const path = record.key

    try {
      switch (op) {
        case 'get': {
          const value = await crud.get(path)
          return withStatus({ ...record, value }, 'ok')
        }

        case 'list': {
          const entries = await crud.list(path)
          return withStatus({ ...record, value: Buffer.from(entries.join('\n')) }, 'ok')
        }

        case 'put': {
          const treeOid = await crud.put(path, record.value)
          return withStatus(addHeader(record, 'spl.tree', treeOid), 'staged')
        }

        case 'remove': {
          const treeOid = await crud.remove(path)
          return withStatus(addHeader(record, 'spl.tree', treeOid), 'staged')
        }

        case 'select': {
          const mode = getHeader(record, 'spl.mode') || 'raw'
          const nodes = await xpath.select(path, { mode })
          return withStatus(
            { ...record, value: Buffer.from(JSON.stringify(nodes)) },
            'ok'
          )
        }

        case 'read': {
          const value = await xpath.read(path)
          if (value === null) {
            return withError(record, `not readable: ${path}`)
          }
          return withStatus({ ...record, value }, 'ok')
        }

        default:
          return withError(record, `unknown operation: ${op}`)
      }
    } catch (e) {
      return withError(record, e.message)
    }
  }

  return { dispatch }
}
