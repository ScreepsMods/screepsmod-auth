# screepsmod-auth

## This adds user/pass auth to the screeps private server

[![NPM info](https://nodei.co/npm/screepsmod-auth.png?downloads=true)](https://npmjs.org/package/screepsmod-auth)

[![Circle CI](https://circleci.com/gh/ScreepsMods/screepsmod-auth.svg?style=shield)](https://circleci.com/gh/ScreepsMods/screepsmod-auth)

# Installation 

1. `npm install screepsmod-auth` in your server folder.
2. Thats it!

# Usage
1. Open the steam screeps client
2. In console, run `setPassword('YourDesiredPassword')`
3. Now you should be able to login via API

# API

### config.auth.authUser(username,password)
Returns a Promise, resovles to either the user object or `false`

# Github Auth
To enable github auth, you need to add a github client id and client secret to your .screepsrc  
(Or ENV vars GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET with other launchers)

Make sure to set the callback url to point to `/api/auth/github/return` on your server. ex: `https://screeps.mydomain.com/api/auth/github/return`  
Get the id and secret from youe Github settings: https://github.com/settings/developers

.screepsrc
```ini
[github]
clientId = <clientId>
clientSecret = <clientSecret>
```