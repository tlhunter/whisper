#!/usr/bin/env node

var express             = require('express');
var web                 = express();
var server              = require('http').Server(web);
var io                  = require('socket.io')(server);
var geohash             = require('ngeohash');
var _                   = require('underscore')._;
var redis               = require('redis').createClient();
var sanitizer           = require('sanitizer');
var crypto              = require('crypto');
var moment              = require('moment');

var config = require('./public/shared-data.json');

// I really shouldn't be using express.js for this...
web.use('/', express.static(__dirname + '/public'));

// Port number is either the first argument or 80
var port = parseInt(process.argv[2], 10) || 80;
var host = process.argv[3];
server.listen(port, host);

// Returns a unique ID. Each time it's run, you should get a number bigger than the last
var getUniqueID = function() {
    return new Date().getTime() + "";
};

io.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: moment().format(),
        size: 5,
        body: "Socket Connection Established",
        uuid: getUniqueID(),
        color: 'FFFFFF',
    });

    // Client sent us an updated location
    socket.on('location', function(coords) {
        var hash = geohash.encode(coords.latitude, coords.longitude);

        // This is a list of all the rooms I should be in based on my geo hash
        var roomsToBeIn = [];

        // Building list of rooms to be in
        var roomsCurrentlyIn = socket.rooms;

        for (var index in roomsCurrentlyIn) {
            roomsCurrentlyIn[index] = roomsCurrentlyIn[index].slice(1); // Remove room leading slash
        }

        var roomName = '';
        for (var i = 0; i < config.levels.length; i++) {
            roomName = hash.substring(0, config.levels[i].hash_accuracy);

            // Here we join a 3x3 matrix of locations. Two people could be a few meteres apart and in two different squares, so this fixes that
            for (var adjX = -1; adjX <= 1; adjX++) {
                for (var adjY = -1; adjY <= 1; adjY++) {
                    roomsToBeIn.push(geohash.neighbor(roomName, [adjX,adjY]));
                }
            }

        }

        // Rooms I need to join
        var roomsToJoin = _.difference(roomsToBeIn, roomsCurrentlyIn);
        for (var joinIndex in roomsToJoin) {
            (function(joinIndex) {
                var thisRoom = roomsToJoin[joinIndex];
                socket.join(thisRoom);

                // The - below is on purpose
                redis.keys('msg:'+thisRoom+'-*', function(err, result) {
                    if (err) {
                        socket.emit('error', {
                            message: "Error grabbing messages from " + thisRoom
                        });
                        console.log(err);
                        return;
                    }
                    for (var i in result) {
                        redis.hgetall(result[i], function(err, result) {
                            if (err) {
                                return;
                            }
                            socket.emit('message-to-client', {
                                time: result.time,
                                size: parseInt(result.size, 10),
                                body: sanitizer.escape(result.message),
                                uuid: result.uuid,
                                area: result.area,
                                color: result.color,
                            });
                        });
                    }
                });
            })(joinIndex);
        }

        // Rooms I need to leave
        var roomsToLeave = _.difference(roomsCurrentlyIn, roomsToBeIn);
        for (var leaveIndex in roomsToLeave) {
            var roomToLeaveName = roomsToLeave[leaveIndex];
            socket.leave(roomToLeaveName);
        }
        if (roomsToLeave.length) {
            socket.emit('leave-area', {
                areas: roomsToLeave
            });
        }
    });

    // The client is sending out a message to other clients
    socket.on('message-to-server', function(data) {
        var size = parseInt(data.size, 10);
        var time = moment().format();
        var body = data.body.substring(0, 255);
        var coords = data.coords;

        // TODO: Need a faster way to do this (e.g. no crypto or md5)
        var color = crypto.createHash('md5').update(socket.id).digest('hex').substr(10,6);

        // Validations
        if (size < 0 || size > 4) {
            console.log('invalid size', size);
            return;
        }
        if (!body) {
            console.log('invalid body', body);
            return;
        }
        coords.latitude = parseFloat(coords.latitude);
        coords.longitude = parseFloat(coords.longitude);

        if (coords.latitude > 90 || coords.latitude < -90 || coords.longitude > 180 || coords.longitude < -180) {
            console.log('invalid coords', coords);
            return;
        }

        var id = getUniqueID();

        // Determine the specificity we need
        var hash = geohash.encode(coords.latitude, coords.longitude);
        var roomName = hash.substring(0, config.levels[size].hash_accuracy);

        // Persist this message in Redis
        redis.hmset([
                'msg:'+roomName+'-'+id,
                'geohash', hash,
                'message', body,
                'latitude', coords.latitude,
                'longitude', coords.longitude,
                'time', time,
                'size', size,
                'uuid', id,
                'area', roomName,
                'color', color
            ],
            function(err) {
                if (err) {
                    socket.emit('error', {
                        message: "There was an error persisting your message to the database"
                    });
                    console.log(err);
                    return;
                }

                redis.expire('msg:'+roomName+'-'+id, config.levels[size].expiration);

                // Send message to client
                io.sockets.in(roomName).emit('message-to-client', {
                    time: time,
                    size: size,
                    body: sanitizer.escape(body),
                    uuid: id,
                    area: roomName,
                    color: color
                });
            }
        );

    });
});
