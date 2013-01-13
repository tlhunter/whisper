var express = require('express');
var web = express();
var server = require('http').createServer(web);
var io = require('socket.io').listen(server);
var geohash = require('ngeohash');

//var redis = require('redis');
//var redisClient = redis.createClient();

var messages = [];

web.use('/', express.static(__dirname + '/public'));

server.listen(80);

io.sockets.on('connection', function(socket) {
    socket.emit('message-to-client', {
        time: new Date(),
        size: 0,
        body: "Socket Connection Established",
    });

    socket.on('message-to-server', function(data) {
        var size = parseInt(data.size, 10);
        var time = new Date();
        var body = data.body.substring(0, 255);
        var coords = {
            lat: data.coords.latitude,
            lon: data.coords.longitude
        };

        var hash = geohash.encode(coords.lat, coords.lon);

        // Transmit to a few different geogash room names, instead of everyone
        console.log(size, time, body, coords, hash);
        io.sockets.emit('message-to-client', {
            time: time,
            size: size,
            body: body
        });
    });
});

