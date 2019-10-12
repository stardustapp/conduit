// loosely based on https://github.com/Tarang/ddp-server

const WebSocket = require('faye-websocket');
const http = require('http');
const EJSON = require('ejson');

var DDPServer = function(opts) {
  const server = opts.server || http.createServer((req, res) => {
    console.log(req.method, req.url);
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("404 Not found");
    res.end();
  });
  const methods = {...opts.methods};

  server.on('upgrade', function(request, socket, body) {
    function sendMessage(data) {
      ws.send(EJSON.stringify(data));
    }

    if (WebSocket.isWebSocket(request)) {
      var ws = new WebSocket(request, socket, body);
      var session_id = new Date().getTime();

      ws.on('message', function(event) {
        var data = EJSON.parse(event.data);
        const {msg, id} = data;

        switch (msg) {
          case "connect":
            sendMessage({ server_id: 0 });
            sendMessage({ msg: "connected", session_id });
            break;

          case "method":
            if (data.method in methods) {
              methods[data.method].apply(this, data.params).then(result => {
                sendMessage({ id, msg: "result", result });
              }, err => {
                console.log('DDP client triggered', err);
                sendMessage({ id, error: {
                  error: 500,
                  reason: "Internal Server Error",
                  errorType: "Meteor.Error"
                }});
              });
              break;
            }

            console.log("Error method " + data.method + " not found");
            sendMessage({ id, error: {
              error: 404,
              reason: "Method not found",
              errorType: "Meteor.Error"
            }});
            break;

          case 'sub': // id, name, params
            console.log('TODO: handling sub')
            sendMessage({ msg: 'added', collection: 'interfaces', id: 'CZevr7ikH6AGhvDc5', fields: {} });
            sendMessage({ msg: 'ready', subs: [id] });
            break;

          default:
            console.log('received unimpl pkt from ddp client', data);
        }
      });

      ws.on('close', function(event) {
        console.log('close', event.code, event.reason);
        ws = null;
        session_id = null;
      });
    }
  });

  this.listen = function(port) {
    // assumed that .listen() should be called outside, if server is passed in options
    if (opts.server) {
      return;
    }
    server.listen(port);
  };
};

exports.DDPServer = DDPServer;
