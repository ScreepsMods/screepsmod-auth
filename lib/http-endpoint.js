function normalizePathOnly (url) {
  if (!url) return '/'
  const p = ('' + url).split('?')[0] || '/'
  return p.replace(/\/{2,}/g, '/') || '/'
}

function httpEndpointKey (req) {
  const pathOnly = normalizePathOnly(req.originalUrl || req.url || '')
  return `${(req.method || 'GET').toUpperCase()} ${pathOnly}`
}

module.exports = {
  normalizePathOnly,
  httpEndpointKey
}
