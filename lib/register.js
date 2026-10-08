const express = require('express')
const bodyParser = require('body-parser')
const app = new express.Router()

module.exports = function (config) {
  const storage = config.common.storage
  config.auth.router.use('/api/register', app)
  app.get('/check-username', (req, res) => {
    storage.db.users.findOne({ username: req.query.username }).then(user => {
      if (user) { res.json({ error: 'User Exists' }) } else { res.json({ ok: 1 }) }
    })
  })
  app.get('/check-email', (req, res) => {
    config.auth.isBanMarked({ email: req.query.email })
      .then(fields => {
        if (fields) {
          res.json({ error: `banned: ${fields.join(', ')}` })
          return
        }
        return storage.db.users.findOne({ email: req.query.email }).then(user => {
          if (user) res.json({ error: 'User Exists' })
          else res.json({ ok: 1 })
        })
      })
      .catch(err => res.json({ error: err.message || err }))
  })
  app.post('/submit', bodyParser.json(), (req, res) => {
    const { preventSpawning, registerCpu } = config.auth.config
    const body = req.body
    let user = {
      username: body.username,
      usernameLower: body.username.toLowerCase(),
      email: body.email,
      cpu: registerCpu,
      cpuAvailable: 0,
      registeredDate: new Date(),
      blocked: !!preventSpawning,
      money: 0,
      gcl: 0
    }
    if (process.env.SERVER_PASSWORD) {
      return res.json({
        error: 'Registration is automatically disabled. A server password has been set.'
      })
    }
    let query = { username: body.username }
    if (body.email) query = { $or: [query, { email: body.email }] }
    return config.auth.isBanMarked({ email: body.email })
      .then(fields => {
        if (fields) throw new Error(`banned: ${fields.join(', ')}`)
      })
      .then(() => storage.db.users.findOne(query))
      .then((user) => {
        if (user) throw new Error('User already exists')
        return config.auth.hashPassword(body.password)
      })
      .then(obj => {
        user.salt = obj.salt
        user.password = obj.pass
      })
      .then(() => storage.db.users.insert(user))
      .then(result => {
        user = result
        return storage.db['users.code'].insert({
          user: user._id,
          modules: body.modules || { main: '' },
          branch: 'default',
          activeWorld: true,
          activeSim: true
        })
      })
      .then(() => storage.env.set('scrUserMemory:' + user._id, JSON.stringify({})))
      .then(() => res.json({ ok: 1 }))
      .catch((err) => {
        const message = err && err.message
        const error = message && message.startsWith('banned:') ? message : (err.stack || message || err)
        res.json({ error })
      })
  })
}
