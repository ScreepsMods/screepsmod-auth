const express = require('express')
const cookieParser = require('cookie-parser')

const passport = require('passport')
const GitLabStrategy = require('passport-gitlab2').Strategy

const authlib = require('@screeps/backend/lib/authlib')
const auth = require('@screeps/backend/lib/game/api/auth')

module.exports = function (config) {
  const clientId = process.env.GITLAB_APP_ID || null
  const clientSecret = process.env.GITLAB_APP_SECRET || null
  const enabled = !!(clientId && clientSecret)
  const gitlabURL = process.env.GITLAB_URL || 'https://gitlab.com'

  config.auth.info.gitlab = enabled

  config.auth.router.post('/api/user/unlink-gitlab', auth.tokenAuth, (req, res) => {
    if (!req.user) return
    config.common.storage.db.users.update({ _id: req.user._id }, { $unset: { gitlab: true } })
    res.json({ ok: 1 })
  })

  if (!enabled) {
    const disabled = express.Router()
    disabled.use((req, res) => {
      res.status(503).type('txt').send('GitLab OAuth is not configured.')
    })
    config.auth.router.use('/api/auth/gitlab', disabled)
    return
  }

  const app = new express.Router()
  let registered = false

  app.use(cookieParser())

  app.get('/', (req, res, next) => {
    const { token, returnUrl } = req.query
    if (token) res.cookie('auth_token', token)
    if (!registered) {
      registered = true
      const proto = req.get('X-Forwarded-Proto') || req.protocol || 'http'
      const baseUrl = returnUrl || `${proto}://${req.get('host')}`
      passport.use('gitlab', new GitLabStrategy({
        callbackURL: baseUrl + '/api/auth/gitlab/return',
        baseURL: gitlabURL,
        clientID: clientId,
        clientSecret
      }, (accessToken, refreshTokem, profile, done) => done(null, profile.id)))
    }
    setTimeout(next, 100)
  }, passport.authenticate('gitlab'))

  app.get('/return', passport.authenticate('gitlab', { failureRedirect: '/' }), (req, res) => {
    let user = null
    const token = req.cookies.auth_token
    res.clearCookie('auth_token')
    if (token) user = authlib.checkToken(token, false, req)
    gitlabFindOrCreateUser(user, req.user)
      .then(user => authlib.genToken(user._id))
      .then(token => {
        const json = JSON.stringify({ username: req.user.username, token })
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(`<html><body><script type="text/javascript">opener.postMessage(JSON.stringify(${json}), '*');window.close();</script></body></html>`)
      })
      .catch(err => {
        res.end('Failed to auth')
        console.log('failed to auth', err)
      })
  })
  // })
  config.auth.router.use('/api/auth/gitlab', app)

  function gitlabFindOrCreateUser (user, id) {
    const { db, env } = config.common.storage
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
          gcl: 0,
          powerExperimentations: 30
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
  }
}
