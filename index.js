#!/usr/bin/env node

const commands = require("./commands");

function log(...args) {
	console.log(Date.now(), ...args);
}

function initConnection(ws, server, port) {
	log(`ws connection accepted, connecting to ${server}:${port}`);

	let mpd = new (require("net").Socket)();
	mpd.setTimeout(0);
	mpd.connect(port, server);

	let commandQueue = [];
	let command = null;

	function waitForCommand(command) {
		command.on("done", data => {
			log("ws <--", data);
			ws.send(data);
			command = null;
			processQueue();
		});
	}

	function processQueue() {
		if (command || !commandQueue.length) { return; }
		command = commands.create(mpd, commandQueue.shift());
		waitForCommand(command);
	}

	ws.on("message", message => {
		log("ws -->", message.utf8Data);
		commandQueue.push(message.utf8Data);
		processQueue();
	});

	ws.on("close", (reasonCode, description) => {
		log(`ws ${ws.remoteAddress} disconnected`);
		mpd.end();
	});

	mpd.on("close", () => {
		log("mpd disconnected");
		ws.close();
	});

	waitForCommand(commands.welcome(mpd));
}

function onRequest(request) {
	let s = request.resourceURL.query.server || "";
	let r = s.match(/^([^:]+)(:([0-9]+))?$/);
	if (!r) { return request.reject(); }
	let connection = request.accept(null, request.origin);

	initConnection(connection, r[1], r[3] || 6600);
}

exports.ws2mpd = function(httpServer) {
	function ready() { log("ws2mpd attached to a http server", httpServer.address()); }
	(httpServer.listening ? ready() : httpServer.on("listening", ready));

	let wsServer = new (require("websocket").server)({
		httpServer,
		autoAcceptConnections: false
	});
	wsServer.on("request", onRequest);
}
