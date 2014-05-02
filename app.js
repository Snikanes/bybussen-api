var express = require('express');

var http    = require('http');
var path    = require('path');
var fs = require('fs');

var config  = require('./config')()
, logStream = openLog(config.logfile);

var app     = express();

function openLog(logfile) {
  return fs.createWriteStream(logfile, {
    flags: 'a', encoding: 'utf8', mode: 0644
  });
}

function log(msg) {
  logStream.write(msg + '\n');
}

log('Starting...');

// all environments
app.set('port', process.env.PORT || config.port);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// app.use(express.favicon('public/images/fav.ico'));
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

process.on('uncaughtException', function (err) {
  log(err.stack);
});

process.once('SIGTERM', function () {
  log('Stopping...');

  app.on('close', function () {
    log('Stopped.');

    logStream.on('close', function () {
      process.exit(0);
    }).end();
  });
});

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

var bb_ctrl = require('./controllers/bybussen')(app);

http.createServer(app).listen(app.get('port'), function(){
  log('Express server listening on port ' + app.get('port'));
});
