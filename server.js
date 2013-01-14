var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');
var _ = require('underscore')._;
var redis = require('redis').createClient();
var uuid = require('node-uuid');

var GEOHASH_ACCURACY = 9;
var GEOHASH_LEVELS = [ 8, 5, 4, 3, 2 ];
var EXPIRATION = [
    -1,     // Error
    172800,  // Level 1 = 48 Hours
    43200,  // Level 2 = 12 Hours
    7200,   // Level 3 = 2 Hours
    1200,    // Level 4 = 20 Minutes
    30      // Level 5 = 30 Seconds
];

// I really shouldn't be using express.js for this...
web.use('/', express.static(__dirname + '/public'));

server.listen(80);

io.sockets.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: new Date(),
        size: 5,
        body: "Socket Connection Established",
        uuid: 0,
    });

    socket.on('location', function(coords) {
        var hash = geohash.encode(coords.latitude, coords.longitude, GEOHASH_ACCURACY);

        // This is a list of all the rooms I should be in based on my geo hash
        var roomsToBeIn = [];

        // Building list of rooms to be in
        var roomsCurrentlyIn = _.keys(io.sockets.manager.roomClients[socket.id]);
        roomsCurrentlyIn.shift(); // remove first blank room
        for (index in roomsCurrentlyIn) {
            roomsCurrentlyIn[index] = roomsCurrentlyIn[index].slice(1); // Remove room leading slash
        }

        for (var i = 0; i < GEOHASH_LEVELS.length; i++) {
            roomName = hash.substring(0, GEOHASH_LEVELS[i]);
            roomsToBeIn.push(roomName);
        }

        // Rooms I need to join
        var roomsToJoin = _.difference(roomsToBeIn, roomsCurrentlyIn);
        for (var joinIndex in roomsToJoin) {
            // hey look, I'm javascript, who needs scoping outside of function blocks herp derp
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
                                body: result.message,
                                uuid: result.uuid
                            });
                        });
                    }
                });
            })(joinIndex);
        }

        // Rooms I need to leave
        var roomsToLeave = _.difference(roomsCurrentlyIn, roomsToBeIn);
        for (var leaveIndex in roomsToLeave) {
            socket.leave(roomsToLeave[leaveIndex]);
            // TODO Send message to client to delete messages tied to these rooms
        }
    });

    socket.on('message-to-server', function(data) {
        var size = parseInt(data.size, 10);
        var time = new Date();
        var body = data.body.substring(0, 255);
        var coords = data.coords;

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

        var id = uuid.v1();

        // Determine the specificity we need
        var hash = geohash.encode(coords.latitude, coords.longitude, GEOHASH_ACCURACY);
        var roomName = hash.substring(0, GEOHASH_LEVELS[size]);

        redis.hmset([
                'msg:'+roomName+'-'+id,
                'geohash', hash,
                'message', body,
                'latitude', coords.latitude,
                'longitude', coords.longitude,
                'time', time,
                'size', size,
                'uuid', id
            ],
            function(err, result) {
                if (err) {
                    socket.emit('error', {
                        message: "There was an error persisting your message to the database"
                    });
                    console.log(err);
                    return;
                }

                redis.expire('msg:'+roomName+'-'+id, EXPIRATION[size]);

                // Send message
                io.sockets.in(roomName).emit('message-to-client', {
                    time: time,
                    size: size,
                    body: body,
                    uuid: id
                });
            }
        );

        
    });
});

