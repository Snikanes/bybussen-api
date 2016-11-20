const fs = require('fs')

const log_stream = fs.createWriteStream('app.log', {
  flags: 'a', encoding: 'utf8', mode: 0644
})

module.exports = function (msg) {
  log_stream.write(`[${Date.now()}]: ${msg}\n`)
}
