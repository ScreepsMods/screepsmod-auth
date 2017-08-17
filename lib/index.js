const Auth = require('./auth')
const ini = require('ini')

module.exports = function(config){
  let screepsrc = {}
  try {
    screepsrc = ini.parse(fs.readFileSync('./.screepsrc', {encoding: 'utf8'}))
  } catch (e) { }
  let auth = new Auth()
  config.auth = {
    screepsrc,
    checkPassword(salt,pass,proposed){
      return auth.verify_password(salt,pass,proposed)
    },
    hashPassword(pass){
      return auth.encrypt_password(pass)
    },
    authUser(username,password){
      return config.common.storage.db.users.findOne({ $or: [{username: username}, {email: username}] })
        .then(user => {
          if (!user) return false
          if (!user.salt || !user.password) return false
          return auth.verify_password(user.salt, user.password, password)
            .then(valid => valid ? user : false)
        })
    },
    getUser(filter){
      if(typeof filter == 'string') filter = { _id: id }
      return config.common.storage.db.users.findOne(filter)
        .then(user=>{
          function save(){
            config.common.storage.db.users.update({ _id: user.id },user)
          }
          
          user.groups = user.groups || []
          if(user){
            user.addGroup = function(group){
              user.groups.push(group)
              save()
            }
            user.remGroup = function(group){
              let ind = user.groups.indexOf(group)
              if(ind == -1) return
              user.groups.splice(ind,1)
              save()
            }
            user.hasGroup = function(group){
              return !!~user.groups.indexOf(group)
            }
          }
          return user
        })
    },
    getUsers(filter){
      return config.common.storage.db.users.find(filter)
    },
    getGroups(filter){
      return Promise.resolve([{ name: 'admin' }])
    }
  }
  if(config.engine) require('./engine')(config,auth)
  if(config.backend) require('./backend')(config,auth)
}