# screepsmod-auth

## This adds user/pass auth to the screeps private server

[![License](https://img.shields.io/npm/l/screepsmod-auth.svg)](https://npmjs.com/package/screepsmod-auth)
[![Version](https://img.shields.io/npm/v/screepsmod-auth.svg)](https://npmjs.com/package/screepsmod-auth)
[![Downloads](https://img.shields.io/npm/dw/screepsmod-auth.svg)](https://npmjs.com/package/screepsmod-auth)
[![Test](https://github.com/ScreepsMods/screepsmod-auth/actions/workflows/test.yml/badge.svg)](https://github.com/ScreepsMods/screepsmod-auth/actions/workflows/test.yml)
[![Publish](https://github.com/ScreepsMods/screepsmod-auth/actions/workflows/publish.yml/badge.svg)](https://github.com/ScreepsMods/screepsmod-auth/actions/workflows/publish.yml)

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
2. Run `auth.setPassword('Username', 'YourDesiredPassword')`
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

# Server CLI commands

This mod uses the `auth` namespace to expose commands to the server's CLI:
- `auth.banUser(username, remove = false)` - Soft-ban a user, or delete them when `remove` is true
- `auth.unbanUser(username)` - Clear a ban, including a hard-ban record left after the account was deleted
- `auth.setPassword(username, password)` - Set a user's password for API login
- `auth.createAuthToken(username, description?)` - Creates a full-access API token for a given user
- `auth.listUserTokenRateLimits(username)` - Lists all tokens for a user and active no-ratelimit windows.
- `auth.getTokenRateLimit(username?)` - Shows currently active rate-limit usage per token (optionally scoped to one user).

# Auth token rate limiting

Rate limiting for persistent API tokens is **disabled by default**. When enabled, limits match the [official Screeps auth token docs](https://docs.screeps.com/auth-tokens.html#Rate-Limiting).

Enable via `.screepsrc`:

```ini
[auth]
rateLimitEnabled = true
ratelimit.global = 240,60
ratelimit.GET.api.user.memory = 2880,86400
ratelimit.GET.api.user.code = null
```

Key pattern: `ratelimit.<METHOD>.<path.with.dots>` (e.g. `ratelimit.GET.api.game.market.orders = 120,3600`). Value is `max,window` in seconds; `max` alone overrides only the limit count; `null` disables that bucket (`max: null`).

```yaml
serverConfig:
  auth:
    rateLimitEnabled: true
    rateLimits:
      global: { max: 240, window: 60 }
      "GET /api/user/memory": { max: 2880 }
      "GET /api/user/code": { max: null }
```

# API

### config.auth.config
Resolved mod configuration (merged from `.screepsrc` and `config.yml`). Examples: `config.auth.config.registerCpu`, `config.auth.config.rateLimitEnabled`, `config.auth.config.rateLimits`.

### config.auth.authUser(username,password)
Returns a Promise, resolves to either the user object or `false`
