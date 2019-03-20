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
		this._buffer = null;
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
		if (line) { this._done([line]); }
	}
}

class AlbumArt extends Command {
	constructor(mpd, command) {
		super(mpd);
		this._size = 0;
		this._binary = 0;
		this._data = null;
		this._lines = [];

		log("--> mpd", command);
		mpd.write(command + "\n");
	}

	_processBuffer() {
		if (!this._size) {
			let line = this._getLine();
			if (!line) { return; }
			this._lines.push(line);

			if (line.startsWith("ACK")) { // no art!
				this._done(this._lines);
				return;
			}

			this._size = Number(line.split(": ").pop());
			log("size", this._size);
		}

		if (!this._binary) {
			let line = this._getLine();
			if (!line) { return; }
			this._lines.push(line);
			this._binary = Number(line.split(": ").pop());
			log("binary", this._binary);
		}

		if (!this._data) {
			// binary data has this._binary bytes + 1 newline
			if (this._buffer.length >= this._binary+1) {
				this._data = this._buffer.slice(0, this._binary);
				this._buffer = this._buffer.slice(this._binary+1);
				this._lines.push([...this._data]);
				log("data", this._data.length);
			} else { return; }
		} 

		let line = this._getLine();
		if (!line) { return; }
		this._lines.push(line);
		this._done(this._lines);
	}

}

exports.create = function(mpd, command) {
	if (command.startsWith("albumart")) {
		return new AlbumArt(mpd, command);
	} else {
		return new Normal(mpd, command);
	}
	return new Normal(mpd, command);
}

exports.welcome = function(mpd) {
	return new Welcome(mpd);
}
