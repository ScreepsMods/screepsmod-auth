const Auth = require('./auth')
const crypto = require('crypto')
const { httpEndpointKey } = require('./http-endpoint')

/** Keys match the official UI / account token JSON (method + space + path under /api). */
const API_ENDPOINTS = new Set([
  'GET /api/user/name',
  'GET /api/user/money-history',
  'GET /api/user/memory',
  'POST /api/user/memory',
  'GET /api/user/memory-segment',
  'POST /api/user/memory-segment',
  'GET /api/game/market/orders-index',
  'GET /api/game/market/orders',
  'GET /api/game/market/my-orders',
  'GET /api/game/market/stats'
])

/** Official client sends shortened API paths */
const API_ENDPOINT_ALIASES = {
  'GET /api/market/orders-index': 'GET /api/game/market/orders-index',
  'GET /api/market/orders': 'GET /api/game/market/orders',
  'GET /api/market/my-orders': 'GET /api/game/market/my-orders',
  'GET /api/market/stats': 'GET /api/game/market/stats'
}

/**
 * @param {unknown} value
 * @returns {number[]|null} non-empty list = only these segment ids; null = all segments (blank field in UI)
 */
function parseMemorySegments (value) {
  if (value === null || value === undefined) return null
  const s = typeof value === 'string' ? value.trim() : ''
  if (!s) return null
  const parts = s.split(/[\s,]+/).map(x => x.trim()).filter(Boolean)
  const ids = []
  for (const p of parts) {
    const n = parseInt(p, 10)
    if (Number.isNaN(n) || n < 0 || n > 99) {
      throw new Error('invalid memory segment id')
    }
    ids.push(n)
  }
  return ids
}

function tokenAllowsHTTP (req) {
  if (this.full) return true

  const key = httpEndpointKey(req)
  if (!this.endpoints || !this.endpoints[key]) return false

  const ids = this.memorySegments
  if (!ids || !ids.length) return true

  let segment = null
  if (key === 'GET /api/user/memory-segment') {
    segment = parseInt(req.query && req.query.segment, 10)
  } else if (key === 'POST /api/user/memory-segment') {
    segment = parseInt(req.body && req.body.segment, 10)
  } else {
    return true
  }
  if (Number.isNaN(segment)) return false
  return ids.includes(segment)
}

function tokenAllowsWebsocket (channel, user) {
  if (this.full) return true
  if (!user) return false

  if (channel === 'server-message') return true

  const uid = String(user._id)

  if (/^user:.+\/console$/.test(channel)) {
    const websockets = this.websockets || {}
    return !!(websockets.console && channel.startsWith(`user:${uid}/`))
  }
  if (/^user:.+\/memory\//.test(channel)) {
    const endpoints = this.endpoints || {}
    if (!endpoints['GET /api/user/memory']) return false
    return channel.startsWith(`user:${uid}/`)
  }
  if (/^room:/.test(channel) || /^roomMap2:/.test(channel)) {
    const websockets = this.websockets || {}
    return !!websockets.rooms
  }

  return false
}

function withTokenMethods (token) {
  if (!token || typeof token !== 'object') return token
  if (typeof token.allowsHTTP !== 'function') {
    Object.defineProperty(token, 'allowsHTTP', {
      value: tokenAllowsHTTP,
      enumerable: false,
      configurable: true,
      writable: true
    })
  }
  if (typeof token.allowsWebsocket !== 'function') {
    Object.defineProperty(token, 'allowsWebsocket', {
      value: tokenAllowsWebsocket,
      enumerable: false,
      configurable: true,
      writable: true
    })
  }
  return token
}

module.exports = function (config) {
  // Token db setup
  config.common.dbCollections.push('users.tokens')
  config.common.dbIndexes ??= {}
  config.common.dbIndexes['users.tokens'] = { user: 1 }

  if (config.mongo) {
    // MongoDB mode
    const db = config.mongo.client.db()
    db.createCollection('users.tokens', 'user')
  }

  const auth = new Auth()
  config.auth = {
    httpEndpointKey,
    checkPassword (salt, pass, proposed) {
      return auth.verify_password(salt, pass, proposed)
    },
    hashPassword (pass) {
      return auth.encrypt_password(pass)
    },
    authUser (username, password) {
      return config.common.storage.db.users.findOne({ $or: [{ username }, { email: username }] })
        .then(user => {
          if (!user) return false
          if (!user.salt || !user.password) return false
          return auth.verify_password(user.salt, user.password, password)
            .then(valid => valid ? user : false)
        })
    },
    getUser (filter) {
      if (typeof filter === 'string') filter = { _id: filter }
      return config.common.storage.db.users.findOne(filter)
        .then(user => {
          function save () {
            config.common.storage.db.users.update({ _id: user.id }, user)
          }

          user.groups = user.groups || []
          if (user) {
            user.addGroup = function (group) {
              user.groups.push(group)
              save()
            }
            user.remGroup = function (group) {
              const ind = user.groups.indexOf(group)
              if (ind === -1) return
              user.groups.splice(ind, 1)
              save()
            }
            user.hasGroup = function (group) {
              return !!~user.groups.indexOf(group)
            }
          }
          return user
        })
    },
    getUsers (filter) {
      return config.common.storage.db.users.find(filter)
    },
    getGroups (filter) {
      return Promise.resolve([{ name: 'admin' }])
    },
    async getUserTokens (userId) {
      if (!await this.getUser(userId)) throw new Error('No such user')
      const tokens = await config.common.storage.db['users.tokens'].find({ user: userId })
      return tokens.map(withTokenMethods)
    },
    async createToken (userId, opts = {}) {
      const {
        full = true,
        description = null,
        endpoints,
        websockets,
        memorySegments
      } = opts
      if (!await this.getUser(userId)) throw new Error('No such user')
      let memorySegmentIds = null
      if (!full) {
        try {
          memorySegmentIds = parseMemorySegments(memorySegments)
        } catch (e) {
          throw new Error('invalid memorySegments')
        }
      }
      let uuid
      do {
        uuid = crypto.randomUUID()
      } while (await config.common.storage.db['users.tokens'].findOne({ token: uuid }))

      const token = {
        user: userId,
        description,
        full,
        token: uuid,
        noRatelimitUntil: Date.now()
      }
      if (!full) {
        const endpointsOut = {}
        if (endpoints && typeof endpoints === 'object') {
          for (const k of Object.keys(endpoints)) {
            const canonical = API_ENDPOINT_ALIASES[k] || k
            if (API_ENDPOINTS.has(canonical) && endpoints[k]) endpointsOut[canonical] = true
          }
        }
        token.endpoints = endpointsOut
        const ws = websockets && typeof websockets === 'object' ? websockets : {}
        token.websockets = {
          console: !!ws.console,
          rooms: !!ws.rooms
        }
        token.memorySegments = memorySegmentIds && memorySegmentIds.length ? memorySegmentIds : null
      }
      await config.common.storage.db['users.tokens'].insert(token)
      return uuid
    },
    async queryToken (tokenId) {
      if (!tokenId) return null
      const tokenData = await config.common.storage.db['users.tokens'].findOne({ token: tokenId })
      if (!tokenData) return null
      if (!await this.getUser(tokenData.user)) return null
      return withTokenMethods(tokenData)
    },
    async removeTokenLimit (userId, tokenPrefix) {
      const token = (await this.getUserTokens(userId)).find(t => t.token.startsWith(tokenPrefix))
      if (!token) return false
      const noRatelimitUntil = Date.now() + 2 * 60 * 60 * 1000
      await config.common.storage.db['users.tokens'].update(token, { $set: { noRatelimitUntil } })
      return true
    },
    async deleteToken (userId, tokenId) {
      if (!tokenId) return false
      await config.common.storage.db['users.tokens'].remove({ _id: tokenId, user: userId })
      return true
    }
  }
  require('./config')(config)
  if (config.backend) require('./backend')(config, auth)
}
