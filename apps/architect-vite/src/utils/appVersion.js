import pkg from "../../package.json" with { type: "json" };

const appVersion = pkg.version;

export { appVersion };
