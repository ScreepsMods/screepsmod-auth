const fs = require('fs')
const ini = require('ini')

const DEFAULT_AUTH = {
  registerCpu: 100,
  preventSpawning: false
}

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
  return result
}

function mergeAuthConfig (fromScreepsrc, fromYaml) {
  const screepsrc = fromScreepsrc || {}
  const yaml = fromYaml || {}
  return {
    registerCpu: yaml.registerCpu ?? screepsrc.registerCpu ?? DEFAULT_AUTH.registerCpu,
    preventSpawning: yaml.preventSpawning ?? screepsrc.preventSpawning ?? DEFAULT_AUTH.preventSpawning
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
