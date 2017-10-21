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

    return app
}

process.on('uncaughtException', (err) => {
    logger(err.stack)
})

module.exports = Bybussen
