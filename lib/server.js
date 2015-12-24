var express = require('express')
, http      = require('http')
, log       = require('./log')
, path      = require('path')
, request   = require('request')
, xml       = require('xml2js').parseString

var app     = express()
var stops   = require('../data/stops')

if (typeof(Number.prototype.toRad) === "undefined") {
  Number.prototype.toRad = function() {
    return this * Math.PI / 180
  }
}

var extract_data = function (data, cb) {
  xml(data, function (err, res) {
    if (err) {
      return cb(err, null)
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

function calc_haversine(stop, lat1, lon1) {
  var lat2 = stop.latitude
  var lon2 = stop.longitude

  var φ1 = lat1.toRad()
  var φ2 = lat2.toRad()
  var Δλ = (lon2-lon1).toRad()
  var R = 6371000; // gives d in metres

  var d = Math.acos( Math.sin(φ1)*Math.sin(φ2) + Math.cos(φ1)*Math.cos(φ2) * Math.cos(Δλ) ) * R;


  stop.distance = d

  return stop
}

/* Routes
----------------------------------------------------------------------------- */
module.exports = function (options) {
  log('Starting...')

  app.get('/oracle/:query', function (req, res) {
    request('http://m.atb.no/xmlhttprequest.php?service=routeplannerOracle.getOracleAnswer&question=' + req.params.query, function (err, response, body) {
      if (err) {
        return res.json({error:'Ops, somthing went wrong'})
      }

      if (response.statusCode == 200) {
        body = body.replace(/\n/g, '')
        body = body.replace(/([a-zA-Z])\.([a-zA-Z])/g, '$1.<br>$2')
        res.send(body)
      }
    })
  })

  app.get('/rt/:stopid', function (req, res) {
    if (options.user === '' || options.pass === '') {
      return res.json({error:'Webservice username and password missing'})
    }

    if (/\D/.test(req.params.stopid)) {
      return res.json({error:'Not a valid stopid'})
    }

    var env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://schemas.xmlsoap.org/soap/envelope/"><soap12:Body><getUserRealTimeForecastExByStop xmlns="http://miz.it/infotransit"><auth><user>'+ options.user +'</user><password>'+ options.pass +'</password></auth><handShakeUser><user>tmn</user><token>tmn-best</token><response>Success</response></handShakeUser><busStopId>' + req.params.stopid + '</busStopId><nForecast>20</nForecast></getUserRealTimeForecastExByStop></soap12:Body></soap12:Envelope>'

    var post_request = {
      host: 'st.atb.no',
      path: '/New/InfoTransit/userservices.asmx',
      port: 80,
      method: 'POST',
      headers: {
        'Cookie': 'cookie',
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': Buffer.byteLength(env)
      }
    }

    var request = http.request(post_request, function (r) {
      var buffer = ''

      r.on('data', function (data) {
        buffer = buffer + data
      })

      r.on('end', function (data) {
        extract_data(buffer, function (err, data) {
          if (err) {
            res.json({error: 'Something went wrong'})
          }

          res.json(data)
        })
      })
    })

    request.write(env)
    request.end()
  })

  app.get('/stops', function (req, res) {
    res.json(stops.stops)
  })

  app.get('/stops/nearest/:lat/:lon', function (req, res) {
    var lat = parseFloat(req.params.lat)
    var lon = parseFloat(req.params.lon)

    var new_stops = stops.stops.map(function (stop) {
      return calc_haversine(stop, lat, lon)
    })

    new_stops.sort(function (a, b) {
      if (a.distance > b.distance) {
        return 1
      }
      else if (a.distance < b.distance) {
        return -1
      }

      return 0
    })

    res.json(new_stops)
  })

  return app
}

process.on('uncaughtException', function (err) {
  log(err.stack)
})
