const express = require('express')
, http = require('http')
, https = require('https')
, xml = require('xml2js').parseString

const log  = require('./log')
const app = express()
const stops = require('../data/stops').stops

const extract_data =  (data, cb) => {
  xml(data, (err, res) => {
    if (err) {
      return cb(err, null)
    }

    const data_body = res['soap:Envelope']['soap:Body'][0]

    if (data_body === undefined || data_body.getUserRealTimeForecastExByStopResponse === undefined) {
      cb({
        message: 'no data',
        name: '',
        lat: '',
        lon: '',
        next:[]
      })

      return
    }

    const data_response = data_body.getUserRealTimeForecastExByStopResponse[0]
    const data_result = data_response.getUserRealTimeForecastExByStopResult[0]

    if (data_result === 'WsAuthenticationError') {
      cb({ error: 'WsAuthenticationError' })
      return
    }

    const data = JSON.parse(data_result)
    const info = data.InfoNodo[0]

    const result = {
      name: info.descrNodo,
      lat: info.coordLon,
      lon: info.coordLat,
      next: data.Orari.map((departure) => ({
        l:   departure.codAzLinea,
        t:   departure.orario,
        ts:  departure.orarioSched,
        rt:  departure.statoPrevisione == 'Prev' ? 1 : 0,
        d:   departure.capDest
      }))
    }

    cb(null, result)
  })
}


//+-----------------------------------------------------------------------------
//
// Haversine algorithm
//
//------------------------------------------------------------------------------
const to_rad = (num) => num * Math.PI / 180

const haversine = (start, end, options = {}) => {
  const units = {
    metres: 6371000,
    km: 6371,
    miles: 3960
  }

  const R = options.unit in units
        ? units[options.unit]
        : units.metres

  const φ1 = to_rad(start.latitude)
  , φ2 = to_rad(end.latitude)
  , λ1 = to_rad(start.longitude)
  , λ2 = to_rad(end.longitude)
  , Δλ = λ1 - λ2

  const distance = Math.acos(Math.sin(φ1) * Math.sin(φ2) + Math.cos(φ1) * Math.cos(φ2) * Math.cos(Δλ)) * R

  return distance
}

//+-----------------------------------------------------------------------------
//
// Routes
//
//------------------------------------------------------------------------------
module.exports = (options) => {
  log('Starting...')

  app.get('/oracle/:query', (req, res) => {
    https.get('https://m.atb.no/xmlhttprequest.php?service=routeplannerOracle.getOracleAnswer&question=' + req.params.query, (response) => {
      const statusCode = response.statusCode
      const contentType = response.headers['content-type']

      let body = '', error

      if (statusCode !== 200) {
        error = new Error(`Request Failed.\nStatus Code: ${statusCode}`)
      }

      if (error) {
        log(error)
        response.resume()
        return
      }

      response.on('data', chunk => body += chunk)
      response.on('end', () => {
        body = body.replace(/\n/g, '')
        body = body.replace(/([a-zA-Z])\.([a-zA-Z])/g, '$1.<br>$2')

        res.send(body)
      })
    })
  })

  app.get('/rt/:stopid', (req, res) => {
    if (options.user === '' || options.pass === '') {
      return res.json({ error: 'Webservice username and password missing' })
    }

    if (/\D/.test(req.params.stopid)) {
      return res.json({error:'Not a valid stopid'})
    }

    const env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://schemas.xmlsoap.org/soap/envelope/"><soap12:Body><getUserRealTimeForecastExByStop xmlns="http://miz.it/infotransit"><auth><user>'+ options.user +'</user><password>'+ options.pass +'</password></auth><handShakeUser><user>tmn</user><token>tmn-best</token><response>Success</response></handShakeUser><busStopId>' + req.params.stopid + '</busStopId><nForecast>20</nForecast></getUserRealTimeForecastExByStop></soap12:Body></soap12:Envelope>'

    const post_request = {
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

    const request = http.request(post_request, (r) => {
      let buffer = ''

      r.on('data', (data) => {
        buffer = buffer + data
      })

      r.on('end', (data) => {
        extract_data(buffer, (err, data) => {
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

  app.get('/stops', (req, res) => {
    res.json(stops)
  })

  app.get('/stops/nearest/:lat/:lon', (req, res) => {
    const lat = parseFloat(req.params.lat)
    const lon = parseFloat(req.params.lon)

    const new_stops = stops.map((stop) => {
      return calc_haversine(stop, lat, lon)
    })

    new_stops.sort((a, b) => {
      if (a.distance > b.distance) {
        return 1
      }
      else if (a.distance < b.distance) {
        return -1
      }

      return 0
    })

    res.json(new_stops.slice(0, 20))
  })

  return app
}

process.on('uncaughtException', (err) => {
  log(err.stack)
})
