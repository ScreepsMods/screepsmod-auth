module.exports = config => {
  config.backend.features = config.backend.features || []
  const authTypes = ['password']
  if (config.auth.info.steam) authTypes.push('steam')
  if (config.auth.info.github) authTypes.push('github')
  
  config.backend.features.push(...[
    {
      name: 'auth',
      version: 1
    },
    {
      name: 'screepsmod-auth',
      version: require('../package.json').version,
      authTypes,
      menuData: [
        {
          section: 2,
          start: 1,
          item: {
            label: 'Change Password',
            href: '#!/account/password',
          }
        }
      ]
    }
  ])
}