// The Kafka record — the carrier for all operations.
// key + value + headers. Value is opaque bytes. Headers accumulate
// context as the record moves through the pipeline.

export function createRecord (key, value, headers = []) {
  return {
    key,
    value: value || null,
    headers: [...headers]
  }
}

export function addHeader (record, key, value) {
  return {
    ...record,
    headers: [...record.headers, { key, value }]
  }
}

export function getHeader (record, key) {
  for (let i = record.headers.length - 1; i >= 0; i--) {
    if (record.headers[i].key === key) return record.headers[i].value
  }
  return null
}

export function withError (record, message) {
  return addHeader(
    addHeader(record, 'spl.status', 'error'),
    'spl.error', message
  )
}

export function withStatus (record, status) {
  return addHeader(record, 'spl.status', status)
}

// Roadmap: select evolves to return Kafka records as selection results.
// Each selected node becomes a record carrying the reference (key, oid,
// source type — git tree or kafka topic) plus metadata in headers. CRUD
// operations (get, put) then operate on those records, filling the value.
// This unifies git entries and kafka log entries under one selection model.
// Lands when kafka topics are registered and select needs to return
// references across both stores.
