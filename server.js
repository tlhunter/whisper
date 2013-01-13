var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');
var _ = require('underscore')._;

//var redis = require('redis');
//var redisClient = redis.createClient();

var messages = [];
var uuid = 1;
var geohashAccuracy = 9;
var geohashLevels = 5;

web.use('/', express.static(__dirname + '/public'));

server.listen(80);

io.sockets.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: new Date(),
        size: 0,
        body: "Socket Connection Established",
    });

    socket.on('location', function(coords) {
        var hash = geohash.encode(coords.latitude, coords.longitude, geohashAccuracy);

        // This is a list of all the rooms I should be in based on my geo hash
        var roomsToBeIn = [];

        // Building list of rooms to be in
        var roomsCurrentlyIn = _.keys(io.sockets.manager.roomClients[socket.id]);
        roomsCurrentlyIn.shift(); // remove first blank room
        for (index in roomsCurrentlyIn) {
            roomsCurrentlyIn[index] = roomsCurrentlyIn[index].slice(1); // Remove room leading slash
        }

        for (var i = geohashAccuracy; i > geohashAccuracy - geohashLevels; i--) {
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
        uuid++;
        var size = parseInt(data.size, 10);
        var time = new Date();
        var body = data.body.substring(0, 255);
        var coords = data.coords;
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

        var hash = geohash.encode(coords.latitude, coords.longitude, geohashAccuracy);

        console.log(size, time, body, coords, hash);
        var roomName = hash.substring(0, geohashAccuracy - size);
        console.log('transmitted ' + uuid + ' message to ' + roomName);
        io.sockets.in(roomName).emit('message-to-client', {
            time: time,
            size: size,
            body: body,
            uuid: uuid
        });
        
    });
});

