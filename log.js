function log(...args) {
	if (!log.enabled) { return; }
	console.log(Date.now(), ...args);
}

log.enabled = true;

exports.log = log;