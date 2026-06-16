const Auth = require('./auth')

module.exports = function (config) {
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
    }
  }
  require('./config')(config)
  if (config.backend) require('./backend')(config, auth)
}
