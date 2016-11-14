const Auth = require('./auth')

module.exports = function engine(config,auth){
  let storage = config.common.storage
  config.engine.on('playerSandbox', function(sandbox) {
    sandbox.setPassword = function(password) {
      config.auth.hashPassword(password)
      .then((obj)=>{
        return storage.db.users.update({ _id: sandbox.module.user },{ $set: {
          password: obj.pass,
          salt: obj.salt
        }})
      })
      .then((res)=>sandbox.console.log('Password Set',res))
      .catch(err=>sandbox.console.error(err))
    }
  })
}