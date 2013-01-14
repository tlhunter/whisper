var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');
var _ = require('underscore')._;
var redis = require('redis').createClient();

var uuid = 1;
var GEOHASH_ACCURACY = 9;
var GEOHASH_LEVELS = 5;
var EXPIRATION = [
    -1,     // Error
    86400,  // Level 1 = 24 Hours
    28800,  // Level 2 = 8 Hours
    3600,   // Level 3 = 1 Hour
    600,    // Level 4 = 10 Minutes
    10      // Level 5 = 10 Seconds
];

// I really shouldn't be using express.js for this...
web.use('/', express.static(__dirname + '/public'));

server.listen(80);

io.sockets.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: new Date(),
        size: 0,
        body: "Socket Connection Established",
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

        for (var i = GEOHASH_ACCURACY; i > GEOHASH_ACCURACY - GEOHASH_LEVELS; i--) {
            roomName = hash.substring(0, i);
            roomsToBeIn.push(roomName);
        }

        // Rooms I need to join
        var roomsToJoin = _.difference(roomsToBeIn, roomsCurrentlyIn);
        for (var joinIndex in roomsToJoin) {
            socket.join(roomsToJoin[joinIndex]);
        }

        // Rooms I need to leave
        var roomsToLeave = _.difference(roomsCurrentlyIn, roomsToBeIn);
        for (var leaveIndex in roomsToLeave) {
            socket.leave(roomsToLeave[leaveIndex]);
        }
    });

    socket.on('message-to-server', function(data) {
        var size = parseInt(data.size, 10);
        var time = new Date();
        var body = data.body.substring(0, 255);
        var coords = data.coords;

        // Validations
        if (size < 1 || size > 5) {
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

        // Increment Unique ID
        uuid++;

        // Determine the specificity we need
        var hash = geohash.encode(coords.latitude, coords.longitude, GEOHASH_ACCURACY);
        var roomName = hash.substring(0, GEOHASH_ACCURACY - (size - 1));

        redis.hmset([
                'msg:'+roomName+'-'+uuid,
                'geohash', hash,
                'message', body,
                'latitude', coords.latitude,
                'longitude', coords.longitude,
                'time', time,
                'size', size
            ],
            function(err, result) {
                if (err) {
                    socket.emit('error', {
                        message: "There was an error persisting your message to the database"
                    });
                    return;
                }

                redis.expire('msg:'+roomName+'-'+uuid, EXPIRATION[size]);

                // Send message
                io.sockets.in(roomName).emit('message-to-client', {
                    time: time,
                    size: size,
                    body: body,
                    uuid: uuid
                });
            }
        );

        
    });
});

