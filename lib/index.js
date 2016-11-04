const Auth = require('./auth')

module.exports = function(config){
  let auth = new Auth()
  config.auth = {
    authUser
  }
  if(config.engine) require('./engine')(config,auth)
  if(config.backend) require('./backend')(config,auth)
}

function authUser(username,password){
  return storage.db.users.findOne({ $or: [{username: username}, {email: username}] })
    .then(user => {
      if (!user) return done(null, false)
      return auth.verify_password(user.salt, user.password, password)
        .then(valid => valid ? user : false)
    })
}