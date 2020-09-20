const EventEmitter = require("events");
const log = require("./log.js").log;

class Response extends EventEmitter {
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

class Normal extends Response {
	constructor(mpd) {
		super(mpd);
		this._lines = [];
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

class Password extends Normal {}
class Idle extends Normal {}

class Welcome extends Response {
	_processBuffer() {
		let line = this._getLine();
		if (line) { this._done([line]); }
	}
}

class Binary extends Response {
	constructor(mpd) {
		super(mpd);
		this._size = 0;
		this._binary = 0;
		this._data = null;
		this._lines = [];
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


exports.Queue = class extends EventEmitter {
	constructor(mpd) {
		super();
		this._mpd = mpd;
		this._waiting = [];
		this._current = null;

		this._create(Welcome);
	}

	add(str) {
		if (str == "noidle") {
			if (this._current instanceof Idle) {
				this._mpd.write(str + "\n");
			} else {
				log("throwing away rogue noidle");
			}
			return;
		}
		this._waiting.push(str);
		this._process();
	}

	_process() {
		if (this._current || !this._waiting.length) { return; }
		let str = this._waiting.shift();
		this._create(getCtor(str));
		log("--> mpd", str);
		this._mpd.write(str + "\n");
	}

	_create(ctor) {
		let cmd = new ctor(this._mpd);
		this._current = cmd;

		cmd.on("done", data => {
			if (ctor != Password) { this.emit("response", data); } // do not pass password check result back
			this._current = null;
			this._process();
		});
	}
}

function getCtor(command) {
	switch (true) {
		case command.startsWith("password"): return Password;
		case command.startsWith("idle"): return Idle;
		case command.startsWith("albumart") || command.startsWith("readpicture"): return Binary;
		default: return Normal;
	}
}
