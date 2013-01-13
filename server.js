var express = require('express');
var web = express();
var server = require('http').createServer(web);
var socket = require('socket.io').listen(server);

web.use('/', express.static(__dirname + '/public'));

server.listen(80);
