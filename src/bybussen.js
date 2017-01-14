const express = require('express')
, haversine = require('haversine')
, http = require('http')
, https = require('https')
, logger  = require('./logger')
, stops = require('./data/stops').stops
, xml = require('xml2js').parseString

const app = express()

// TODO: next version shouldnt need this transform
const format_date = (date_string) => {
  let date = date_string.substring(0, 10)
  let time = date_string.substring(11, 16)

  return `${ date.substring(8,10) }.${ date.substring(5,7) }.${ date.substring(0,4) } ${ time }`
}

const extract_siri = (data, cb) => {
  xml(data, (err, res) => {
    if (err) {
      return cb(err)
    }

    const departures = res['s:Envelope']['s:Body'][0]['GetStopMonitoringResponse'][0]['Answer'][0]['StopMonitoringDelivery'][0]['MonitoredStopVisit']

    cb(null, {
      name: departures[0].MonitoredVehicleJourney[0].MonitoredCall[0].StopPointName[0],
      locationId: departures[0].MonitoredVehicleJourney[0].MonitoredCall[0].StopPointRef[0],
      next: departures.slice(0, 20).map(d => {
        const departure = d.MonitoredVehicleJourney[0]
        return {
          l: departure.LineRef[0],
          t: departure.Monitored[0] === 'true' ? format_date(departure.MonitoredCall[0].ExpectedDepartureTime[0]) : format_date(departure.MonitoredCall[0].AimedDepartureTime[0]),
          ts: format_date(departure.MonitoredCall[0].AimedDepartureTime[0]),
          rt: departure.Monitored[0] === 'true' ? 1 : 0,
          d: departure.DestinationName[0]
        }
      })
    })
  })
}

const extract_data =  (data, cb) => {
  xml(data, (err, res) => {
    if (err) {
      return cb(err)
    }

    const data_body = res['soap:Envelope']['soap:Body'][0]

    if (!data_body || !data_body.getUserRealTimeForecastExByStopResponse) {
      cb({ error: 'No data' })
      return
    }

    const data_response = data_body.getUserRealTimeForecastExByStopResponse[0]
    const data_result = data_response.getUserRealTimeForecastExByStopResult[0]

    if (data_result === 'WsAuthenticationError') {
      cb({ error: 'Authentication error' })
      return
    }

    const data = JSON.parse(data_result)
    const info = data.InfoNodo[0]

    cb(null, {
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
    })
  })
}


//+-----------------------------------------------------------------------------
//
// Routes
//
//------------------------------------------------------------------------------
const Bybussen = (options) => {
  logger('Starting...')

  app.get('/oracle/:query', (req, res) => {
    https.get('https://m.atb.no/xmlhttprequest.php?service=routeplannerOracle.getOracleAnswer&question=' + req.params.query, (response) => {
      const statusCode = response.statusCode
      const contentType = response.headers['content-type']

      let body = ''

      if (statusCode !== 200) {
        const error = new Error(`Request Failed.\nStatus Code: ${statusCode}`)

        logger(error)
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
    if (/\D/.test(req.params.stopid)) {
      return res.json({ error:'Not a valid stopid' })
    }

    const env = `<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:r="http://www.siri.org.uk/siri">
   <s:Header/>
   <s:Body>
      <r:GetStopMonitoring>
         <ServiceRequestInfo>
            <r:RequestorRef>io.tmn</r:RequestorRef>
         </ServiceRequestInfo>
         <Request version="1.4">
            <r:PreviewInterval>P0DT5H0M0.000S</r:PreviewInterval>
            <r:MonitoringRef>${ req.params.stopid }</r:MonitoringRef>
         </Request>
      </r:GetStopMonitoring>
   </s:Body>
</s:Envelope>`;

    const post_request = {
      host: 'st.atb.no',
      path: '/SMWS/SMService.svc',
      port: 80,
      method: 'POST',
      headers: {
        'SOAPAction': 'GetStopMonitoring',
        'Cookie': 'cookie',
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': Buffer.byteLength(env)
      }
    }

    const request = http.request(post_request, r => {
      let buffer = ''

      r.on('data', (data) => buffer += data)
      r.on('end', () => {
        extract_siri(buffer, (err, data) => {
          if (err) {
            res.json(err)
          }

          res.json(data)
        })
      })
    })

    request.write(env)
    request.end()
  })

  app.get('/rt_old/:stopid', (req, res) => {
    if (options.user === '' || options.pass === '') {
      return res.json({ error: 'Webservice username and password missing' })
    }

    if (/\D/.test(req.params.stopid)) {
      return res.json({ error:'Not a valid stopid' })
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

      r.on('data', (data) => buffer += data)
      r.on('end', () => {
        extract_data(buffer, (err, data) => {
          if (err) {
            logger(JSON.stringify(err))
            res.json(err)
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

  app.get('/stops/nearest/:lat/:lon/:limit?', (req, res) => {
    const new_stops = stops.map((stop) => {
      return Object.assign({}, stop, {
        distance: Math.floor(haversine(
          { latitude: req.params.lat, longitude: req.params.lon },
          { latitude: stop.latitude, longitude: stop.longitude}
        ))
      })
    })

    new_stops.sort((a, b) => a.distance - b.distance)

    res.json(new_stops.slice(0, req.params.limit || 20))
  })

  return app
}

process.on('uncaughtException', (err) => {
  logger(err.stack)
})

module.exports = Bybussen
