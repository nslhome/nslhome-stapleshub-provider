var core = require('nslhome-core')
var moment = require("moment");
var StaplesConnectHub = require('staplesconnecthub');

var PROVIDER_TYPE = "stapleshub-provider";

var provider = core.provider(PROVIDER_TYPE);
var logger = core.logger(PROVIDER_TYPE);

var express=  require("express");
var app = express();

var hub = null;
var lastCheckin = moment();

var sendDeviceDump = function(config) {
    for (var i in hub.devices) {
        var d = hub.devices[i];

        var device = {
            id: provider.name + ":device:" + hub.devices[i].id,
            name: hub.devices[i].name
        };

        switch (d.deviceType) {
            case 3:
                device.type = 'light';
                device.lightType = 'basic';
                device.powerState = hub.devices[i].value > 0;
                break;

            case 2:
                device.type = 'light';
                device.lightType = 'dimmable';

                if (hub.devices[i].deviceStateDoc) {
                    device.powerState = hub.devices[i].deviceStateDoc.state.powerState == 'on';
                    device.powerLevel = hub.devices[i].deviceStateDoc.state.powerLevel;

                    if (hub.devices[i].deviceStateDoc.state.color) {
                        device.lightType = 'hue';
                        device.hueColor = hub.devices[i].deviceStateDoc.state.color;
                        device.hueEffect = hub.devices[i].deviceStateDoc.state.lightEffect;
                    }
                }
                else {
                    device.powerState = hub.devices[i].value > 0;
                    device.powerLevel = hub.devices[i].value;
                }
                break;

            case 11:
            case 42:
                device.type = 'binarysensor';
                device.sensorType = 'generic';
                device.triggerState = hub.devices[i].value > 0;
                switch (hub.devices[i].subCategoryID) {
                    case 0:
                        device.sensorType = 'water';
                        break;
                    case 1:
                        device.sensorType = 'motion';
                        break;
                    case 2:
                    case 3:
                        device.sensorType = 'door';
                        break;
                }
                break;

            case 6: // thermostat
                break;

            default:
                //log("Unknown Device: " + JSON.stringify(d));
                break;
        }

        if (device.type)
            provider.send({name: 'device', body: device});
    }

    for (var i in hub.thermostats) {
        var d = hub.thermostats[i];

        var device = {
            id: provider.name + ":thermostat:" + hub.thermostats[i].id,
            type: 'thermostat',
            name: hub.thermostats[i].name,
            temp: hub.thermostats[i].ambientTemp,
            fanOn: hub.thermostats[i].fanMode == 1
        };

        provider.send({name: 'device', body: device});
    }
};


var providerStarted = function(err, config) {
    if (err) {
        logger.error(err);
        process.exit(1);
    }

    hub = new StaplesConnectHub(config.hubId, config.emailAddress, config.password);
    hub.config = config;

    /*
     setTimeout(function() {
     log("Quitting to test auto recycle");
     process.exit(2);
     }, 10000);
     */

    setInterval(function() {
        var minSinceActivity = moment().diff(lastCheckin, 'minutes');
        if (minSinceActivity > 45) {
            process.exit(1);
        }
    }, 1000 * 60);

    hub.on("connect", function() {
        logger.verbose("Connected");
        sendDeviceDump(config);
    });

    hub.on("disconnect", function(reason) {
        logger.verbose("Disconnected - " + reason);
        process.exit(1);
    });

    hub.on("DataUpdate", function(id, value) {
        var d = hub.devices[id];

        lastCheckin = moment();

        logger.info(d.name + " changed state to " + JSON.stringify(value));

        var update = {
            id: provider.name + ":device:" + id
        };

        switch (d.deviceType) {
            case 3:
                update.powerState = d.value > 0;
                break;

            case 2:
                if (d.deviceStateDoc) {
                    update.powerState = d.deviceStateDoc.state.powerState == 'on';
                    update.powerLevel = d.deviceStateDoc.state.powerLevel;

                    if (d.deviceStateDoc.state.color) {
                        update.hueColor = d.deviceStateDoc.state.color;
                        update.hueEffect = d.deviceStateDoc.state.lightEffect;
                    }
                }
                else {
                    update.powerState = d.value > 0;
                    update.powerLevel = d.value;
                }
                break;

            case 11:
                update.triggerState = d.value > 0;
                break;
        }

        provider.send({name: 'device', body: update});
    });

    hub.on("ThermostatUpdate", function(id, value) {
        var t = hub.thermostats[id];

        lastCheckin = moment();

        var thermostat = {
            id: provider.name + ":thermostat:" + t.id,
            temp: t.ambientTemp,
            fanOn: t.fanMode == 1
        };

        provider.send({name: 'device', body: thermostat});
    });

    hub.on("SystemAlert", function(message) {
        lastCheckin = moment();
        logger.info(message);
    });

    hub.on("EventInitiated", function(id) {
        lastCheckin = moment();

        var event = {
            id: provider.name + ":event:" + id,
            name: hub.activities[id].name
        };
        logger.info(event.name + " triggered");

        provider.send({name: 'event', body: event});
    });

    app.get('/' + provider.name, function(req, res) {
        res.json({
            "devices": hub.devices,
            "thermostats": hub.thermostats,
            "activities": hub.activities,
            "rooms": hub.rooms
    });
    });

    app.get('/' + provider.name + '/devices', function(req, res) {
        res.json(hub.devices);
    });

    app.get('/' + provider.name + '/thermostats', function(req, res) {
        res.json(hub.thermostats);
    });

    app.get('/' + provider.name + '/activities', function(req, res) {
        res.json(hub.activities);
    });

    app.get('/' + provider.name + '/rooms', function(req, res) {
        res.json(hub.rooms);
    });

    logger.verbose("proxy listening on port " + config.httpProxyPort);
    app.listen(config.httpProxyPort);
};

var deviceOn = function(id, next) {
    if (hub.devices[id]) {
        if (hub.devices[id].deviceStateDoc) {
            hub.deviceSetState(id, {state: {powerLevel: 100, powerState: 'on'}}, next);
        }
        else {
            hub.deviceSetValue(id, 100, next);
        }
    }
    else
        logger.warning("deviceOn: Unknown device " + id);
};

var deviceOff = function(id, next) {
    if (hub.devices[id]) {
        if (hub.devices[id].deviceStateDoc) {
            hub.deviceSetState(id, {state: {powerLevel: 0, powerState: 'off'}}, next);
        }
        else {
            hub.deviceSetValue(id, 0, next);
        }
    }
    else
        logger.warning("deviceOff: Unknown device " + id);
};

provider.on('setDevicePower', function(id, isOn) {
    if (isOn)
        deviceOn(parseInt(id.split(':')[2]));
    else
        deviceOff(parseInt(id.split(':')[2]));
});

provider.on('setDeviceState', function(id, state) {
    hub.deviceSetState(parseInt(id.split(':')[2]), {state: state});
});


module.exports = exports = start = function(configName) {
    provider.initialize(configName, providerStarted);
};

if (require.main === module) {
    start(process.argv[2]);
}
