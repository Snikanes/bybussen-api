const http = require('http')
const bybussen = require('./bybussen')

const port = normalizePort(process.env.PORT || '3000')

const app = bybussen()
app.set('port', port);


const server = http.createServer(app)

server.listen(port)

function normalizePort(val) {
    var port = parseInt(val, 10);

    if (isNaN(port)) {
        // named pipe
        return val;
    }

    if (port >= 0) {
        // port number
        return port;
    }

    return false;
}