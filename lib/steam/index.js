const express = require('express')
const cookieParser = require('cookie-parser')

const passport = require('passport')
const SteamStrategy = require('passport-steam').Strategy

const authlib = require('@screeps/backend/lib/authlib')
const auth = require('@screeps/backend/lib/game/api/auth')

const app = new express.Router()

module.exports = function (config) {
  // Issuer.discover('https://steamcommunity.com/openid/')
  // .then((steamIssuer) => {
  let registered = false

  app.use(cookieParser())

  app.get('/', (req, res, next) => {
    const { token, returnUrl } = req.query
    if (token) res.cookie('auth_token', token)
    if (!registered) {
      registered = true
      const proto = req.get('X-Forwarded-Proto') || req.protocol || 'http'
      const baseUrl = returnUrl || `${proto}://${req.get('host')}`
      passport.use('steam', new SteamStrategy({
        returnURL: baseUrl + '/api/auth/steam/return',
        realm: baseUrl,
        apiKey: process.env.STEAM_KEY,
        passReqToCallback: true,
        profile: false
      }, (req, identifier, profile, done) => {
        const [steamId] = identifier.split('/').slice(-1)
        let user = null
        const token = req.cookies.auth_token
        if (token) user = authlib.checkToken(token, false, req)
        steamFindOrCreateUser(user, steamId)
          .then(result => {
            if (result && result.bannedFields) done(null, false, { message: `banned: ${result.bannedFields.join(', ')}` })
            else done(null, result)
          })
          .catch(err => done(err))
      }))
    }
    setTimeout(next, 100)
  }, passport.authenticate('steam'))

  app.get('/return', (req, res, next) => {
    passport.authenticate('steam', (err, user, info) => {
      if (err) return next(err)
      res.clearCookie('auth_token')
      if (!user) {
        const message = info && info.message
        if (message && message.startsWith('banned:')) return sendBanned(res, message)
        return res.redirect('/')
      }
      authlib.genToken(user._id)
        .then(token => {
          const json = JSON.stringify({ username: user.username, token, steamid: user.steam.id })
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<html><body><script type="text/javascript">opener.postMessage(JSON.stringify(${json}), '*');window.close();</script></body></html>`)
        })
        .catch(next)
    })(req, res, next)
  })
  // })
  config.auth.router.use('/api/auth/steam', app)
  config.auth.router.post('/api/user/unlink-steam', auth.tokenAuth, (req, res) => {
    if (!req.user) return
    config.common.storage.db.users.update({ _id: req.user._id }, { $unset: { steam: true } })
    res.json({ ok: 1 })
  })

  function sendBanned (res, message) {
    const json = JSON.stringify({ error: message })
    res.status(403).type('html').end(`<html><body><p>${message}</p><script type="text/javascript">if (window.opener) opener.postMessage(JSON.stringify(${json}), '*');</script></body></html>`)
  }

  function steamFindOrCreateUser (user, steamId) {
    const { db, env } = config.common.storage
    return config.auth.isBanMarked({ steam: { id: steamId } }).then(fields => {
      if (fields) return { bannedFields: fields }
      if (user) {
        return user.then((user) => {
          return db.users.update({ _id: user._id }, { $set: { steam: { id: steamId } } })
            .then(() => user)
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
          }
          return db.users.insert(user)
            .then(result => {
              user = result
              return db['users.code'].insert({
                user: user._id,
                modules: { main: '' },
                branch: 'default',
                activeWorld: true,
                activeSim: true
              })
            })
            .then(() => env.set('scrUserMemory:' + user._id, JSON.stringify({})))
            .then(() => user)
        })
    })
  }
}
