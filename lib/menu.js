module.exports = [
  {
    name: 'auth',
    version: 1
  },
  {
    name: 'screepsmod-auth',
    version: 1,
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
]