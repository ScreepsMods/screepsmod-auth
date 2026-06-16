const backendUtils = require('@screeps/backend/lib/utils')

module.exports = function (config) {
  const auth = {
    setPassword: backendUtils.withHelp([
      'setPassword(username, password) - Set a user password for API login.',
      function setPassword (username, password) {
        if (!username || !password) {
          return 'Usage: auth.setPassword(username, password)'
        }
        return config.auth.hashPassword(password)
          .then(({ pass, salt }) => {
            return config.common.storage.db.users.update({ username }, { $set: { password: pass, salt } })
          })
      }
    ])
  }

  auth._help = backendUtils.generateCliHelp('auth.', auth)

  config.cli.on('cliSandbox', sandbox => Object.assign(sandbox, { auth }))
}
