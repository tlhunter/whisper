$(function() {
    $.ajax({
        dataType: "json",
        url: "/shared-data.json",
        success: go
    });
});

function go(config) {
    var socket = io.connect();

    // DOM Queries
    var $messages = $('#messages');
    var $messageInput = $('#message');
    var $compose = $('form#compose');
    var $enableGeo = $('#enable-geo');
    var $lat = $('#latitude');
    var $lon = $('#longitude');
    var $acc = $('#accuracy');

    $messageInput.focus();

    // Update DOM Labels from the shared JSON file we grabbed
    for (var i = 0; i < 5; i++) {
        $('#size-' + i + '-label div')
            .text(config.levels[i].label)
            .parents('li')
                .attr('title', config.levels[i].description);
    }

    var uuids = [];

    // My last known location
    var coords = {
        latitude: null,
        longitude: null,
        accuracy: null
    };

    // Display a message in the DOM
    var displayMessage = function(data) {
        var date = moment(data.time)
        var date_big = date.format('YYYY MMMM D');
        var date_small = date.format('H:mm:ss');
        var html = '<div style="color: #' + data.color + '" id="msg-' + data.uuid + '" data-uuid="' + data.uuid + '" data-area="' + data.area + '" data-time="' + date + '" data-size="' + data.size + '" class="message size-' + data.size + '"><time>' + date_small + '<span>' + date_big + '</span></time><br />' + data.body + '</div>';
        var found = false;

        // Fimd the first message with a higher timestamp, and put our message before it
        $('.message', $messages).each(function() {
            if (found) return;
            var $el = $(this);
            if (parseInt(($el).attr('data-uuid'), 10) > parseInt(data.uuid, 10)) {
                $el.before(html);
                found = true;
            }
        });

        // If we didn't find a message with a higher timestamp, we must be the most recent, so add it at the end
        if (!found) {
            $messages.append(html);
        }

        // Scroll to bottom of message list
        $('body').scrollTop($('body').prop("scrollHeight"));
    };

    // I received a message from the server
    socket.on('message-to-client', function (data) {
        //console.log('message-to-client', data);

        if (uuids.indexOf(data.uuid) >= 0) {
            return;
        }
        uuids.push(data.uuid);

        displayMessage(data);
    });

    // If we left an area we want to delete the messages associated with it
    socket.on('leave-area', function(data) {
        //console.log('leave-area', data);
        $messages.hide();
        for (var index in data.areas) {
            $('.message[data-area=' + data.areas[index] + ']', $messages).each(function() {
                uuids.splice(uuids.indexOf($(this).attr('data-uuid')), 1);
                $(this).remove();
            });
        }
        $messages.show();
    });

    // OMG ERROR
    socket.on('error', function (data) {
        alert(data.message);
    });

    // One of the size radio buttons were cliced
    $('#size').click(function() {
        var size = $('#size input:checked').val();
        $('#size li.active').removeClass('active');
        $('#size-' + size + '-label').parents('li').addClass('active');
        //$messageInput.removeClass().addClass('size-'+size);
    });

    // Simply transmit our current location
    var transmitLocation = function() {
        socket.emit('location', coords);
    };

    // Update our coordinates values as well as the GUI
    var setNewCoordinates = function(pos) {
        var c = pos.coords;
        //console.log(c);
        $lat.html("Lat: " + Math.floor(c.latitude*10000000)/10000000);
        $lon.html("Lon: " + Math.floor(c.longitude*10000000)/10000000);
        $acc.html("Acc: " + Math.floor(c.accuracy*100)/100 + " meters");
        coords = c;
        transmitLocation();
    };

    // prompt the user for their location, or if permission was granted, get their location
    var initiateGeoLocation = function() {
        navigator.geolocation.getCurrentPosition(setNewCoordinates, null, {
            enableHighAccuracy: true,
            maximumAge: 0
        });
    };

    // Check message timestamps, if they should have expired, remove them (and their no-longer-needed uuid)
    var removeOldMessages = function() {
        $messages.hide();
        // Querying the dom like this is slow and dumb. Should maintian a big array (e.g. the uuid array)

        var now = new Date();
        var $element = null;
        var time = null;
        var expire = null;
        $('.message', $messages).each(function() {
            $element = $(this);

            time = new moment().format($element.attr('data-time')).d;
            if (!time) return;

            var size = parseInt($element.attr('data-size'), 10);
            if (size >= config.levels.length) return;

            expire = config.levels[size].expiration;
            if (!expire) return;

            if (now - time > expire * 1000) {
                $element.remove();
                uuids.splice(uuids.indexOf($element.attr('data-uuid')), 1);
            }
        });

        $messages.show();
    };

    setInterval(initiateGeoLocation, 17*1000);
    setInterval(removeOldMessages, 11*1000);

    initiateGeoLocation();

    // Grabbing onto the form submit for handling an update. Could listen to enter or something I suppose...
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

        // Clear message input
        $messageInput.val('');

        socket.emit('message-to-server', {
            size: parseInt(size, 10),
            body: message,
            coords: coords
        });
    });

    $('#refresh').click(function() {
        initiateGeoLocation();
    });
}
