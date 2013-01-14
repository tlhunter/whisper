$(function() {
    // DOM Queries
    var socket = io.connect();
    var $messages = $('#messages');
    var $messageInput = $('#message');
    var $compose = $('form#compose');
    var $enableGeo = $('#enable-geo');
    var $data = $('#data');

    var uuids = [];

    // My last known location
    var coords = {
        latitude: null,
        longitude: null,
        accuracy: null
    };

    // Display a message in the DOM
    var displayMessage = function(data) {
        // This probably only works in Chrome...
        var date = new Date(data.time).toLocaleTimeString();
        $messages.prepend('<div data-uuid="' + data.uuid + '" class="message size-' + data.size + '"><time>' + date + '</time>: ' + data.body + '</div>');
    };

    // I received a message from the server
    socket.on('message-to-client', function (data) {
        console.log(data);

        if (uuids.indexOf(data.uuid) >= 0) {
            return;
        }
        uuids.push(data.uuid);

        displayMessage(data);
    });

    // OMG ERROR
    socket.on('error', function (data) {
        alert(data.message);
    });

    // One of the size radio buttons were cliced
    $('#size').click(function() {
        var size = $('#size input:checked').val();
        $messageInput.removeClass().addClass('size-'+size);
    });

    var transmitLocation = function() {
        socket.emit('location', coords);
    };

    var setNewCoordinates = function(pos) {
        var c = pos.coords;
        console.log(c);
        $data.html("Lat: " + c.latitude + "<br />Lon: " + c.longitude + "<br />Acc: " + c.accuracy + " meters");
        coords = c;
        transmitLocation();
    };

    var initiateGeoLocation = function() {
        navigator.geolocation.getCurrentPosition(setNewCoordinates);
    };

    setInterval(initiateGeoLocation, 30*1000);

    initiateGeoLocation();

    $compose.submit(function(event) {
        event.preventDefault();
        initiateGeoLocation();
        var message = $messageInput.val() || '';
        var size = parseInt($('#size input:checked').val(), 10);
        if (size === null || size === '') {
            console.log('hacker');
            return;
        }

        if (!message) {
            displayMessage({
                time: new Date(),
                size: 5,
                body: "You must provide a message."
            });
            return;
        }

        if (!coords.latitude || !coords.longitude) {
            displayMessage({
                time: new Date(),
                size: 5,
                body: "I am unsure of your position."
            });
            return;
        }

        $messageInput.val('');

        socket.emit('message-to-server', {
            size: parseInt(size, 10),
            body: message,
            coords: coords
        });
    });
});
