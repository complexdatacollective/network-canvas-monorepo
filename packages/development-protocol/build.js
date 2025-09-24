const { execSync } = require("node:child_process");

execSync("zip -r -0 Development.netcanvas protocol.json assets nodeLabelWorker.js", {
	stdio: "inherit",
});
