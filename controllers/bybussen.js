var http = require('http')
, xml    = require('xml2js').parseString
, config = require('../config')()
, stops  = require('../data/stops');

var extract_data = function (data, cb) {
  xml(data, function (err, res) {
    var result    = {}
    , data_body   = res['soap:Envelope']['soap:Body'][0];

    if (data_body === undefined || data_body.getUserRealTimeForecastExByStopResponse === undefined) {
      cb({message:'no data', name:'', lat:'', lon:'', next:[]});
      return;
    }

    var data_response = data_body.getUserRealTimeForecastExByStopResponse[0]
    , data_result     = data_response.getUserRealTimeForecastExByStopResult[0];

    if (data_result == 'WsAuthenticationError') {
      cb({error: 'WsAuthenticationError'});
      return;
    }

    var data          = JSON.parse(data_result)
    , info            = data.InfoNodo[0];

    result.name       = info.descrNodo;
    result.lat        = info.coordLon;
    result.lon        = info.coordLat;

    result.next       = [];

    for (var i = 0; i < data.Orari.length; i++) {
      result.next.push({
        l:   data.Orari[i].codAzLinea,
        t:   data.Orari[i].orario,
        ts:  data.Orari[i].orarioSched,
        rt:  data.Orari[i].statoPrevisione == 'Prev' ? 1 : 0,
        d:   data.Orari[i].capDest
      });
    }

    cb(result);
  });
};


/* Routes
----------------------------------------------------------------------------- */

module.exports = function (app) {

  app.get('/:route(rt)?', function (req, res) {
    res.render('index', { title: 'Bybussen API'});
  });


  app.get('/rt/:stopid', function (req, res){
    if (config.atb_user === '' || config.atb_pass === '') {
      res.json({error:'Webservice username and password missing in config file'});
      return;
    }

    if (/\D/.test(req.params.stopid)) {
      res.json({error:'Not a valid stopid'});
      return;
    }

    var env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://schemas.xmlsoap.org/soap/envelope/"><soap12:Body><getUserRealTimeForecastExByStop xmlns="http://miz.it/infotransit"><auth><user>'+ config.atb_user +'</user><password>'+ config.atb_pass +'</password></auth><busStopId>' + req.params.stopid + '</busStopId><nForecast>20</nForecast></getUserRealTimeForecastExByStop></soap12:Body></soap12:Envelope>';

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
    };

    var request = http.request( post_request, function (r) {
      var buffer = '';

      r.on( "data", function( data ) { buffer = buffer + data; } );
      r.on( "end", function( data ) {
        extract_data(buffer, function (d) {
          res.json(d);
        });
      });
    });

    request.write( env );
    request.end();
  });


  app.get('/stops', function (req, res) {
    res.json(stops.stops);
  });
};
