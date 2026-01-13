const path = require("path");
const fse = require("fs-extra");
const archiver = require("archiver");

const zlibDefaultCompression = -1;

const archiveOptions = {
	zlib: { level: zlibDefaultCompression },
	store: true,
};

/**
 * Write a bundled (zip) from source files
 * @param {string[]} sourcePaths
 * @param {string} tempDir directory to write zip to
 * @param {string} filename name for the zip file (without extension)
 * @param {function} updateCallback callback for progress updates
 * @param {function} shouldContinue function that returns false if export was cancelled
 * @return Returns a promise that resolves to the destination path
 */
const archive = (sourcePaths, tempDir, filename, updateCallback, shouldContinue) => {
	const filenameWithExtension = `${filename}.zip`;
	const destinationPath = path.join(tempDir, filenameWithExtension);

	return new Promise((resolve, reject) => {
		const output = fse.createWriteStream(destinationPath);
		const zip = archiver("zip", archiveOptions);

		output.on("close", () => {
			resolve(destinationPath);
		});

		output.on("warning", reject);
		output.on("error", reject);

		zip.pipe(output);

		zip.on("warning", reject);
		zip.on("error", reject);
		zip.on("progress", (progress) => {
			if (!shouldContinue()) {
				zip.abort();
				resolve();
				return;
			}
			const percent = (progress.entries.processed / progress.entries.total) * 100;
			updateCallback(percent);
		});

		sourcePaths.forEach((sourcePath) => {
			zip.file(sourcePath, { name: path.basename(sourcePath) });
		});

		zip.finalize();
	});
};

module.exports = archive;
