/**
 * This is an example of a basic node.js script that performs
 * the Authorization Code oAuth2 flow to authenticate against
 * the Spotify Accounts.
 *
 * For more information, read
 * https://developer.spotify.com/web-api/authorization-guide/#authorization_code_flow
 */

var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var port = 8888;
var baseUrl = process.env.BASE_URL || 'http://localhost';

var client_id = process.env.CLIENT_ID; // Your client id
var client_secret = process.env.CLIENT_SECRET; // Your client secret
var redirect_uri = baseUrl + ':' + port + '/callback'; // Your redirect uri

var echojs = require('echojs');

var echo = echojs({
  key: 'UQZFWAPECBUEJSNX6'
});

var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

io.on('connection', function (socket) {
  console.log('connected!');

  socket.on('getArtistsByMood', function(data) {

      var mood = data.mood;

      echo('artist/search').get({
        format: 'json',
        genre: 'blues',
        mood: mood,
        results: 5,
        callback: bustClientCache()
      }, function (err, json) {
        if (err) {
          console.error('Received error code: %s', err.status);
          return;
        }

        var artists = json.response.artists;
        var l = artists.length;
        var artist_seeds = [];
        for (var i = 0; i < l; i++) {
          artist_seeds.push(artists[i].id);
        }

        echo('playlist/static').get({
          format: 'json',
          type: 'artist',
          artist: artist_seeds,
          results: 20,
          //song_selection: data.valence ? data.valence == 1 ? 'valence-top' : 'valence-bottom' : false,
          bucket: ['id:spotify', 'tracks'],
          callback: bustClientCache()
        }, function (err, json) {
          if (err) {
            console.error('Received error code: %s', err.status);
            return;
          }
          socket.emit('gotTracks', {
            data: json.response,
            mood: mood
          });
        });
      });
  });
});

app.use(express.static(__dirname + '/public'));

app.get('/login', function(req, res) {

  // your application requests authorization
  var scope = 'user-read-private user-read-email';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri
    }));
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  var code = req.query.code;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code: code,
      redirect_uri: redirect_uri,
      grant_type: 'authorization_code',
      client_id: client_id,
      client_secret: client_secret
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {

      var access_token = body.access_token,
          refresh_token = body.refresh_token;

      var options = {
        url: 'https://api.spotify.com/v1/me',
        headers: { 'Authorization': 'Bearer ' + access_token },
        json: true
      };

      // use the access token to access the Spotify Web API
      request.get(options, function(error, response, body) {
        console.log(body);
      });

      // we can also pass the token to the browser to make requests from there
      res.redirect('/#' +
        querystring.stringify({
          access_token: access_token,
          refresh_token: refresh_token
        }));
    }
  });
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});

console.log('Listening on ' + port);
server.listen(port);

//

function getRandomNumber(low, high, flt) {
  if (flt) {
    return Math.random()*(high-(low-1)) + low;
  }
  return Math.floor(Math.random()*(high-(low-1))) + low;
};


function bustClientCache() {
  return getRandomNumber(0, 100000);
}
