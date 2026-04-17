const crypto = require('crypto')

class Auth {
  constructor (opts) {
    this.opts = opts = opts || {}
    opts.saltlen = opts.saltlen || 32
    opts.iterations = opts.iterations || 25000
    opts.keylen = opts.keylen || 512
    opts.encoding = opts.encoding || 'hex'
    opts.digestAlgorithm = opts.digestAlgorithm || 'sha256' // To get a list of supported hashes use crypto.getHashes()
    opts.passwordValidator = opts.passwordValidator || function (password, cb) { cb(null) }
  }

  encrypt_password (password) {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(this.opts.saltlen, (err, buf) => {
        if (err) return reject(err)
        const salt = buf.toString(this.opts.encoding)
        this.pbkdf2(password, salt, (err, rawhash) => {
          if (err) return reject(err)
          // eslint-disable-next-line new-cap
          const hash = new Buffer.from(rawhash, 'binary').toString(this.opts.encoding)
          resolve({
            pass: hash,
            salt
          })
        })
      })
    })
  }

  verify_password (salt, pass, proposed) {
    return new Promise((resolve, reject) => {
      this.pbkdf2(proposed, salt, (err, rawhash) => {
        if (err) return reject(err)
        // eslint-disable-next-line new-cap
        const hash = new Buffer.from(rawhash, 'binary').toString(this.opts.encoding)
        resolve(hash === pass)
      })
    })
  }

  pbkdf2 (password, salt, callback) {
    // eslint-disable-next-line new-cap
    crypto.pbkdf2(new Buffer.from(password), new Buffer.from(salt), this.opts.iterations, this.opts.keylen, this.opts.digestAlgorithm, callback)
  }
}
module.exports = Auth
