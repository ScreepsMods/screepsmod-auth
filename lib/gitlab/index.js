const path = require('path')
const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')

const passport = require('passport')
const GitLabStrategy = require('passport-gitlab2').Strategy

const authlib = require(path.join(path.dirname(require.main.filename), '../lib/authlib'))
const auth = require(path.join(path.dirname(require.main.filename), '../lib/game/api/auth'))

const app = new express.Router()

module.exports = function (config) {
  const clientId = process.env.GITLAB_APP_ID || (config.auth.screepsrc.gitlab && config.auth.screepsrc.gitlab.appId) || null
  const clientSecret = process.env.GITLAB_APP_SECRET || (config.auth.screepsrc.gitlab && config.auth.screepsrc.gitlab.appSecret) || null
  const enabled = !!(clientId && clientSecret)
  const gitlabURL = process.env.GITLAB_URL || "https://gitlab.com"

  config.auth.info.gitlab = enabled
  let registered = false

  app.use(cookieParser())

  app.get('/', (req, res, next) => {
    let { token } = req.query
    if (token) res.cookie('auth_token', token)
    if (!registered) {
      registered = true
      let proto = req.get('X-Forwarded-Proto') || req.protocol || 'http'
      let baseUrl = `${proto}://${req.get('host')}`
      passport.use('gitlab', new GitLabStrategy({
        callbackURL: baseUrl + '/api/auth/gitlab/return',
        baseURL: gitlabURL,
        clientID: clientId,
        clientSecret: clientSecret
      }, (accessToken, refreshTokem, profile, done) => done(null, profile.id)))
    }
    setTimeout(next, 100)
  }, passport.authenticate('gitlab'))

  app.get('/return', passport.authenticate('gitlab', { failureRedirect: '/' }), (req, res) => {
    let user = null
    let token = req.cookies.auth_token
    res.clearCookie('auth_token')
    if (token) user = authlib.checkToken(token)
    gitlabFindOrCreateUser(user, req.user)
      .then(user => authlib.genToken(user._id))
      .then(token => {
        let json = JSON.stringify({ username: req.user.username, token })
        res.end(`<html><body><script type="text/javascript">opener.postMessage(JSON.stringify(${json}), '*');window.close();</script></body>`)
      })
      .catch(err => res.end('Failed to auth'))
  })
  // })
  config.auth.router.use('/api/auth/gitlab', app)
  config.auth.router.post('/api/user/unlink-gitlab', auth.tokenAuth, (req, res) => {
    if (!req.user) return
    config.common.storage.db.users.update({ _id: req.user._id }, { $unset: { gitlab: true } })
    res.json({ ok: 1 })
  })

  function gitlabFindOrCreateUser(user, id) {
    let { db, env } = config.common.storage
    if (user) {
      return user.then((user) => {
        return db.users.update({ _id: user._id }, { $set: { gitlab: { id } } })
          .then(() => user)
      })
    }
    return db.users.findOne({ 'gitlab.id': id })
      .then((user) => {
        if (user) return user
        user = {
          gitlab: { id },
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
              modules: { main: '' },
              branch: 'default',
              activeWorld: true,
              activeSim: true
            })
          })
          .then(() => env.set('scrUserMemory:' + user._id, JSON.stringify({})))
          .then(() => user)
      })
  }
}
