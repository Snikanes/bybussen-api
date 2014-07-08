var express = require('express')
, fs = require('fs')
, http  = require('http')
, log_stream = openLog('app.log')
, path    = require('path')
, request = require('request')
, xml     = require('xml2js').parseString

var app     = express()
var stops   = require('../data/stops')

var extract_data = function (data, cb) {
  xml(data, function (err, res) {
    if (err) {
      cb(err, null)
    }

    var result    = {}
    , data_body   = res['soap:Envelope']['soap:Body'][0]

    if (data_body === undefined || data_body.getUserRealTimeForecastExByStopResponse === undefined) {
      cb({message:'no data', name:'', lat:'', lon:'', next:[]})
      return
    }

    var data_response = data_body.getUserRealTimeForecastExByStopResponse[0]
    , data_result     = data_response.getUserRealTimeForecastExByStopResult[0]

    if (data_result == 'WsAuthenticationError') {
      cb({error: 'WsAuthenticationError'})
      return
    }

    var data          = JSON.parse(data_result)
    , info            = data.InfoNodo[0]

    result.name       = info.descrNodo
    result.lat        = info.coordLon
    result.lon        = info.coordLat

    result.next       = []

    data.Orari.forEach(function (departure) {
      result.next.push({
        l:   departure.codAzLinea,
        t:   departure.orario,
        ts:  departure.orarioSched,
        rt:  departure.statoPrevisione == 'Prev' ? 1 : 0,
        d:   departure.capDest
      })
    })

    cb(null, result)
  })
}


/* Routes
----------------------------------------------------------------------------- */

module.exports = function (options) {
  log('Starting...')

  app.get('/oracle/:query', function (req, res) {
    request('http://m.atb.no/xmlhttprequest.php?service=routeplannerOracle.getOracleAnswer&question=' + req.params.query, function (error, response, body) {
      if (!error && response.statusCode == 200) {
        body = body.replace(/\n/g, '')
        body = body.replace(/([a-zA-Z])\.([a-zA-Z])/g, '$1.<br>$2')
        res.send(body)
      }
    })
  })

  app.get('/rt/:stopid', function (req, res){
    if (options.user === '' || options.pass === '') {
      res.json({error:'Webservice username and password missing in config file'})
      return
    }

    if (/\D/.test(req.params.stopid)) {
      res.json({error:'Not a valid stopid'})
      return
    }

    var env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://schemas.xmlsoap.org/soap/envelope/"><soap12:Body><getUserRealTimeForecastExByStop xmlns="http://miz.it/infotransit"><auth><user>'+ options.user +'</user><password>'+ options.pass +'</password></auth><busStopId>' + req.params.stopid + '</busStopId><nForecast>20</nForecast></getUserRealTimeForecastExByStop></soap12:Body></soap12:Envelope>'

    var post_request = {
      host: 'st.atb.no',
      path: '/InfoTransit/userservices.asmx',
      port: 80,
      method: 'POST',
      headers: {
        'Cookie': 'cookie',
        'Content-Type': 'text/xml;charset="utf-8"',
        'SOAPAction': 'http://miz.it/infotransit/getUserRealTimeForecastExByStop',
        'Content-Length': Buffer.byteLength(env)
      }
    }

    var request = http.request( post_request, function (r) {
      var buffer = ''

      r.on( "data", function( data ) {
        buffer = buffer + data
      })

      r.on( "end", function( data ) {
        extract_data(buffer, function (err, data) {
          if (err) {
            res.json({error: 'Something went wrong'})
          }

          res.json(data)
        })
      })
    })

    request.write( env )
    request.end()
  })


  app.get('/stops', function (req, res) {
    res.json(stops.stops)
  })

  return app;
}


function openLog (logfile) {
  return fs.createWriteStream(logfile, {
    flags: 'a', encoding: 'utf8', mode: 0644
  })
}

function log (msg) {
  log_stream.write(msg + '\n')
}


process.on('uncaughtException', function (err) {
  log(err.stack)
})

process.once('SIGTERM', function () {
  log('Stopping...')

  app.on('close', function () {
    log('Stopped.')

    log_stream.on('close', function () {
      process.exit(0)
    }).end()
  })
})
