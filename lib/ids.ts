// Pure id parsing for the `_lib` boundary: a malformed id is treated like a missing one.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (s: string) => UUID.test(s)
