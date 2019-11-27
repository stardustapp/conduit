// loosely based on https://github.com/Tarang/ddp-server

const WebSocket = require('faye-websocket');
const http = require('http');
const EJSON = require('ejson');

class DDPServerClient {
  constructor(ddpServer, ws) {
    this.server = ddpServer;
    this.ws = ws;
    this.sessionId = new Date().getTime();

    ws.on('message', this.onMessage.bind(this));
    ws.on('close', this.onClose.bind(this));
  }

  sendMessage(data) {
    this.ws.send(EJSON.stringify(data));
  }

  async onMessage(event) {
    var data = EJSON.parse(event.data);
    const {msg, id} = data;

    switch (msg) {
      case "connect":
        this.sendMessage({ server_id: 0 });
        this.sendMessage({ msg: "connected", session_id: this.sessionId });
        break;

      case "method":
        if (data.method in this.server.methods) {
          this.server.methods[data.method].call(null, this, ...data.params).then(result => {
            this.sendMessage({ id, msg: "result", result });
          }, err => {
            console.log('DDP client triggered', err);
            this.sendMessage({ msg: 'result', id, error: {
              error: 500,
              reason: "internal-server-error",
              message: "Internal Server Error, please debug",
              errorType: "Meteor.Error"
            }});
          });
          break;
        }

        console.log("Error method " + data.method + " not found");
        this.sendMessage({ msg: 'result', id, error: {
          error: 404,
          reason: "Method not found",
          errorType: "Meteor.Error"
        }});
        break;

      case 'sub': // id, name, params
        try {
          if (!(data.name in this.server.publications)) {
            const err = new Error(`Subscription '${data.name}' not found [404]`);
            err.isClientSafe = true;
            err.error = 404;
            err.reason = `Subscription '${data.name}' not found`;
            err.errorType = 'Meteor.Error';
            throw err;
          }

          await this.server.publications[data.name].call(null, this, ...data.params);
          this.sendMessage({ msg: 'ready', subs: [id] });

        } catch (err) {
          if (err.isClientSafe) {
            this.sendMessage({ msg: 'nosub', id, error: err});
          } else {
            console.log(err);
            this.sendMessage({ msg: 'nosub', id, error: {
              error: 500,
              reason: "internal-server-error",
              message: "Internal Server Error, please debug",
              errorType: "Meteor.Error",
            }});
          }
        }
        break;

      default:
        console.log('received unimpl pkt from ddp client', data);
    }
  }

  onClose(event) {
    console.log('close', event.code, event.reason);
    this.ws = null;
    this.sessionId = null;
  }
}

var DDPServer = function(opts={}) {
  const server = opts.server || http.createServer((req, res) => {
    console.log(req.method, req.url);
    res.writeHead(404, {"Content-Type": "text/plain"});
    res.write("404 Not found");
    res.end();
  });

  this.methods = {...opts.methods};
  this.publications = {...opts.publications};
  console.log(this);

  server.on('upgrade', (request, socket, body) => {
    if (WebSocket.isWebSocket(request)) {
      var ws = new WebSocket(request, socket, body);
      client = new DDPServerClient(this, ws);
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
