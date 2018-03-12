module.exports = function (config) {
  let functions = {
    setPassword (username, password) {
      if (!username || !password) {
        return 'Usage: setPassword(username, password)'
      }
      return config.auth.hashPassword(password)
        .then(({ pass, salt }) => {
          return config.common.storage.db.users.update({ username }, { $set: { password: pass, salt } })
        })
    }
  }
  config.cli.on('cliSandbox', sandbox => Object.assign(sandbox, functions))
}
