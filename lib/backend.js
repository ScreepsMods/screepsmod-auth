const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const BasicStrategy = require('passport-http').BasicStrategy
const basicAuth = require('basic-auth')
const authlib = require(path.join(path.dirname(require.main.filename), '../lib/authlib'))

let storage,auth

module.exports = function (config, authIns) {
  auth = authIns
  storage = config.common.storage
  config.auth.router = new express.Router()
  let onExpressPreConfig = config.backend.onExpressPreConfig
  config.backend.onExpressPreConfig = function (app) {
    app.use(config.auth.router)
    return onExpressPreConfig(app)
  }
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
  let router = config.auth.router
  router.use(passport.initialize())
  router.post('/api/auth/signin', bodyParse, passport.authenticate(['local', 'basic']), (req, res) => {
    if (!req.user) return res.status(401).end('Unauthorized')
    authlib.genToken(req.user._id)
      .then(token => {
        res.json({ ok: 1, token})
      })
      .catch(err => res.status(500).end(err.stack || err.message))
  })
  router.use('/api/user/code', (req, res, next) => {
    if (req.method != 'POST') return next()
    if (!req.headers.authorization) return next()
    passport.authenticate('basic')(req, res, () => {
      if (!req.user) return next()
      authlib.genToken(req.user._id)
        .then(token => {
          req.headers['x-token'] = token
          req.headers['x-username'] = token
          next()
        }).catch(err => next())
    })
  })
}

function bodyParse (req, res, next) {
  bodyParser.json()(req, res, next)
}

function authUser (username, password, done) {
  config.auth.authUser(username,password).then((res)=>done(null,user)).catch(done)
}
