(function () {
  const app = angular.module('screepsmod-auth', []) // jshint-ignore-line no-undef
  class Password {
    constructor ($window, API) {
      this.token = ''
      $window.addEventListener('message', (e) => {
        let data = JSON.parse(e.data)
        API.setToken(data.token)
        this.status = 'Setting Password...'
        API.password(this.oldpass, this.newpass)
          .then((res) => {
            if (res.ok) {
              this.status = 'Password set!'
            } else {
              this.status = `Password set attempt failed! ${res.error}`
            }
          })
      })
    }
    steam ($event) {
      if (this.newpass) {
        if (this.newpass !== this.newpass2) {
          this.status = 'Password mismatch!'
        } else if (this.newpass.length < 4) {
          this.status = 'Password too short!'
        } else {
          this.status = 'Steam Auth...'
          return
        }
      }
      $event.preventDefault()
    }
  }
  class API {
    constructor ($http) {
      this.$http = $http
    }
    req (method, url, data = {}) {
      let params = {}
      if (method === 'GET') {
        params = data
        data = null
      }
      let headers = {
        'X-Token': this.token,
        'X-Username': this.token
      }
      return this.$http({ method, url, params, data, headers })
        .then(res => res.data)
        .catch(res => res.data)
    }
    setToken (token) {
      this.token = token
    }
    password (oldPassword, password) {
      return this.req('POST', '/api/user/password', { oldPassword, password })
    }
  }
  app.controller('password', Password)
  app.service('API', API)
})()
