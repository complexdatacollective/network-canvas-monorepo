/**
 * Extract bundled (zip) protocol from sourcePath to destinationPath
 * @param {string} sourcePath
 * @param {string} destinationPath
 * @return Returns a promise that resolves to the destination path
 */
const extract = (sourcePath, destinationPath) => decompress(sourcePath, destinationPath).then(() => destinationPath);

/**
 * Write a bundled (zip) protocol from sourcePath (working directory) to destinationPath
 * @param {string} sourcePath
 * @param {string} destinationPath
 * @return Returns a promise that resolves to (sourcePath, destinationPath)
 */
const archive = (sourcePath, destinationPath) =>
	new Promise((resolve, reject) => {
		log.debug("archive()", sourcePath, destinationPath);
		const output = fse.createWriteStream(destinationPath);
		const zip = archiver("zip", archiveOptions);

		const handleError = (e) => {
			log.error(e);
			reject(e);
		};

		output.on("close", () => {
			log.debug("archive complete");
			resolve(sourcePath, destinationPath);
		});

		output.on("warning", handleError);
		output.on("error", handleError);

		zip.pipe(output);

		zip.on("warning", handleError);
		zip.on("error", handleError);

		zip.directory(sourcePath, false);

		zip.finalize();
	});

export { archive, extract };
