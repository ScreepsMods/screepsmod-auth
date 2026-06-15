const Auth = require('./auth')
const crypto = require('crypto')

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
      return tokens
    },
    async createToken (userId, opts = {}) {
      const {
        full = true,
        description = null,
      } = opts
      if (!await this.getUser(userId)) throw new Error('No such user')
      if (!full) throw new Error('Only full tokens supported')
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
      await config.common.storage.db['users.tokens'].insert(token)
      return uuid
    },
    async queryToken (tokenId) {
      if (!tokenId) return null
      const tokenData = await config.common.storage.db['users.tokens'].findOne({ token: tokenId })
      if (!tokenData) return null
      if (!await this.getUser(tokenData.user)) return null
      return tokenData
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
