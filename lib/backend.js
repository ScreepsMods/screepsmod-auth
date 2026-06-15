const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const BasicStrategy = require('passport-http').BasicStrategy
const authlib = require('@screeps/backend/lib/authlib')
const authroute = require('@screeps/backend/lib/game/api/auth')

BasicStrategy.prototype._challenge = function () { return '' }

let storage, config

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
    app.use(config.auth.router)
  })
  setupRouter(config)
}

function setupRouter (config) {
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
    const token = req.get('x-token')
    if (token) {
      authlib.checkToken(token, true)
        .then((user) => {
          req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
          return authlib.genToken(user._id)
        })
        .then((freshToken) => {
          res.set('X-Token', freshToken)
          res.set('X-Username', freshToken)
          next()
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
    const { type, description } = req.body
    if (description && typeof description !== 'string') return res.status(400).send({ ok: 0, error: 'invalid description' })
    const full = type !== 'selected'
    try {
      const token = await config.auth.createToken(req.user._id, {
        full,
        description,
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
