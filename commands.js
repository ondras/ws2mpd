const EventEmitter = require("events");

function log(...args) {
	console.log(Date.now(), ...args);
}

class Command extends EventEmitter {
	constructor(mpd) {
		super();
		this._mpd = mpd;
		this._buffer = Buffer.alloc(0);
		this._dataListener = data => this._onData(data);
		mpd.on("data", this._dataListener);
	}

	_onData(data) {
		log("<-- mpd", data);
		this._buffer = Buffer.concat([this._buffer, data]);
		this._processBuffer();
	}

	_processBuffer() {} // abstract

	_done(data) {
		this._mpd.off("data", this._dataListener);
		this.emit("done", data);
	}

	_getLine() {
		let index = this._buffer.indexOf(0x0a);
		if (index == -1) { return null; }
		let str = this._buffer.slice(0, index).toString("utf8");
		this._buffer = this._buffer.slice(index+1);
		return str;
	}
}

class Normal extends Command {
	constructor(mpd, command) {
		super(mpd);
		this._lines = [];
		log("--> mpd", command);
		mpd.write(command + "\n");
	}

	_processBuffer() {
		while (1) {
			let line = this._getLine();
			if (!line) { break; }
			this._lines.push(line);
			if (line.startsWith("OK") || line.startsWith("ACK")) { return this._done(this._lines); }
		}
	}
}

class Welcome extends Command {
	_processBuffer() {
		let line = this._getLine();
		if (line) { this._done(line); }
	}
}

exports.create = function(mpd, command) {
	return new Normal(mpd, command);
}

exports.welcome = function(mpd) {
	return new Welcome(mpd);
}
