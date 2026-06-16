module.exports = function (config) {
  config.cronjobs.authUpdates = [10, () => authUpdates(config)]
}

function authUpdates (config) {
  const { common: { storage: { db } } } = config
  const { preventSpawning, registerCpu } = config.auth.config
  const tgt = new Date(Date.now() - 15000)
  const $set = {
    cpu: registerCpu,
    blocked: !!preventSpawning,
    authTouched: true
  }
  db.users.update({ $or: [{ registeredDate: { $gt: tgt } }, { authTouched: { $ne: true } }] }, { $set })
}
