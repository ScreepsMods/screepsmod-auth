module.exports = function(config){
  if(config.backend || config.engine)
    require('./lib')(config)
}