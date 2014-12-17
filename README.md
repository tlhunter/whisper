# Whisper
Ephemeral, geo-location based semi-anonymous communication

* Messages can be loud or quiet
* Loud messages have a larger radius and die quicker
* Quiet messages have a smaller radius and last longer

## Screenshot
![Screenshot](https://raw.github.com/tlhunter/whisper/master/screenshot.png)

## Usage

```console
$ git clone git@github.com:tlhunter/whisper.git
$ cd whisper
$ npm install
$ ./server.js 8000
```

## Technologies
* REDIS for storing messages
* Node.js for web server
* HTML5 Geolocation
* Socket.IO for Websockets

## Data
Due to the expiring, small data size, and rate of access, REDIS seems the appropriate choice

* Latitude, Longitude, Geohash
* Message (limit 255 characters)
* Size
* Date
* IP Address (for spam purposes, might just store MD5(IP+SALT) for anonymity)

## Interface
This will be a webpage, very simple, works on mobile, uses HTML5 geolocation API

* Listing of visible messages
* Message input box
* Loudness slider
* Send button

## Debugging
This chrome extension makes debugging a bit easier (so you don't have to walk around with a laptop):
[Manual Geolocation](https://chrome.google.com/webstore/detail/manual-geolocation/mfodligkojepnddfhkbkodbamcagfhlo)

> TODO: This plugin no longer exists! How will we ever test Whisper!

## License
BSD
