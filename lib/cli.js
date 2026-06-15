const backendUtils = require('@screeps/backend/lib/utils')

module.exports = function (config) {
  const auth = {
    setPassword: backendUtils.withHelp([
      'setPassword(username, password) - Set a user password for API login.',
      function setPassword (username, password) {
        if (!username) return 'Missing username'
        if (!password) return 'Missing password'
        return config.auth.hashPassword(password)
          .then(({ pass, salt }) => {
            return config.common.storage.db.users.update({ username }, { $set: { password: pass, salt } })
          })
      }
    ]),
    createAuthToken: backendUtils.withHelp([
      'createAuthToken(username, description?) - Create a full auth token for the given user',
      function createAuthToken (username, description) {
        if (!username) {
          return 'Missing username'
        }
        return config.common.storage.db.users.findOne({ username })
          .then(user => {
            if (!user) return 'No such user'
            const opts = { full: true }
            if (description) opts.description = description
            return config.auth.createToken(user._id, opts)
          })
      }
    ])
  }

  auth._help = backendUtils.generateCliHelp('auth.', auth)

  config.cli.on('cliSandbox', sandbox => Object.assign(sandbox, { auth }))
}
