
module.exports = function (config) {
  config.common.dbCollections.push('users.tokens')
  let { storage: { db } } = config.common
  return {
    getTokens (user) {
      user = user._id || user
      return db['users.tokens'].find({ user })
    },
    addToken (user, data) {
      data.user = user._id || user
      return db['users.tokens'].insert(data)
    },
    delToken (user, _id) {
      user = user._id || user
      return db['users.tokens'].remove({ user, _id })
    },
    allowed (req, token) {
      return token.endpoints.includes(`${req.method} ${req.url}`)
    }
  }
}
