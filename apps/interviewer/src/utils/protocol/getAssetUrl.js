/**
 * Get asset URL utility with secure API support.
 */

import inEnvironment, { isElectron } from "../Environment";
import { pathSync } from "../electronAPI";
import environments from "../environments";
import { resolveFileSystemUrl } from "../filesystem";
import protocolPath from "./protocolPath";

const isRequired = (param) => {
	throw new Error(`${param} is required`);
};

const assetUrl = (environment) => {
	if (environment === environments.ELECTRON) {
		return (protocolUID = isRequired("protocolUID"), assetPath = isRequired("assetPath")) => {
			const fullPath = pathSync.join(protocolUID, "assets", assetPath);
			const encodedURI = encodeURIComponent(fullPath);
			return Promise.resolve(`asset://${encodedURI}`);
		};
	}

	if (environment === environments.CORDOVA) {
		return (protocolUID = isRequired("protocolUID"), assetPath = isRequired("assetPath")) => {
			const sourceFilename = protocolPath(protocolUID, `assets/${assetPath}`);
			return resolveFileSystemUrl(sourceFilename).then((url) => {
				const toURL = url.toURL();

				// Check for development mode using secure API
				const isDevelopment = isElectron() ? window.electronAPI?.env?.isDevelopment : false;

				if (isDevelopment) {
					console.info("assetUrl: replacing host with localhost");
					const parsedUrl = new URL(toURL);
					parsedUrl.host = "localhost";
					parsedUrl.port = "";
					return parsedUrl.toString();
				}

				return toURL;
			});
		};
	}

	if (environment === environments.WEB) {
		return (protocolUID = isRequired("protocolUID"), assetPath = isRequired("assetPath")) =>
			Promise.resolve(`/protocols/${protocolUID}/assets/${assetPath}`);
	}

	return () => Promise.reject(new Error("assetUrl is not supported on this platform"));
};

export default inEnvironment(assetUrl);
