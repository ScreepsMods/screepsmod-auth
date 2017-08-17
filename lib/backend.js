const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const passport = require('passport')
const LocalStrategy = require('passport-local').Strategy
const BasicStrategy = require('passport-http').BasicStrategy
const basicAuth = require('basic-auth')
const authlib = require(path.join(path.dirname(require.main.filename), '../lib/authlib'))

BasicStrategy.prototype._challenge = function(){ return '' }

let storage,auth,config

module.exports = function (cconfig, authIns) {
  config = cconfig
  auth = authIns
  storage = config.common.storage
  config.auth.info = {
    name: "screepsmod-auth", 
    version: require('../package.json').version, 
    allowRegistration: !process.env.SERVER_PASSWORD,
    steam: true
  }
  config.auth.router = new express.Router()
  config.backend.on('expressPreConfig',function (app) {
    process.on('SIGTERM', ()=>process.exit())
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
  let router = config.auth.router
  router.use(passport.initialize())
  router.use((req,res,next)=>{
    let token = req.get('x-token')
    if(token)
      authlib.checkToken(token,true)
        .then(()=>{
          req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
          next()
        })
        .catch(err=>next())
    else
      next()
  })
  router.post('/api/auth/signin', bodyParse, passport.authenticate(['local', 'basic']), (req, res) => {
    if (!req.user) return res.status(401).end('Unauthorized')
    authlib.genToken(req.user._id)
      .then(token => {
        req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
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
          req.headers['x-server-password'] = process.env.SERVER_PASSWORD || ''
          req.headers['x-token'] = token
          req.headers['x-username'] = token
          next()
        }).catch(err => next())
    })
  })
  router.get('/authmod', (req, res) => res.redirect('api/authmod'))
  router.get('/api/authmod', (req, res) => res.json(Object.assign({ ok: 1 },config.auth.info)))
  require('./register')(config)
  require('./steam')(config)
}

function bodyParse (req, res, next) {
  bodyParser.json()(req, res, next)
}

function authUser (username, password, done) {
  config.auth.authUser(username,password).then((res)=>done(null,res)).catch(done)
}
