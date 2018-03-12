module.exports = function(config) {
  let functions = {
    async setPassword (username, password) {
      if (!username || !password) {
        return 'Usage: setPassword(username, password)'
      }
      let { pass, salt } = await  config.auth.hashPassword(password)
      return config.common.storage.db.users.update({ username }, { $set: { password: pass, salt } })
    }
  }
  config.cli.on('cliSandbox', sandbox => Object.assign(sandbox, functions))
}
