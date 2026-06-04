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
