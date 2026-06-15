const fs = require('fs')
const ini = require('ini')
const { DEFAULT_RATE_LIMITS } = require('./ratelimit')

const DEFAULT_AUTH = {
  registerCpu: 100,
  preventSpawning: false,
  rateLimitEnabled: false
}

const RATELIMIT_PREFIX = 'ratelimit.'

function truthy (v) {
  if (v === true || v === 1) return true
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    return s === 'true' || s === '1' || s === 'yes' || s === 'on'
  }
  return false
}

function normalizeCpu (value) {
  const cpu = typeof value !== 'number' ? parseInt(value, 10) : Math.round(value)
  return Number.isFinite(cpu) ? cpu : DEFAULT_AUTH.registerCpu
}

function parseScreepsrc () {
  let auth
  try {
    auth = ini.parse(fs.readFileSync('./.screepsrc', { encoding: 'utf8' })).auth || {}
  } catch (e) {
    return {}
  }

  const result = {}
  if (auth.registerCpu != null) result.registerCpu = normalizeCpu(auth.registerCpu)
  if (auth.preventSpawning != null) result.preventSpawning = truthy(auth.preventSpawning)
  if (auth.rateLimitEnabled != null) result.rateLimitEnabled = truthy(auth.rateLimitEnabled)

  function parseKey (suffix) {
    if (suffix === 'global') return 'global'
    const dot = suffix.indexOf('.')
    if (dot === -1) return null
    const method = suffix.slice(0, dot)
    const pathDots = suffix.slice(dot + 1)
    if (!method || !pathDots) return null
    return `${method.toUpperCase()} /${pathDots.replace(/\./g, '/')}`
  }

  function parseValue (value) {
    if (value == null) return null
    const s = String(value).trim()
    if (!s || s.toLowerCase() === 'null') return { max: null }
    const parts = s.split(',').map(x => x.trim())
    const max = parseInt(parts[0], 10)
    if (Number.isNaN(max) || max < 1) {
      console.warn(`[screepsmod-auth] invalid ratelimit max "${parts[0]}", skipping value`)
      return null
    }
    const out = { max }
    if (parts.length > 1 && parts[1] !== '') {
      const window = parseInt(parts[1], 10)
      if (Number.isNaN(window) || window < 1) {
        console.warn(`[screepsmod-auth] invalid ratelimit window "${parts[1]}", using default window`)
      } else {
        out.window = window
      }
    }
    return out
  }

  const rateLimits = {}
  for (const [key, rawValue] of Object.entries(auth)) {
    if (!key.startsWith(RATELIMIT_PREFIX)) continue

    const bucketKey = parseKey(key.slice(RATELIMIT_PREFIX.length))
    if (!bucketKey) {
      console.warn(`[screepsmod-auth] invalid ratelimit key "${key}", skipping`)
      continue
    }
    const parsed = parseValue(rawValue)
    if (parsed) rateLimits[bucketKey] = parsed
  }

  if (Object.keys(rateLimits).length) result.rateLimits = rateLimits
  return result
}

function parseConfigYml (source) {
  let auth
  if (source == null) {
    let YAML
    try {
      YAML = require('yamljs')
    } catch (e) {
      return {}
    }
    auth = null
    for (const file of ['config.yml', 'config.yaml']) {
      try {
        fs.statSync(file)
        auth = YAML.parse(fs.readFileSync(file, 'utf8')).serverConfig?.auth
        break
      } catch (e) { }
    }
  } else if (source.auth) {
    auth = source.auth
  } else {
    auth = source
  }

  if (!auth || typeof auth !== 'object') return {}

  const result = {}
  if (auth.registerCpu != null) result.registerCpu = normalizeCpu(auth.registerCpu)
  if (auth.preventSpawning != null) result.preventSpawning = truthy(auth.preventSpawning)
  if ('rateLimitEnabled' in auth) result.rateLimitEnabled = truthy(auth.rateLimitEnabled)

  if (auth.rateLimits && typeof auth.rateLimits === 'object') {
    function normalizeEntry (entry) {
      if (entry == null) return null
      if (typeof entry !== 'object') return null
      const out = {}
      if ('max' in entry) {
        if (entry.max === null || entry.max === false) {
          out.max = null
        } else {
          const max = typeof entry.max === 'number' ? entry.max : parseInt(entry.max, 10)
          if (Number.isNaN(max) || max < 1) {
            console.warn('[screepsmod-auth] invalid rateLimits max, skipping field')
          } else {
            out.max = max
          }
        }
      }
      if ('window' in entry && entry.window != null) {
        const window = typeof entry.window === 'number' ? entry.window : parseInt(entry.window, 10)
        if (Number.isNaN(window) || window < 1) {
          console.warn('[screepsmod-auth] invalid rateLimits window, skipping field')
        } else {
          out.window = window
        }
      }
      return Object.keys(out).length ? out : null
    }

    const rateLimits = {}
    for (const [key, entry] of Object.entries(auth.rateLimits)) {
      const normalized = normalizeEntry(entry)
      if (normalized) rateLimits[key] = normalized
    }
    if (Object.keys(rateLimits).length) result.rateLimits = rateLimits
  }

  return result
}

function mergeAuthConfig (fromScreepsrc, fromYaml) {
  const screepsrc = fromScreepsrc || {}
  const yaml = fromYaml || {}
  const overrides = {
    ...(screepsrc.rateLimits || {}),
    ...(yaml.rateLimits || {})
  }

  function buildActiveLimits () {
    function mergeLimitEntry (base, override) {
      if (!override) return base
      if (override.max === null) return null
      if (!base && override.max != null) {
        if (override.window == null) return null
        return { max: override.max, window: override.window }
      }
      if (!base) return null
      const merged = { ...base, ...override }
      if (merged.max == null) return null
      return merged
    }

    const active = {}
    const keys = new Set([...Object.keys(DEFAULT_RATE_LIMITS), ...Object.keys(overrides)])
    for (const key of keys) {
      const base = DEFAULT_RATE_LIMITS[key] || null
      const override = overrides[key] || null
      const merged = mergeLimitEntry(base, override)
      if (merged) active[key] = merged
    }
    return active
  }

  return {
    registerCpu: yaml.registerCpu ?? screepsrc.registerCpu ?? DEFAULT_AUTH.registerCpu,
    preventSpawning: yaml.preventSpawning ?? screepsrc.preventSpawning ?? DEFAULT_AUTH.preventSpawning,
    rateLimitEnabled: yaml.rateLimitEnabled ?? screepsrc.rateLimitEnabled ?? DEFAULT_AUTH.rateLimitEnabled,
    rateLimits: buildActiveLimits()
  }
}

module.exports = function (config) {
  const screepsrcAuth = parseScreepsrc()
  let yamlAuth = {}

  function reloadConfig (source) {
    yamlAuth = parseConfigYml(source)
    config.auth.config = mergeAuthConfig(screepsrcAuth, yamlAuth)
  }

  reloadConfig()

  let utilsBound = false
  function bindUtils () {
    if (!config.utils || utilsBound) return
    utilsBound = true
    config.utils.on('config:update:auth', reloadConfig)
  }

  bindUtils()
  if (config.backend) {
    config.backend.once('expressPreConfig', bindUtils)
  }
}
