/*
 Interesting API https://hub.arcgis.com/datasets/nga::navtex-sites/api
*/

const util = require("util")
const _ = require("lodash")
const url = require('url');
const { SerialPort } = require('serialport')
const { ReadlineParser } = require('@serialport/parser-readline')

let stationList = require('./stations.json');

var NavTexMessages = []
var cleaner = require('deep-cleaner');
var qs = require('querystring');
var dateTime = require('node-datetime');
var fs = require('fs');
// var messagesCacheFile = __dirname + '/public/navtex_messages_store.json';
var messages = [];
var msgid = 1;
var message = {};
var nextline = '';
var line = '';
var input = '';
var path = require('path');
var plugin = {}

module.exports = function(app, options) {
  "use strict"
  var client
  var plugin = {}
  plugin.id = "signalk-navtex-plugin"
  plugin.name = "NavTex message reader and display"
  plugin.description = "Signal K server plugin that reads NavTex messages from serial with a display"

  var unsubscribes = []

  var schema = {
    type: "object",
    title:
    "A Signal K (node) plugin to read and display NavTex messages",
    description: "This plugin reads NavTex messages from a serial port and sends them to SignalK under /resources/navtex/.",
    properties: {
      tty: {
        type: "string",
        title: "Serial port to read NavTex input from",
        default: "/dev/ttyS1"
      },
      baudrate: {
        type: "number",
        title: "Serial port baudrate",
        default: 4800
      },
      expire: {
        type: "number",
        title: "Expire messages older than (hours)",
        default: 48
      },
      nasaStore: {
        type: "boolean",
        title: "Use message store in NASA NavTex",
        default: false
      },
	    stations: {
	      type: 'array',
	      title: '518 kHz (international) - stations and message types',
	      items: {
	        type: 'object',
	        properties: {
	          station: {
	            type: 'string',
	            title: 'Station',
	            default: 'ALL'
	          },
            messageTypes: {
              type: 'object',
			        title: 'Message types',
			        properties: {
			          0: {
			            title: "All messages",
			            type: 'boolean'
			          },
			          A: {
			            title: "Navigational warning",
			            type: 'boolean'
			          },
			          B: {
			            title: "Meteorological warning",
			            type: 'boolean'
			          },
			          C: {
			            title: "Ice report",
			            type: 'boolean'
			          },
			          D: {
			            title: "Search and rescue information and pirate warning",
			            type: 'boolean'
			          },
			          E: {
			            title: "Meteorological forecast",
			            type: 'boolean'
			          },
			          F: {
			            title: "Pilot service message",
			            type: 'boolean'
			          },
			          G: {
			            title: "AIS, DECCA message",
			            type: 'boolean'
			          },
			          H: {
			            title: "LORAN message",
			            type: 'boolean'
			          },
			          J: {
			            title: "SATNAV message (GPS, GLONASS)",
			            type: 'boolean'
			          },
			          K: {
			            title: "Other electronic navaid system message",
			            type: 'boolean'
			          },
			          L: {
			            title: "Navigational warning (additional)",
			            type: 'boolean'
			          },
			          V: {
			            title: "Notice to fishermen (US only)",
			            type: 'boolean'
			          },
			          W: {
			            title: "Environmental (US only)",
			            type: 'boolean'
			          },
			          Z: {
			            title: "No message on hand",
			            type: 'boolean'
			          }
			        }
			      }
			    }
			  }
      },
    stations490: {
      type: 'array',
      title: '490 kHz (local) - stations and message types',
      items: {
        type: 'object',
        properties: {
          station: {
            type: 'string',
            title: 'Station',
            default: 'ALL'
          },
          messageTypes: {
            type: 'object',
            title: 'Message types',
            properties: {
              0: { title: "All messages", type: 'boolean' },
              A: { title: "Navigational warning", type: 'boolean' },
              B: { title: "Meteorological warning", type: 'boolean' },
              C: { title: "Ice report", type: 'boolean' },
              D: { title: "Search and rescue information and pirate warning", type: 'boolean' },
              E: { title: "Meteorological forecast", type: 'boolean' },
              F: { title: "Pilot service message", type: 'boolean' },
              G: { title: "AIS, DECCA message", type: 'boolean' },
              H: { title: "LORAN message", type: 'boolean' },
              J: { title: "SATNAV message (GPS, GLONASS)", type: 'boolean' },
              K: { title: "Other electronic navaid system message", type: 'boolean' },
              L: { title: "Navigational warning (additional)", type: 'boolean' },
              V: { title: "Notice to fishermen (US only)", type: 'boolean' },
              W: { title: "Environmental (US only)", type: 'boolean' },
              Z: { title: "No message on hand", type: 'boolean' }
            }
          }
        }
      }
    }
    }
  } 

  function updateSchema() {
  /*
    {
	   "NAVAREA": "I",
	   "Broadcast frequency (kHz)": 518,
	   "NAVTEX CRS name": "Svalbard",
	   "NAVTEX CRS identifier": "A",
	   "Country": "Norway",
	   "Latitude": "78° 02' N",
	   "Longitude": "13° 40' E",
	   "Broadcast range (NM)": "450",
	   "Transmission times (All in UTC)": "0000, 0400, 0800, 1200, 1600, 2000",
	   "Broadcast language": "English"
    },
  */

  // app.debug('schema: ' + JSON.stringify(schema))
    var mkObj = function() {
      return { type: 'string', title: 'Station', enum: [], enumNames: [], default: 'ALL' };
    };
    var obj518 = mkObj(), enum518 = ['ALL'], names518 = ['All 518 kHz'];
    var obj490 = mkObj(), enum490 = ['ALL'], names490 = ['All 490 kHz'];
    Object.keys(stationList).forEach(key => {
      var s = stationList[key];
      var freq = s['Broadcast frequency (kHz)'];
      var label = "NavArea " + s['NAVAREA'] + " - " + freq + "kHz - " + s['NAVTEX CRS name'] + " (" + s['Country'] + " / " + s['Broadcast language'] + ")";
      var id = s['NAVAREA'] + "-" + freq + "-" + s['NAVTEX CRS identifier'];
      if (freq === 518) {
        if (!enum518.includes(id)) { enum518.push(id); names518.push(label); }
      } else if (freq === 490) {
        if (!enum490.includes(id)) { enum490.push(id); names490.push(label); }
      }
    });
    obj518.enum = enum518; obj518.enumNames = names518;
    obj490.enum = enum490; obj490.enumNames = names490;
    schema.properties.stations.items.properties.station = obj518;
    schema.properties.stations490.items.properties.station = obj490;
    app.debug('schema: %j', schema);
  }

  updateSchema();

  plugin.schema = function() {
    updateSchema();
    return schema
  }

    var pluginOptions = null;
    var removeOldInterval = null;
    var tty = null;
    var footerTimeout = null;
    var FOOTER_TIMEOUT_MS = 10000; // 10 s silence = end of message (ICS NAV6 gap is ~4 s)
    plugin.start = function(options, restartPlugin) {
      pluginOptions = options;
      message = {};
      nextline = '';
      clearInterval(removeOldInterval);
      clearTimeout(footerTimeout);
      footerTimeout = null;
      var text = [];
      app.debug('starting plugin')
      const messagesCacheFile = path.join(app.getDataDirPath(), 'messagesCacheFile.json')
      app.debug('Using cache file: ' + messagesCacheFile)
      let localSubscription = {
        context: '*', // Get data for all contexts
        subscribe: [{
          path: 'resources.navtex.*', // Get navtex paths
          period: 5000 // Every 5000ms
        }]
      };
    
      app.subscriptionmanager.subscribe(
        localSubscription,
        unsubscribes,
        subscriptionError => {
          app.error('Error:' + subscriptionError);
        },
        delta => {
          delta.updates.forEach(u => {
            // app.debug(u.values)
            NavTexMessages.push(u.values)
          });
        }
      );

      // Check for and read cache file
		  app.debug('Checking for cache file (' + messagesCacheFile + ')');
		  if (fs.existsSync(messagesCacheFile)) {
		    app.debug('Found cache file. Reading...');
		    messages  = JSON.parse(fs.readFileSync(messagesCacheFile, 'utf8'));
		    var count = 0;
		    for (const [key, value] of Object.entries(messages)) {
		      // app.debug('key: ' + key + ' received: ' + value.datetime);
		      if (value != null && typeof value['id'] != 'undefined') {
            NavTexMessages.push(value)
            sendDelta(value)
		        msgid = value['id'];
		        // app.debug('Reading msgid ' + msgid);
		        count++;
		      }
		    }
		    msgid++;

        
		    app.debug('Read ' + count + ' messages from cache. Msgid now ' + msgid);
		    removeOld();
		  } else {
		    app.debug('No cache file found');
		  }

      // Setup TTY reader — wrapped in setTimeout for Windows COM port compatibility
      app.debug('Using TTY ' + options.tty + ' at ' + options.baudrate + ' baud')
      setTimeout(function() {
        tty = new SerialPort({
          path: options.tty,
          baudRate: options.baudrate,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          AutoOpen: false
        });

        if (options.nasaStore == true) {
          // Try to retrieve stored messages on NASA NavTex
          app.debug('Writing $S to retrieve NASA NavTex stored messages')
          tty.write('$S\r\n', function(err) {
            if (err) {
              return app.debug('Error writing $S', err.message)
            }
          })
        }

        tty.on('data', function(data) { app.debug('RAW: ' + JSON.stringify(data.toString())) })

        const parser = tty.pipe(new ReadlineParser({ delimiter: '\r\n' }))
        parser.on('data', function(data) {
          data = data.toString().trim();
          app.debug('Parsed: ' + JSON.stringify(data))
          processLine(data);
        });
      }, 500);

      // Remove old entries every hour
      removeOldInterval = setInterval(removeOld, 60*60*1000);

			function pushDelta(app, path, value) {
        // app.debug("sendDelta: " + path + ": " + JSON.stringify(value))
			  app.handleMessage(plugin.id, {
			    updates: [
			      {
			        values: [
			          {
			            path: path,
			            value: value
			          }
			        ]
			      }
			    ]
			  })
			  return
			}
			
			function processLine(line) {
			  // Standard ZCZC format: "ZCZC B03" or NASA NavTex ">" prefix
			  if (line.match(/^ZCZC/i) || line.match(/^>/i)) {
			    if (nextline == 'text') {
			      app.debug('Missed footer apparently');
			      processFooter();
			    }
			    nextline = 'header';
			  // ICS NAV6: session header e.g. "NAVTEX ==== 14/07/2025 10:30 UTC"
			  } else if (line.match(/^NAVTEX\s*={3,}/i)) {
			    if (nextline == 'text') {
			      app.debug('Session boundary - closing message');
			      processFooter();
			    }
			    nextline = '';
			  // ICS NAV6: message header e.g. "PB02 518 kHz Netherlands Cg 0%" (X=stationId, Y=msgtype, NN=seq)
			  } else if (line.match(/^[A-Z]{2}\d{2}(\s|$)/)) {
			    if (nextline == 'text') {
			      app.debug('New XYNN header - closing previous message');
			      processFooter();
			    }
			    nextline = 'xynn';
			  // Standard NNNN footer or NASA NavTex "<" suffix
			  } else if (line.match(/^NNNN/i) || line.match(/^</i)) {
			    nextline = 'footer';
			  }

			  switch(nextline) {
			    case 'header':
			      app.debug('header: Seeing new ZCZC');
			      const offset = line.match(/^>/i) ? 1 : 5;
			      message.id = msgid;
			      message.epoch = Date.now();
			      message.stationId = line.slice(offset, offset+1);
			      message.msgtype = line.slice(offset+1, offset+2);
			      message.msgtypenr = line.slice(offset+2);
			      message.freq = '518';
			      nextline = 'text';
			      break;

			    case 'xynn':
			      app.debug('header: Seeing ICS NAV6 XYNN message header');
			      message.id = msgid;
			      message.epoch = Date.now();
			      message.stationId = line.slice(0, 1);
			      message.msgtype = line.slice(1, 2);
			      message.msgtypenr = line.slice(2, 4);
			      var freqMatch = line.match(/(\d+)\s+kHz/);
			      message.freq = freqMatch ? freqMatch[1] : '518';
			      nextline = 'text';
			      break;

			    case 'text':
			      text.push(line);
			      clearTimeout(footerTimeout);
			      footerTimeout = setTimeout(function() {
			        app.debug('footer: inactivity timeout');
			        processFooter();
			      }, FOOTER_TIMEOUT_MS);
			      break;

			    case 'footer':
			      processFooter();
			      break;
			  }
			};
			
			function processFooter () {
			  clearTimeout(footerTimeout);
			  footerTimeout = null;
			  while (text[text.length - 1] == '') {
			    text.pop();
			  }
			  if (typeof message.id !== 'undefined') {
			    message.text = text;
			    messages.push(message);
			    sendDelta(message)
			    app.debug('footer: Added message id ' + msgid);
          if (options.nasaStore == false) {
			      cacheMessages(messages, messagesCacheFile);
          }
			    text = [];
			    message = {};
			    msgid++;
			    nextline = '';
			  }
			}
			
			function cacheMessages (data, path) {
			  try {
			    fs.writeFileSync(path, JSON.stringify(data));
			    app.debug('Cache file written');
			  } catch (err) {
			    console.error(err)
			  }
			}
			
			function removeOld () {
		    cleaner(messages);
		    var count = 1;
		    app.debug('Cleaning entries older than ' + options.expire + ' hours')
		    var now = Date.now();
		    var messages_tmp = [];
		    messages.sort(function(a, b) {
		        return (a.id - b.id);
		    });
		    for (const [key, value] of Object.entries(messages)) {
		      if (value != null) {
		        if ((now - value['epoch']) > (options.expire * 1000 * 60 * 60)) {
		          app.debug('Removing msgid ' + value['id']);
		        } else {
		          value['id'] = count;
		          messages_tmp.push(value);
		          count++;
		        }
		      } else {
		        app.debug('Skipping null');
		      }
		    }
		    msgid = count;
		    // app.debug(messages_tmp);
        if (options.nasaStore == false) {
		      cacheMessages(messages_tmp, messagesCacheFile);
        }
			  messages = JSON.parse(JSON.stringify(messages_tmp));
			}

			function sendDelta(message) {
        var freq = message.freq || '518';
        var navPath = "resources.navtex." + message.stationId + "." + message.msgtype + "." + message.msgtypenr;
        pushDelta(app, navPath, {
          "epoch": message.epoch,
          "text": message.text,
          "freq": freq
        })
			}

    }


    plugin.stop = function() {
      app.debug("Stopping")
      unsubscribes.forEach(f => f())
      clearInterval(removeOldInterval);
      clearTimeout(footerTimeout);
      footerTimeout = null;
      if (tty && tty.isOpen) {
        tty.close(function(err) {
          if (err) app.debug('Error closing port: ' + err.message)
          else app.debug('Port closed')
        })
      }
      tty = null
      app.debug("Stopped")
    }

    plugin.registerWithRouter = function(router) {
      app.debug("registerWithRouter")
      router.get("/messages", (req, res) => {
        res.contentType("application/json")
        res.send(JSON.stringify(NavTexMessages))
      })
      router.get("/schema", (req, res) => {
        res.contentType("application/json")
        res.send(JSON.stringify(schema))
      })
      router.get("/options", (req, res) => {
        res.contentType("application/json")
        res.send(JSON.stringify(pluginOptions))
      })
      router.get("/stations", (req, res) => {
        res.contentType("application/json")
        res.send(JSON.stringify(stationsEnabled()))
      })
      router.get("/stationlist", (req, res) => {
        var map = {};
        Object.values(stationList).forEach(s => {
          var id = s['NAVTEX CRS identifier'];
          if (!map[id]) map[id] = s['NAVTEX CRS name'] + ' (' + s['Country'] + ')';
        });
        res.contentType("application/json")
        res.send(JSON.stringify(map))
      })
      router.get("/back", (req, res) => {
        res.redirect('back')
      })
    }

    function stationsEnabled() {
      if (!pluginOptions) return [];
      var stations = [];
      function addPatterns(list, prefix) {
        if (!list || !list.length) return;
        for (const stationObj of Object.values(list)) {
          if (stationObj.station == 'ALL') {
            stations.push(prefix + "*.*.*");
          } else {
            var sId = stationObj['station'].split('-')[2];
            for (const [key, value] of Object.entries(stationObj.messageTypes || {})) {
              if (value == true) {
                stations.push(key == '0'
                  ? prefix + sId + ".*.*"
                  : prefix + sId + "." + key + ".*");
              }
            }
          }
        }
      }
      addPatterns(pluginOptions.stations,    "");  // 518 kHz
      addPatterns(pluginOptions.stations490, "");  // 490 kHz – different station letters, same path format
      app.debug('stationsEnabled: %j', stations);
      return stations;
    }

  return plugin;
};
module.exports.app = "app"
module.exports.options = "options"

