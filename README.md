# screepsmod-auth

## This adds user/pass auth to the screeps private server

[![NPM info](https://nodei.co/npm/screepsmod-auth.png?downloads=true)](https://npmjs.org/package/screepsmod-auth)

[![Circle CI](https://circleci.com/gh/ScreepsMods/screepsmod-auth.svg?style=shield)](https://circleci.com/gh/ScreepsMods/screepsmod-auth)

# Installation 

1. `npm install screepsmod-auth` in your server folder.
2. Thats it!

# Usage

## Web Form Method
1. Open the steam client at least once (Required to create initial account)
2. Goto http://yourServerHostOrIP:21025/authmod/password/
3. Enter your desired password
4. Click Signin with steam
5. Your password should be set and you be able to login via API

## Server CLI method
1. Open the screeps server CLI (`npx screeps cli` or via Steam Server UI)
2. Run `setPassword('Username', 'YourDesiredPassword')`
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

# Initial CPU and Spawn Blocking

You can set the initial CPU that gets placed on a user (Steam users always receive 100), and also
control whether the new user can place spawns. This can be used in combination with a whitelist
or manual approval to control spawning.

```ini
[auth]
cpu = 100
preventSpawning = false
```
