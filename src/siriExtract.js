const xml = require('xml2js').parseString

// TODO: next version shouldnt need this transform
const formatDate = (dateString) => {
    let date = dateString.substring(0, 10)
    let time = dateString.substring(11, 16)

    return `${ date.substring(8, 10) }.${ date.substring(5, 7) }.${ date.substring(0, 4) } ${ time }`
}

const extractSiri = (data, cb, numberOfDepartures=20, offset=0) => {
    xml(data, (err, res) => {
        if (err) {
            return cb(err)
        }

        if (res['s:Envelope']['s:Body'][0]['GetStopMonitoringResponse'][0]['Answer'][0]['StopMonitoringDelivery'][0]['ErrorCondition']) {
            return cb({ error: res['s:Envelope']['s:Body'][0]['GetStopMonitoringResponse'][0]['Answer'][0]['StopMonitoringDelivery'][0]['ErrorCondition'][0]['Description'][0] })
        }

        const departures = res['s:Envelope']['s:Body'][0]['GetStopMonitoringResponse'][0]['Answer'][0]['StopMonitoringDelivery'][0]['MonitoredStopVisit']

        cb(null, {
            name: departures[0].MonitoredVehicleJourney[0].MonitoredCall[0].StopPointName[0],
            locationId: departures[0].MonitoredVehicleJourney[0].MonitoredCall[0].StopPointRef[0],
            next: departures.slice(offset, numberOfDepartures).map(d => {
                const departure = d.MonitoredVehicleJourney[0]
                return {
                    l: departure.LineRef[0],
                    t: departure.Monitored[0] === 'true' ? formatDate(departure.MonitoredCall[0].ExpectedDepartureTime[0]) : formatDate(departure.MonitoredCall[0].AimedDepartureTime[0]),
                    ts: formatDate(departure.MonitoredCall[0].AimedDepartureTime[0]),
                    rt: departure.Monitored[0] === 'true' ? 1 : 0,
                    d: departure.DestinationName[0]
                }
            })
        })
    })
}

const extractData = (data, cb) => {
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
                l: departure.codAzLinea,
                t: departure.orario,
                ts: departure.orarioSched,
                rt: departure.statoPrevisione == 'Prev' ? 1 : 0,
                d: departure.capDest
            }))
        })
    })
}

module.exports = {
    extractSiri,
    extractData
}