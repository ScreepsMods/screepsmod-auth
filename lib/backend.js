const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const passport = require('passport')
const TokenStrategy = require('passport-token').Strategy
const LocalStrategy = require('passport-local').Strategy
const BasicStrategy = require('passport-http').BasicStrategy
const authlib = require('@screeps/backend/lib/authlib')
const authroute = require('@screeps/backend/lib/game/api/auth')

/** Out-of-band storage for tokens when accessing websockets */
const socketApiTokenByUserId = new Map()

/**
 * FIFO queue for auth tokens.
 * Ensures concurrent connections from the same user with different tokens each get their own token back.
 */
const apiTokenPlainReuseQueues = new Map()

function wrapSocketModule (config, modFactory) {
  return function scopedSocketFactory (listen, emit) {
    const socket = modFactory(listen, emit)
    if (!socket.onSubscribe) return socket
    const inner = socket.onSubscribe.bind(socket)
    socket.onSubscribe = function onSubscribeScoped (channel, user, conn) {
      const token = user && socketApiTokenByUserId.get(String(user._id))
      if (token && !token.allowsWebsocket(channel, user)) {
        return false
      }
      return inner(channel, user, conn)
    }
    return socket
  }
}

BasicStrategy.prototype._challenge = function () { return '' }

/** passport-token requires x-username and x-token; official API accepts either header or ?_token= alone. */
function normalizeTokenCredentials (req, res, next) {
  const token = req.get('x-token') || (req.query && req.query._token)
  if (!token) return next()
  if (!req.get('x-token')) req.headers['x-token'] = token
  if (!req.get('x-username')) req.headers['x-username'] = token
  next()
}

let storage, config
let tokenAuthImpl, originalTokenAuth

/** Stable reference so routes registered after mod load always call the current implementation. */
function tokenAuthProxy (request, response, next) {
  return tokenAuthImpl(request, response, next)
}

module.exports = function (cconfig, authIns) {
  require('./cli')(cconfig)
  require('./cronjobs')(cconfig)
  config = cconfig
  storage = config.common.storage
  config.auth.info = {
    name: 'screepsmod-auth',
    version: require('../package.json').version,
    allowRegistration: !process.env.SERVER_PASSWORD,
    steam: true
  }
  config.auth.router = new express.Router()
  config.backend.on('expressPreConfig', function (app) {
    process.on('SIGTERM', () => process.exit())
    app.use(normalizeTokenCredentials)
    app.use(config.auth.router)
  })
  config.backend.on('expressPostConfig', function () {
    passport.use('token', new TokenStrategy({ passReqToCallback: true }, (req, _email, token, done) => {
      authlib.checkToken(token, false, req)
        .then(user => done(null, user))
        .catch((error) => (error === false ? done(null, false) : done(error)))
    }))
  })
  setupRouter(config)
}

function setupRouter (config) {
  const origGen = authlib.genToken.bind(authlib)
  authlib.genToken = function genTokenWrapped (id) {
    const k = String(id)
    const q = apiTokenPlainReuseQueues.get(k)
    if (q && q.length > 0) {
      const plain = q.shift()
      if (!q.length) apiTokenPlainReuseQueues.delete(k)
      return Promise.resolve(plain)
    }
    return origGen(id)
  }

  const oldCheckToken = authlib.checkToken.bind(authlib)
  authlib.checkToken = async function (tokenStr, noConsume, req) {
    let legacyUser = false
    try {
      legacyUser = await oldCheckToken(tokenStr, noConsume)
    } catch (err) {
      // legacy session token miss
    }
    if (legacyUser) {
      const id = String(legacyUser._id)
      if (req) delete req.apiToken
      else {
        socketApiTokenByUserId.delete(id)
        apiTokenPlainReuseQueues.delete(id)
      }
      return legacyUser
    }

    const token = await config.auth.queryToken(tokenStr)
    if (token) {
      const user = await config.auth.getUser(token.user)
      if (!user) return false
      const id = String(token.user)
      if (req) req.apiToken = token
      else {
        socketApiTokenByUserId.set(id, token)
        const q = apiTokenPlainReuseQueues.get(id) || []
        q.push(tokenStr)
        apiTokenPlainReuseQueues.set(id, q)
      }
      return user
    }

    return false
  }

  config.backend.socketModules.user = wrapSocketModule(config, require('@screeps/backend/lib/game/socket/user'))
  config.backend.socketModules.rooms = wrapSocketModule(config, require('@screeps/backend/lib/game/socket/rooms'))
  config.backend.socketModules.map = wrapSocketModule(config, require('@screeps/backend/lib/game/socket/map'))

  originalTokenAuth = authroute.tokenAuth
  authroute.tokenAuth = tokenAuthProxy
  tokenAuthImpl = async function tokenAuth (request, response, next) {
    const token = request.get('x-token') || (request.query && request.query._token)
    if (token) {
      try {
        const tokenData = await config.auth.queryToken(token)
        if (tokenData) {
          const user = await config.auth.getUser(tokenData.user)
          if (!user) {
            response.status(401).send({ error: 'unauthorized' })
            return
          }
          request.user = user
          request.apiToken = tokenData
          if (!tokenData.allowsHTTP(request)) {
            response.status(403).send({ error: 'forbidden' })
            return
          }
          return next()
        }
      } catch (err) {
        return next(err)
      }
    }
    return originalTokenAuth(request, response, next)
  }
  // Patch upstream /api/auth/me to use the same token auth path as other endpoints.
  const authRouterStack = authroute.router && authroute.router.stack
  if (Array.isArray(authRouterStack)) {
    for (const layer of authRouterStack) {
      const route = layer && layer.route
      if (!route || route.path !== '/me' || !route.methods || !route.methods.get) continue
      const middleware = route.stack && route.stack[0]
      if (middleware && typeof middleware.handle === 'function') {
        middleware.handle = tokenAuthProxy
      }
      break
    }
  }

  passport.use(new LocalStrategy({
    usernameField: 'email',
    session: false
  }, authUser))
  passport.use(new BasicStrategy({
    session: false
  }, authUser))
  passport.serializeUser((u, d) => d(null, u))
  passport.deserializeUser((u, d) => d(null, u))
  const router = config.auth.router
  router.use(passport.initialize())
  router.use((req, res, next) => {
    const tokenStr = req.get('x-token')
    if (tokenStr) {
      authlib.checkToken(tokenStr, true, req)
        .then((user) => {
          if (!user) {
            next()
            return
          }
          req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
          const token = req.apiToken
          if (token) {
            if (!token.allowsHTTP(req)) {
              res.status(403).json({ error: 'forbidden' })
              return
            }
            next()
            return
          }
          return authlib.genToken(user._id).then((freshToken) => {
            res.set('X-Token', freshToken)
            res.set('X-Username', freshToken)
            next()
          })
        })
        .catch(() => next())
    } else {
      next()
    }
  })
  router.post('/api/auth/signin', bodyParse, passport.authenticate(['local', 'basic']), (req, res) => {
    if (!req.user) return res.status(401).end('Unauthorized')
    authlib.genToken(req.user._id)
      .then(token => {
        req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
        res.json({ ok: 1, token })
      })
      .catch(err => res.status(500).end(err.stack || err.message))
  })
  router.get('/api/user/name', authroute.tokenAuth, async (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })

    const user = await storage.db.users.findOne({ _id: req.user._id })
    if (!user || !user.username) {
      res.status(404).send({ error: 'User not found' })
      return
    }

    res.json({ ok: 1, username: user.username })
  })
  router.use('/api/user/code', (req, res, next) => {
    if (req.method !== 'POST') return next()
    if (!req.headers.authorization) return next()
    passport.authenticate('basic')(req, res, () => {
      if (!req.user) return next()
      authlib.genToken(req.user._id)
        .then(token => {
          req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
          req.headers['x-token'] = token
          req.headers['x-username'] = token
          next()
        }).catch(() => next())
    })
  })
  router.post('/api/user/password', authroute.tokenAuth, bodyParse, (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })
    const { oldPassword, password } = req.body
    if (!password) return res.json({ ok: 0, error: 'Password required' })
    let chain = Promise.resolve(req.user)
    if (req.user.password && req.user.salt) {
      chain = chain.then(() => config.auth.authUser(req.user.username, '' + oldPassword))
    }
    chain.then(user => {
      if (!user) return res.status(401).send({ error: 'Unauthorized' })
      return config.auth.hashPassword(password)
    })
      .then((obj) => {
        return storage.db.users.update({ _id: req.user._id }, {
          $set: {
            password: obj.pass,
            salt: obj.salt
          }
        })
      })
      .then(() => res.json({ ok: 1 }))
      .catch(err => res.json({ ok: 0, error: err.message }))
  })
  router.get('/api/user/auth-token', authroute.tokenAuth, bodyParse, async (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })
    const tokens = await config.auth.getUserTokens(req.user._id)
    res.json({
      ok: 1,
      tokens: tokens.map(token => formatTokenForClient(token, { maskToken: true }))
    })
  })
  router.post('/api/user/auth-token', authroute.tokenAuth, bodyParse, async (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })
    const { type, description, endpoints, websockets, memorySegments } = req.body
    if (description && typeof description !== 'string') return res.status(400).send({ ok: 0, error: 'invalid description' })
    const full = type !== 'selected'
    try {
      const token = await config.auth.createToken(req.user._id, {
        full,
        description,
        endpoints,
        websockets,
        memorySegments
      })
      res.json({ ok: 1, token })
    } catch (e) {
      res.status(400).send({ ok: 0, error: e.message })
    }
  })
  router.post('/api/user/delete-auth-token', authroute.tokenAuth, bodyParse, async (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })
    const { tokenId } = req.body
    try {
      await config.auth.deleteToken(req.user._id, tokenId)
      res.json({ ok: 1 })
    } catch (e) {
      res.json({ error: String(e) })
    }
  })
  router.post('/api/user/noratelimit', authroute.tokenAuth, bodyParse, async (req, res) => {
    if (!req.user) return res.status(401).send({ error: 'Unauthorized' })
    const { token } = req.body
    try {
      if (!await config.auth.removeTokenLimit(req.user._id, token)) {
        res.status(404).send({ ok: 0 })
        return
      }
      res.json({ ok: 1 })
    } catch (e) {
      res.status(400).send({ ok: 0, error: e.message })
    }
  })
  function formatTokenForClient (tokenData, { maskToken = false } = {}) {
    const info = {
      _id: tokenData._id,
      token: maskToken
        ? tokenData.token.substring(0, 8) + '-****-****-****-************'
        : tokenData.token,
      full: !!tokenData.full,
      description: tokenData.description ?? null
    }
    if (!tokenData.full) {
      const endpoints = tokenData.endpoints || {}
      info.endpoints = Object.keys(endpoints)
        .filter(k => endpoints[k])
        .map(k => k.replace('/api/game/', '/api/'))
      const ws = tokenData.websockets || {}
      info.websockets = ['console', 'rooms'].filter(k => ws[k])
      const segments = tokenData.memorySegments
      if (segments && segments.length) {
        info.memorySegments = segments.map(String)
      }
    }
    if (tokenData.noRatelimitUntil > Date.now()) {
      info.noRatelimitUntil = tokenData.noRatelimitUntil
    }
    return info
  }

  async function handleQueryToken (token, res) {
    if (!token) {
      res.json({ error: 'token not found' })
      return
    }
    const tokenData = await config.auth.queryToken(token)
    if (!tokenData) {
      res.json({ error: 'token not found' })
      return
    }
    res.json({ ok: 1, token: formatTokenForClient(tokenData) })
  }
  router.get('/api/auth/query-token', (req, res) => handleQueryToken(req.query.token, res))
  router.post('/api/auth/query-token', bodyParse, (req, res) => handleQueryToken(req.body.token, res))
  router.use('/authmod', express.static(path.join(__dirname, '/../static')))
  router.get('/api/authmod', (req, res) => res.json(Object.assign({ ok: 1 }, config.auth.info)))
  require('./register')(config)
  require('./steam')(config)
  require('./github')(config)
  require('./gitlab')(config)
  require('./menu.js')(config)
}

function bodyParse (req, res, next) {
  bodyParser.json()(req, res, next)
}

function authUser (username, password, done) {
  config.auth.authUser(username, password).then((res) => done(null, res)).catch(done)
}
