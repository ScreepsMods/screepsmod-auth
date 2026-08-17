const backendUtils = require('@screeps/backend/lib/utils')

function toIsoOrNull (value) {
  return value ? new Date(value).toISOString() : null
}

module.exports = function (config) {
  const auth = {
    createUser: backendUtils.withHelp([
      'createUser(username, opts?) - Create a new user account. `opts` can be used to set additional user fields (ex: `email`). No authentication method is configured by default, so this command should typically be followed by `setPassword()`.',
      function createUser (username, opts) {
        if (!username) return 'Missing username'
        const { registerCpu } = config.auth.config
        const usernameLower = username.toLowerCase()
        const user = {
          cpu: registerCpu,
          cpuAvailable: 0,
          registeredDate: new Date(),
          money: 0,
          gcl: 0,
          powerExperimentations: 30,
          ...(opts ?? {}),
          username,
          usernameLower
        }
        const modules = user.modules
        delete user.modules
        let query = { usernameLower }
        if (user.email) query = { $or: [query, { email: user.email }] }
        return config.common.storage.db.users.findOne(query)
          .then((existingUser) => {
            if (existingUser) return 'User exists'
            return config.common.storage.db.users.insert(user)
              .then(result => config.common.storage.db['users.code'].insert({
                user: result._id,
                modules: modules || { main: '' },
                branch: 'default',
                activeWorld: true,
                activeSim: true
              }))
              .then(() => config.common.storage.env.set('scrUserMemory:' + user._id, JSON.stringify({})))
              .then(() => 'Created new user')
              .catch(err => ({ error: err.stack || err.message || err }))
          })
          .catch(err => ({ error: err.stack || err.message || err }))
      }
    ]),
    setPassword: backendUtils.withHelp([
      'setPassword(username, password) - Set a user password for API login.',
      function setPassword (username, password) {
        if (!username) return 'Missing username'
        if (!password) return 'Missing password'
        return config.auth.hashPassword(password)
          .then(({ pass, salt }) => {
            return config.common.storage.db.users.update({ username }, { $set: { password: pass, salt } })
          })
      }
    ]),
    createAuthToken: backendUtils.withHelp([
      'createAuthToken(username, description?) - Create a full auth token for the given user',
      function createAuthToken (username, description) {
        if (!username) {
          return 'Missing username'
        }
        return config.common.storage.db.users.findOne({ username })
          .then(user => {
            if (!user) return 'No such user'
            const opts = { full: true }
            if (description) opts.description = description
            return config.auth.createToken(user._id, opts)
          })
      }
    ]),
    getTokenRateLimit: backendUtils.withHelp([
      'getTokenRateLimit(username?) - Show currently active rate-limit usage per token (optionally for one user).',
      async function getTokenRateLimit (username) {
        const limits = config.auth.getRateLimits()
        if (!limits) return []

        try {
          const now = Date.now()
          let userId
          if (username) {
            const user = await config.common.storage.db.users.findOne({ username })
            if (!user) return 'No such user'
            userId = user._id
          }
          const activity = await config.auth.getRateLimitActivity(userId)
          return activity.map(({ token, buckets }) => {
            const noRatelimitUntil = token.noRatelimitUntil || 0
            const noRatelimitRemainingMs = Math.max(0, noRatelimitUntil - now)
            return {
              tokenId: token._id,
              token: token.token,
              user: token.user,
              ...(token.description ? { description: token.description } : {}),
              ...(noRatelimitRemainingMs > 0
                ? {
                    noRatelimit: {
                      remainingMs: noRatelimitRemainingMs,
                      until: noRatelimitUntil,
                      untilISO: toIsoOrNull(noRatelimitUntil)
                    }
                  }
                : {}),
              rateLimits: buckets.map(bucket => {
                const resetAtISO = toIsoOrNull(bucket.resetAt)
                const isLimited = bucket.remaining === 0
                return {
                  bucket: bucket.key,
                  count: bucket.count,
                  limit: bucket.limit,
                  remaining: bucket.remaining,
                  window: bucket.window,
                  resetAt: bucket.resetAt,
                  resetAtISO,
                  ...(isLimited
                    ? {
                        retryAfterMs: bucket.retryAfterMs,
                        limitedUntil: bucket.resetAt,
                        limitedUntilISO: resetAtISO
                      }
                    : {})
                }
              })
            }
          })
        } catch (err) {
          return {
            error: err.message
          }
        }
      }
    ]),
    listUserTokenRateLimits: backendUtils.withHelp([
      'listUserTokenRateLimits(username) - List current no-ratelimit status for all user tokens.',
      async function listUserTokenRateLimits (username) {
        if (!username) return 'Missing username'
        const user = await config.common.storage.db.users.findOne({ username })
        if (!user) return 'No such user'
        const tokens = await config.auth.getUserTokens(user._id)
        const now = Date.now()
        return tokens.map(token => {
          const noRatelimitUntil = token.noRatelimitUntil || 0
          const noRatelimitRemainingMs = Math.max(0, noRatelimitUntil - now)
          return {
            tokenId: token._id,
            token: token.token,
            ...(token.description ? { description: token.description } : {}),
            ...(noRatelimitRemainingMs > 0
              ? {
                  noRatelimit: {
                    remainingMs: noRatelimitRemainingMs,
                    until: noRatelimitUntil,
                    untilISO: toIsoOrNull(noRatelimitUntil)
                  }
                }
              : {})
          }
        })
      }
    ])
  }

  auth._help = backendUtils.generateCliHelp('auth.', auth)

  config.cli.on('cliSandbox', sandbox => Object.assign(sandbox, { auth }))
}
