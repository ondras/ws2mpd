let httpServer = require("http").createServer();
httpServer.listen(8080);

require("..").ws2mpd(httpServer);
