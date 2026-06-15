/** Official limits from https://docs.screeps.com/auth-tokens.html#Rate-Limiting */
const DEFAULT_RATE_LIMITS = {
  global: { max: 120, window: 60 },
  'GET /api/game/room-terrain': { max: 360, window: 3600 },
  'POST /api/game/map-stats': { max: 60, window: 3600 },
  'GET /api/user/code': { max: 60, window: 3600 },
  'POST /api/user/code': { max: 240, window: 86400 },
  'POST /api/user/set-active-branch': { max: 240, window: 86400 },
  'GET /api/user/memory': { max: 1440, window: 86400 },
  'POST /api/user/memory': { max: 240, window: 86400 },
  'GET /api/user/memory-segment': { max: 360, window: 3600 },
  'POST /api/user/memory-segment': { max: 60, window: 3600 },
  'POST /api/user/console': { max: 360, window: 3600 },
  'GET /api/game/market/orders-index': { max: 60, window: 3600 },
  'GET /api/game/market/orders': { max: 60, window: 3600 },
  'GET /api/game/market/my-orders': { max: 60, window: 3600 },
  'GET /api/game/market/stats': { max: 60, window: 3600 },
  'GET /api/game/user/money-history': { max: 60, window: 3600 },
  'GET /api/user/money-history': { max: 60, window: 3600 }
}

const buckets = new Map()

function bucketKey (tokenId, limitKey) {
  return `${tokenId}:${limitKey}`
}

function getBucket (tokenId, limitKey, windowSec) {
  const key = bucketKey(tokenId, limitKey)
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowSec * 1000 }
    buckets.set(key, bucket)
  }
  return bucket
}

function rateLimitKeyVariants (endpointKey) {
  const variants = [endpointKey]
  const withGame = /^(\S+) (\/api)\/game(\/.+)$/.exec(endpointKey)
  if (withGame) {
    variants.push(`${withGame[1]} ${withGame[2]}${withGame[3]}`)
  } else {
    const withoutGame = /^(\S+) (\/api)(\/(?!game\/).+)$/.exec(endpointKey)
    if (withoutGame) {
      variants.push(`${withoutGame[1]} ${withoutGame[2]}/game${withoutGame[3]}`)
    }
  }
  return variants
}

function lookupConfiguredLimit (limits, endpointKey) {
  for (const variant of rateLimitKeyVariants(endpointKey)) {
    if (limits[variant]) return { key: variant, limit: limits[variant] }
  }
  return null
}

function previewBucket (tokenId, limitKey, { max, window }) {
  const bucket = getBucket(tokenId, limitKey, window)
  const resetSec = Math.ceil(bucket.resetAt / 1000)
  const remaining = Math.max(0, max - bucket.count)
  const allowed = bucket.count < max
  return {
    allowed,
    limit: max,
    remaining: allowed ? remaining - 1 : remaining,
    reset: resetSec,
    retryAfterMs: allowed ? 0 : Math.max(0, bucket.resetAt - Date.now())
  }
}

function pickTighter (a, b) {
  if (!a) return b
  if (!b) return a
  if (!a.allowed) return a
  if (!b.allowed) return b
  return a.remaining <= b.remaining ? a : b
}

function setRateLimitHeaders (res, result) {
  if (!result) return
  res.set('X-RateLimit-Limit', String(result.limit))
  res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)))
  res.set('X-RateLimit-Reset', String(result.reset))
}

function checkAndConsume (tokenId, endpointKey, limits) {
  const applicable = []

  if (limits.global) {
    applicable.push({ key: 'global', limit: limits.global })
  }

  const endpoint = lookupConfiguredLimit(limits, endpointKey)
  if (endpoint) {
    applicable.push({ key: endpoint.key, limit: endpoint.limit })
  }

  if (!applicable.length) {
    return { allowed: true, headers: null, retryAfterMs: 0 }
  }

  const previews = applicable.map(({ key, limit }) => previewBucket(tokenId, key, limit))
  const rejected = previews.find(p => !p.allowed)
  if (rejected) {
    return { allowed: false, headers: rejected, retryAfterMs: rejected.retryAfterMs }
  }

  for (const { key, limit } of applicable) {
    getBucket(tokenId, key, limit.window).count++
  }

  const post = applicable.map(({ key, limit }) => {
    const bucket = getBucket(tokenId, key, limit.window)
    return {
      allowed: true,
      limit: limit.max,
      remaining: Math.max(0, limit.max - bucket.count),
      reset: Math.ceil(bucket.resetAt / 1000),
      retryAfterMs: 0
    }
  })

  let report = post[0]
  for (let i = 1; i < post.length; i++) {
    report = pickTighter(report, post[i])
  }

  return { allowed: true, headers: report, retryAfterMs: 0 }
}

module.exports = {
  DEFAULT_RATE_LIMITS,
  checkAndConsume,
  setRateLimitHeaders,
  lookupConfiguredLimit
}
