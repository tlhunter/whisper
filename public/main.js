$(function() {
    // DOM Queries
    var socket = io.connect();
    var $messages = $('#messages');
    var $messageInput = $('#message');
    var $compose = $('form#compose');
    var $enableGeo = $('#enable-geo');
    var $data = $('#data');


    // My last known location
    var coords = {};

    // Display a message in the DOM
    var displayMessage = function(data) {
        // This probably only works in Chrome...
        var date = new Date(data.time).toLocaleTimeString();
        $messages.prepend('<div class="message size-' + data.size + '"><time>' + date + '</time>: ' + data.body + '</div>');
    };

    // I received a message from the server
    socket.on('message-to-client', function (data) {
        console.log(data);
        displayMessage(data);
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
        $data.html("Latitude: " + c.latitude + "<br />Longitude: " + c.longitude + "<br />Accuracy: " + c.accuracy);
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
        $messageInput.val('');
        var size = $('#size input:checked').val() || null;
        if (!message || !size) {
            displayMessage({
                time: new Date(),
                size: 0,
                body: "You must provide a message and select a size."
            });
            return;
        }

        if (!coords.latitude || !coords.longitude) {
            displayMessage({
                time: new Date(),
                size: 0,
                body: "I am unsure of your position."
            });
            return;
        }

        socket.emit('message-to-server', {
            size: parseInt(size, 10),
            body: message,
            coords: coords
        });
    });
});
