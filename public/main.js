$(function() {
    // DOM Queries
    var socket = io.connect();
    var $messages = $('#messages');
    var $messageInput = $('#message');
    var $compose = $('form#compose');
    var $enableGeo = $('#enable-geo');
    var $data = $('#data');

    $('#size').click(function() {
        var size = $('#size input:checked').val();
        $messageInput.removeClass().addClass('size-'+size);
    });

    $compose.submit(function(event) {
        event.preventDefault();
        var $message = $messageInput.val() || '';
        var $size = $('#size input:checked').val() || null;
    });

    var handleGeoLocation = function(pos) {
        $data.html("Latitude: " + pos.coords.latitude + "<br />Longitude: " + pos.coords.longitude + "<br />Accuracy: " + pos.coords.accuracy);
        console.log(pos);
    };

    var initiateGeoLocation = function() {
        navigator.geolocation.getCurrentPosition(handleGeoLocation);
    };

    $enableGeo.click(initiateGeoLocation);
});
