const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const passport = require('passport')
const SteamStrategy = require('passport-steam').Strategy

const authlib = require(path.join(path.dirname(require.main.filename), '../lib/authlib'))
const auth = require(path.join(path.dirname(require.main.filename), '../lib/game/api/auth'))

const app = new express.Router()

module.exports = function (config) {
  // Issuer.discover('https://steamcommunity.com/openid/')
    // .then((steamIssuer) => {
  let registered = false

  app.use(cookieParser())

  app.get('/', (req, res, next) => {
    let { token, returnUrl } = req.query
    if (token) res.cookie('auth_token', token)
    if (!registered) {
      registered = true
      let proto = req.get('X-Forwarded-Proto') || req.protocol || 'http'
      let baseUrl = returnUrl || `${proto}://${req.get('host')}`
      passport.use('steam', new SteamStrategy({
        returnURL: baseUrl + '/api/auth/steam/return',
        realm: baseUrl,
        apiKey: process.env.STEAM_KEY,
        passReqToCallback: true,
        profile: false
      }, (req, identifier, profile, done) => {
        let [ steamId ] = identifier.split('/').slice(-1)
        let user = null
        let token = req.cookies.auth_token
        if (token) user = authlib.checkToken(token)
        steamFindOrCreateUser(user, steamId)
          .then(user => done(null, user))
          .catch(err => done(err))
      }))
    }
    setTimeout(next, 100)
  }, passport.authenticate('steam'))

  app.get('/return', passport.authenticate('steam', { failureRedirect: '/' }), (req, res) => {
    res.clearCookie('auth_token')
    authlib.genToken(req.user._id)
      .then(token => {
        let json = JSON.stringify({ username: req.user.username, token, steamid: req.user.steam.id })
        res.writeHead(200, { 'Content-Type':'text/html' }).end(`<html><body><script type="text/javascript">opener.postMessage(JSON.stringify(${json}), '*');window.close();</script></body></html>`)
      })
  })
    // })
  config.auth.router.use('/api/auth/steam', app)
  config.auth.router.post('/api/user/unlink-steam', auth.tokenAuth, (req, res) => {
    if (!req.user) return
    config.common.storage.db.users.update({ _id: req.user._id }, { $unset: { steam: true }})
    res.json({ ok: 1 })
  })

  function steamFindOrCreateUser(user, steamId) {
    let { db, env } = config.common.storage
    if (user) {
      return user.then((user)=>{
        return db.users.update({ _id: user._id }, { $set: { steam: { id: steamId }}})
          .then(()=>user)
      })
    }
    return db.users.findOne({ 'steam.id': steamId })
      .then((user) => {
        if (user) return user
        user = {
          steam: { id: steamId },
          cpu: 100,
          cpuAvailable: 0,
          registeredDate: new Date(),
          money: 0,
          gcl: 0
        };
        return db.users.insert(user)
          .then(result => {
            user = result;
            return db['users.code'].insert({
              user: user._id,
              modules: {main: ''},
              branch: 'default',
              activeWorld: true,
              activeSim: true
            })
          })
          .then(() => env.set('scrUserMemory:'+user._id, JSON.stringify({})))
          .then(() => user)
      })
  }
}
