const { serverRequire } = require('./require')
const backendUtils = serverRequire('@screeps/backend/lib/utils')

module.exports = function (config) {
  const { db, env } = config.common.storage

  // Improved user removal function.
  // The vanilla server only removes the user and some of its associated data,
  // leaving behind orphan intents that would crash the global intent processor.
  config.auth.removeUser = async function (_id) {
    await Promise.all([
      db['market.orders'].removeWhere({ user: _id }),
      db['users.intents'].removeWhere({ user: _id })
    ])
    await backendUtils.respawnUser(_id)
    await Promise.all([
      db.users.removeWhere({ _id }),
      db['users.code'].removeWhere({ user: _id }),
      db['users.console'].removeWhere({ user: _id }),
      db['users.messages'].removeWhere({ $or: [{ user: _id }, { respondent: _id }] }),
      db['users.money'].removeWhere({ user: _id }),
      db['users.notifications'].removeWhere({ user: _id }),
      db['users.power_creeps'].removeWhere({ user: _id }),
      db['users.resources'].removeWhere({ user: _id }),
      db.transactions.removeWhere({ $or: [{ user: _id }, { sender: _id }, { recipient: _id }] }),
      env.del(env.keys.MEMORY + _id),
      env.del(env.keys.MEMORY_SEGMENTS + _id),
      env.del(env.keys.PUBLIC_MEMORY_SEGMENTS + _id),
      env.del(env.keys.USER_ONLINE + _id),
      env.del(`scrScriptCachedData:${_id}`)
    ])
  }
}
