module.exports = function (config) {
  const { db, env } = config.common.storage
  Object.assign(env.keys, {
    BANNED_IDENTITIES: 'bannedIdentities'
  })

  const FIELDS = ['email', 'steam', 'github', 'gitlab']

  function identityFrom (doc) {
    const ident = { email: '', steam: '', github: '', gitlab: '' }
    if (!doc || typeof doc !== 'object') return ident
    if (typeof doc.email === 'string') ident.email = doc.email.trim().toLowerCase()
    for (const key of ['steam', 'github', 'gitlab']) {
      if ((doc[key]?.id ?? '') !== '') ident[key] = String(doc[key].id)
    }
    return ident
  }

  function identityMatches (ident, entry) {
    const got = identityFrom(entry)
    const fields = []
    for (const key of FIELDS) {
      if (ident[key] && ident[key] === got[key]) fields.push(key)
    }
    return fields
  }

  async function getBannedIdentities () {
    const raw = await env.get(env.keys.BANNED_IDENTITIES)
    if (!raw) return []
    try {
      const list = JSON.parse(raw)
      return Array.isArray(list) ? list : []
    } catch {}
    return []
  }

  function saveBannedIdentities (list) {
    return env.set(env.keys.BANNED_IDENTITIES, JSON.stringify(list))
  }

  config.auth.markAsBanned = async function (user) {
    const ident = identityFrom(user)
    if (!FIELDS.some(key => ident[key])) return false
    const list = await getBannedIdentities()
    const row = { username: user.username, date: new Date().toISOString() }
    if (ident.email) row.email = ident.email
    if (ident.steam) row.steam = { id: ident.steam }
    if (ident.github) row.github = { id: ident.github }
    if (ident.gitlab) row.gitlab = { id: ident.gitlab }
    const idx = list.findIndex(entry => identityMatches(ident, entry).length)
    if (idx >= 0) {
      const prev = list[idx]
      list[idx] = {
        ...prev,
        ...row,
        email: row.email || prev.email,
        steam: row.steam || prev.steam,
        github: row.github || prev.github,
        gitlab: row.gitlab || prev.gitlab
      }
    } else {
      list.push(row)
    }
    await saveBannedIdentities(list)
    return true
  }

  config.auth.unmarkAsBanned = async function ({ username, email, steam, github, gitlab }) {
    const usernameLower = typeof username === 'string' ? username.toLowerCase() : ''
    const ident = identityFrom({ email, steam, github, gitlab })
    const list = await getBannedIdentities()
    const next = list.filter(entry => {
      if (usernameLower && String(entry.username || '').toLowerCase() === usernameLower) return false
      return !identityMatches(ident, entry).length
    })
    if (next.length === list.length) return false
    await saveBannedIdentities(next)
    return true
  }

  config.auth.isBanMarked = async function ({ email, steam, github, gitlab }) {
    const ident = identityFrom({ email, steam, github, gitlab })
    if (!FIELDS.some(key => ident[key])) return false
    const list = await getBannedIdentities()
    const fields = new Set()
    for (const entry of list) {
      for (const key of identityMatches(ident, entry)) fields.add(key)
    }
    return fields.size ? [...fields] : false
  }

  config.auth.banUser = async function (username, remove = false) {
    const user = await db.users.findOne({ usernameLower: username.toLowerCase() })
    if (!user) {
      return `Can't find user "${username}"`
    }

    const _id = user._id
    const marked = await config.auth.markAsBanned(user)
    const via = marked
      ? '; blocked re-registration'
      : '; no identity on the account to block'
    if (!remove) {
      if (user.banned) {
        return `User "${user.username}" ${_id} is already banned${via}`
      }
      await db.users.update({ _id }, { $set: { active: 0, banned: true, blocked: true } })
      console.log(`Suspended user "${user.username}" ${_id}${via}`)
      return `Suspended user "${user.username}" ${_id}${via}`
    } else {
      await config.auth.removeUser(_id)
      console.log(`Removed user "${user.username}" ${_id}${via}`)
      return `Removed user "${user.username}" ${_id}${via}`
    }
  }

  config.auth.unbanUser = async function (username) {
    const user = await db.users.findOne({ usernameLower: username.toLowerCase() })
    if (!user) {
      if (await config.auth.unmarkAsBanned({ username })) {
        console.log(`Cleared hard-ban record for "${username}"`)
        return `Cleared hard-ban record for "${username}"`
      }
      return `Can't find user "${username}"`
    } else if (!user.banned) {
      return `User "${user.username}" ${user._id} is not banned.`
    }

    await db.users.update({ _id: user._id }, { $set: { active: 10000, banned: false, blocked: false } })
    await config.auth.unmarkAsBanned(user)
    console.log(`Unbanned user "${user.username}" ${user._id}`)
    return `Unbanned user "${user.username}" ${user._id}`
  }

  config.auth.banUser._help = 'banUser(username, remove = false) Ban the specified user from the server.\n' +
    '\tPassing `false` will suspend their CPU usage, `true` will delete their data entirely.'
  config.auth.unbanUser._help = 'unbanUser(username) Unban the specified user from the server.'
}
