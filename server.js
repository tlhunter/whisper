var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');

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

        // TODO This joins all possible rooms every update. Should disconnect from old rooms and not double reconnect.
        var roomName = '';
        for (var i = geohashAccuracy; i > geohashAccuracy - geohashLevels; i--) {
            roomName = hash.substring(0, i);
            socket.join(roomName);
            console.log(' joined ' + roomName);
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
        for (var i = geohashAccuracy; i > geohashAccuracy - size; i--) {
            roomName = hash.substring(0, i);
            console.log('transmitted ' + uuid + ' message to ' + roomName);
            io.sockets.in(roomName).emit('message-to-client', {
                time: time,
                size: size,
                body: body,
                uuid: uuid
            });
        }
        
    });
});

