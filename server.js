var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');
var _ = require('underscore')._;
var redis = require('redis').createClient();
var sanitizer   = require('sanitizer');

var config = require('./public/shared-data.json');

// I really shouldn't be using express.js for this...
web.use('/', express.static(__dirname + '/public'));

server.listen(80);

var getUniqueID = function() {
    return new Date().getTime() + "";
}

io.sockets.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: new Date(),
        size: 5,
        body: "Socket Connection Established",
        uuid: getUniqueID(),
        dirty: false
    });

    socket.on('location', function(coords) {
        var hash = geohash.encode(coords.latitude, coords.longitude);

        // This is a list of all the rooms I should be in based on my geo hash
        var roomsToBeIn = [];

        // Building list of rooms to be in
        var roomsCurrentlyIn = _.keys(io.sockets.manager.roomClients[socket.id]);
        roomsCurrentlyIn.shift(); // remove first blank room
        for (var index in roomsCurrentlyIn) {
            roomsCurrentlyIn[index] = roomsCurrentlyIn[index].slice(1); // Remove room leading slash
        }

        var roomName = '';
        for (var i = 0; i < config.levels.length; i++) {
            roomName = hash.substring(0, config.levels[i].hash_accuracy);
            for (var adjX = -1; adjX <= 1; adjX++) {
                for (var adjY = -1; adjY <= 1; adjY++) {
                    roomsToBeIn.push(geohash.neighbor(roomName, [adjX,adjY]));
                }
            }

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
                                body: sanitizer.escape(result.message),
                                uuid: result.uuid,
                                area: result.area,
                                dirty: true
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

        var id = getUniqueID();

        // Determine the specificity we need
        var hash = geohash.encode(coords.latitude, coords.longitude);
        var roomName = hash.substring(0, config.levels[size].hash_accuracy);

        redis.hmset([
                'msg:'+roomName+'-'+id,
                'geohash', hash,
                'message', body,
                'latitude', coords.latitude,
                'longitude', coords.longitude,
                'time', time,
                'size', size,
                'uuid', id,
                'area', roomName
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

                // Send message
                io.sockets.in(roomName).emit('message-to-client', {
                    time: time,
                    size: size,
                    body: sanitizer.escape(body),
                    uuid: id,
                    area: roomName,
                    dirty: false
                });
            }
        );

        
    });
});

