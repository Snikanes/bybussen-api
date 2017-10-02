const http = require('http')
const bybussen = require('./bybussen')

http.createServer(bybussen()).listen(3000)