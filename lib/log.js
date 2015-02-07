var fs = require('fs')

var openLog = function (logfile) {
  return fs.createWriteStream(logfile, {
    flags: 'a', encoding: 'utf8', mode: 0644
  })
}

var log_stream = openLog('app.log')

log_stream.on('close', function () {
  process.exit(0)
}).end()

module.exports = function (msg) {
  log_stream.write(msg + '\n')
}
