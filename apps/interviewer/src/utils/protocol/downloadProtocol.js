/* global FileTransfer */

import uuid from "uuid/v4";
import friendlyErrorMessage from "../../utils/friendlyErrorMessage";
import inEnvironment from "../Environment";
import environments from "../environments";
import { tempDataPath, writeFile } from "../filesystem";

const getURL = (uri) =>
	new Promise((resolve, reject) => {
		try {
			resolve(new URL(uri));
		} catch (error) {
			reject(error);
		}
	});

const getProtocolName = () => uuid(); // generate a filename

const urlError = friendlyErrorMessage(
	"The location you gave us doesn't seem to be a valid URL. Check the location, and try again.",
);
const networkError = friendlyErrorMessage(
	"We weren't able to fetch your protocol. Your device may not have an active network connection, or you may have mistyped the URL. Ensure you are connected to a network, double check your URL, and try again.",
);
const fileError = friendlyErrorMessage(
	"The protocol could not be saved to your device. You might not have enough storage available. ",
);

/**
 * Download a protocol from a remote URL.
 *
 * @param {string} uri
 * @return {string} output filepath
 */
const downloadProtocol = inEnvironment((environment) => {
	if (environment === environments.ELECTRON) {
		return async (uri) => {
			const destination = `${tempDataPath()}/${getProtocolName()}`;

			const url = await getURL(uri).catch(urlError);

			const response = await fetch(url.href).catch(networkError);
			if (!response.ok) {
				throw networkError(new Error(`HTTP ${response.status}`));
			}

			const arrayBuffer = await response.arrayBuffer();
			const data = new Uint8Array(arrayBuffer);
			await writeFile(destination, data).catch(fileError);

			return destination;
		};
	}

	if (environment === environments.CORDOVA) {
		return (uri) => {
			const promisedResponse = getURL(uri)
				.then((url) => url.href)
				.catch(urlError)
				.then(
					(href) =>
						new Promise((resolve, reject) => {
							// The filetransfer plugin requires a folder to write to
							const destinationWithFolder = `${tempDataPath()}${getProtocolName()}`;

							const fileTransfer = new FileTransfer();
							fileTransfer.download(
								href,
								destinationWithFolder,
								() => resolve(destinationWithFolder),
								(error) => reject(error),
							);
						}),
				);

			return promisedResponse.catch((error) => {
				const getErrorMessage = ({ code }) => {
					if (code === 3) return networkError;
					return urlError;
				};

				getErrorMessage(error)(error);
			});
		};
	}

	return () => Promise.reject(new Error("downloadProtocol() not available on platform"));
});

export default downloadProtocol;
