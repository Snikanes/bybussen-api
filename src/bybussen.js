const express = require('express')
    , haversine = require('haversine')
    , http = require('http')
    , https = require('https')
    , logger = require('./logger')
    , stops = require('./data/stops').stops

const extractSiri = require('./siriExtract')
const app = express()

const getStopRequestEnvelope = stopid => {
    return `<?xml version="1.0" encoding="utf-8"?>
                <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:r="http://www.siri.org.uk/siri">
                   <s:Header/>
                   <s:Body>
                      <r:GetStopMonitoring>
                         <ServiceRequestInfo>
                            <r:RequestorRef>io.tmn</r:RequestorRef>
                         </ServiceRequestInfo>
                         <Request version="1.4">
                            <r:PreviewInterval>P0DT10H0M0.000S</r:PreviewInterval>
                            <r:MonitoringRef>${ stopid }</r:MonitoringRef>
                         </Request>
                      </r:GetStopMonitoring>
                   </s:Body>
                </s:Envelope>`
}

//+-----------------------------------------------------------------------------
//
// Routes
//
//------------------------------------------------------------------------------
const Bybussen = () => {
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

    app.get('/', (req, res) => {
        return res.json({ message: 'THis is index'})
    })

    app.get('/rt/:stopid', (req, res) => {
        if (/\D/.test(req.params.stopid)) {
            return res.json({ error: 'Not a valid stopid' })
        }

        const limit = req.query.limit || 20

        const env = getStopRequestEnvelope(req.params.stopid)

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
                extractSiri(buffer, (err, data)=> {
                    if (err) {
                        res.json(err)
                    }

                    res.json(data)
                }, limit)
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
                    { latitude: stop.latitude, longitude: stop.longitude }
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
