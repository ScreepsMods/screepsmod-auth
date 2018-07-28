# screepsmod-auth

## This adds user/pass auth to the screeps private server

[![NPM info](https://nodei.co/npm/screepsmod-auth.png?downloads=true)](https://npmjs.org/package/screepsmod-auth)

[![Circle CI](https://circleci.com/gh/ScreepsMods/screepsmod-auth.svg?style=shield)](https://circleci.com/gh/ScreepsMods/screepsmod-auth)

# Installation 

1a. If you are using the in-game private server from Steam, then subscribe the Steam workshop  https://steamcommunity.com/sharedfiles/filedetails/?id=800390576

1b. If you are using the screeps standalone private server, run `npm install screepsmod-auth` folder, and modify mods.json and add a new line in your mods list pointing to this mod like so:

```
  "mods": [
    "node_modules\\screepsmod-auth\\index.js"
  ],
```

2. Relaunch your screeps private server.

3. Follow the 
[CLI steps](#screeps-server-command-line-interface-cli-method) below to setup your username and password 

# Setup

## Screeps Server Command Line Interface (CLI) method
1. Connect to your screeps private server once to create your account.  You don't need to set an email.  Just username and password is important.

2. Run the server's command line interface (CLI) either in Steam, or if your running a standalone server as described here https://github.com/screeps/screeps#command-line-interface-cli

3. In server's CLI, run 

```
setPassword('yourUserName', 'yourPassword')
```
Note: that setPassword says to pass in the email.  Don't do this.  Instead give it your username.

4. If you get back an error that setPassword isn't defined, then its likely your mod isn't installed.  See the mod.json set above to fix it.  If setPassword returns {} then that's also a failure as your user name wasn't found.  If setPassword returns { modified: 1 }, then it succceded.

5. Now you should be able to login 

## Web Form Method 
1. Connect to your screeps private server once to create your account. 
2. Send a POST call to http://yourServerHostOrIP:21025/authmod/password/
3. Enter your desired password
4. Click Signin with steam
5. Your password should be set and you be able to login via API

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
