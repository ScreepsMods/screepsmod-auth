const Auth = require('./auth')

module.exports = function(config){
  let auth = new Auth()
  config.auth = {}
  if(config.engine) require('./engine')(config,auth)
  if(config.backend) require('./backend')(config,auth)
}