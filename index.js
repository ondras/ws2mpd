#!/usr/bin/env node

const log = require("./log.js").log;
const Queue = require("./queue").Queue;

function initConnection(request) {
	let ws = request.accept();
	log("ws connection accepted from origin", request.origin);

	let parts = (request.resourceURL.query.server || "").split(":");
	let host = parts[0] || "localhost";
	let port = Number(parts[1]) || 6600;
	log(`connecting to mpd at ${host}:${port}`);

	let mpd = new (require("net").Socket)();
	mpd.setTimeout(0);
	mpd.connect(port, host);

	// data coming from the response parser
	let queue = new Queue(mpd);
	queue.on("response", data => {
		log("ws <--", data);
		ws.send(JSON.stringify(data));
	});

	// data going into the response parser
	ws.on("message", message => {
		log("ws -->", message.utf8Data);
		queue.add(message.utf8Data);
	});

	// client closes
	ws.on("close", (reasonCode, description) => {
		log(`ws ${ws.remoteAddress} disconnected`);
		mpd.end();
	});

	// server closes
	mpd.on("close", () => {
		log("mpd disconnected");
		ws.close();
	});

	// fail to conect
	mpd.on("error", () => {
		log("mpd connection error");
		ws.close();
	});
}

exports.logging = function(enabled) {
	log.enabled = enabled;
}

exports.ws2mpd = function(httpServer, requestValidator) {
	function ready() { log("ws2mpd attached to a http server", httpServer.address()); }
	(httpServer.listening ? ready() : httpServer.on("listening", ready));

	let wsServer = new (require("websocket").server)({
		httpServer,
		autoAcceptConnections: false
	});

	wsServer.on("request", request => {
		if (requestValidator && !requestValidator(request)) {
			log("rejecting connection from origin", request.origin);
			return request.reject();
		}
		initConnection(request);
	});
}
