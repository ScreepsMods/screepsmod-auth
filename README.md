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

# Configuration

Registration settings can be provided either via `.screepsrc` or, with [screepsmod-admin-utils](https://github.com/ScreepsMods/screepsmod-admin-utils) installed, `config.yml` (`serverConfig`).

When the same setting exists in both, **`config.yml` takes precedence**, and those settings are live-reloaded without restarting the server.

## Server Password

Set `SERVER_PASSWORD` in the environment to protect the server and disable user registration.

When set:

- New user registration via `/api/register/submit` is rejected
- `config.auth.info.allowRegistration` is `false`
- Authenticated API requests include the password as the `X-Server-Password` header

Clients connecting to the server must send this password (for example via the `X-Server-Password` header) in addition to their auth token.

## Github Auth

Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the environment.

Make sure to set the callback url to point to `/api/auth/github/return` on your server. ex: `https://screeps.mydomain.com/api/auth/github/return`  
Get the id and secret from your Github settings: https://github.com/settings/developers

## GitLab Auth

Set `GITLAB_APP_ID`, `GITLAB_APP_SECRET`, and optionally `GITLAB_URL` (defaults to `https://gitlab.com`) in the environment.

## Initial CPU and Spawn Blocking

You can set the initial CPU that gets placed on a user (Steam users always receive 100), and also
control whether the new user can place spawns. This can be used in combination with a whitelist
or manual approval to control spawning.

`.screepsrc`
```ini
[auth]
registerCpu = 100
preventSpawning = false
```

`config.yml`
```yaml
serverConfig:
  auth:
    registerCpu: 100
    preventSpawning: false
```

# API

### config.auth.config
Resolved mod configuration (merged from `.screepsrc` and `config.yml`). Example: `config.auth.config.registerCpu`.

### config.auth.authUser(username,password)
Returns a Promise, resolves to either the user object or `false`
