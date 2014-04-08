var http   = require('http');
var xml    = require('xml2js').parseString;
var config = require('../includes/config');
var stops  = require('../includes/data/stops');

var extract_data = function (data, cb) {
  xml(data, function (err, res) {
    if (err !== null) {
      console.log("Error. Do something");
      return;
    }

    var result    = {}
    , data_body   = res['soap:Envelope']['soap:Body'][0];

    if (data_body === undefined || data_body.getUserRealTimeForecastExByStopResponse === undefined) {
      cb({message:'no data', name:'', lat:'', lon:'', next:[]});
      return;
    }

    var data_response = data_body.getUserRealTimeForecastExByStopResponse[0]
    , data_result     = data_response.getUserRealTimeForecastExByStopResult[0]
    , data            = JSON.parse(data_result)
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
exports.index = function (req, res){
  res.render('index', { title: 'Bybussen API'});
};

exports.rt = function (req, res){
  var env = '<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://schemas.xmlsoap.org/soap/envelope/"><soap12:Body><getUserRealTimeForecastExByStop xmlns="http://miz.it/infotransit"><auth><user>'+ config.USERNAME +'</user><password>'+ config.PASSWORD +'</password></auth><busStopId>' + req.params.stopid + '</busStopId><nForecast>20</nForecast></getUserRealTimeForecastExByStop></soap12:Body></soap12:Envelope>';

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
};

exports.stops = function (req, res) {
  res.json(stops.stops);
};
