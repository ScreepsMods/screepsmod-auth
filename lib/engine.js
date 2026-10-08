module.exports = function (config) {
  config.engine.on('init', type => {
    if (type !== 'main') return
    const { db } = config.common.storage
    config.engine.on('mainLoopStage', async (stage, users) => {
      if (stage !== 'addUsersToQueue' || !Array.isArray(users)) return
      const suspended = []
      // Remove banned users from the array so they don't get queued
      for (let i = users.length - 1; i >= 0; i--) {
        const user = users[i]
        if (!user || !user.banned) continue
        users.splice(i, 1)
        suspended.push(user)
      }
      if (!suspended.length) return
      // Re-suspend banned users just in case they did something that reactivated them
      try {
        await Promise.all(suspended.map(user => db.users.update({ _id: user._id }, { $set: { active: 0 } })))
      } catch (err) {
        console.error('Failed to re-suspend banned users:', err)
      }
    })
  })
}
