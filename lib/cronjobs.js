module.exports = function (config) {
  config.cronjobs.authUpdates = [10, () => authUpdates(config)]
}

function authUpdates (config) {
  const { common: { storage: { db }}, auth: { screepsrc: { auth: { preventSpawning, registerCpu = 100} = {}} = {}}} = config
  let tgt = new Date(Date.now() - 15000)
  let $set = {
    cpu: registerCpu,
    blocked: !!preventSpawning,
    authTouched: true
  }
  db.users.update({ $or: [{ registeredDate: { $gt: tgt }}, { authTouched: { $ne: true } }] }, { $set })
}
