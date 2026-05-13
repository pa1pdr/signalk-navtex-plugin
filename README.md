# NavTex reader for SignalK

This plugin allows you to view NavTex messages in a browser, e.g. from your phone/ipad and/or from a B&G/Navico MFD when using [this plugin](https://www.npmjs.com/package/signalk-mfd-plugin).
The plugin expects a NavTex feed on a serial port, which can be configured in the plugin config.

Install by running: C:\signalk\signalkhome\.signalk\node_modules> ..\..\nodejs\.\npm.cmd install --ignore-scripts pa1pdr/signalk-navtex-plugin


## NavTex support

### ZCZC
The normal ZCZC header type messages are supported.

### NASA NavTex
NASA uses `>` and `<` as header and footer. This is supported as well.

### ICS NAV6
The ICS NAV6 receiver omits ZCZC/NNNN and uses a different format:
- Session header: `NAVTEX ====... DD/MM/YYYY HH:MM UTC`
- Message header: `XYNN freq kHz station Cg n%` (e.g. `PB02 518 kHz Netherlands Cg 0%`)
  where X = station ID, Y = message type, NN = sequence number
- Message body lines terminated by a blank line
- Messages are implicitly closed when the next message or session header arrives

## Features
 - Station and per station message type selection through plugin config
 - Day/night mode
 - Temp removing messages from view
 - Option to use NASA NavTex stored messages


![](doc/navtex_1.png)
![](doc/navtex_2.png)

