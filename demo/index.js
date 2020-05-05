let httpServer = require("http").createServer();
httpServer.listen(8080);

let mod = require("..");
mod.logging(true);
mod.ws2mpd(httpServer);
