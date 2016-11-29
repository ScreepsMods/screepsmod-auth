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

# Notes:
This is NOT compatible with screepsmod-apitoken, having both installed may result in issues.
