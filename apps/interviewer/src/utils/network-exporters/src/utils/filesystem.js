const fse = require("fs-extra");
const fs = require("fs");
const { app } = require("electron");
const path = require("path");
const { trimChars } = require("lodash/fp");

const trimPath = trimChars("/ ");

const splitUrl = (targetPath) => {
	const pathParts = trimPath(targetPath).split("/");
	const baseDirectory = `${pathParts.slice(0, -1).join("/")}/`;
	const directory = `${pathParts.slice(-1)}`;
	return [baseDirectory, directory];
};

const inSequence = (items, apply) => items.reduce((result, item) => result.then(() => apply(item)), Promise.resolve());

const tempDataPath = () => app.getPath("temp");

const userDataPath = () => app.getPath("userData");

const appPath = () => app.getAppPath();

const readFile = (filename) => fse.readFile(filename, null);

const writeFile = (filePath, data) => fse.writeFile(filePath, data);

const createDirectory = (targetPath) =>
	fse
		.mkdir(targetPath)
		.then(() => targetPath)
		.catch((error) => {
			if (error.code !== "EEXISTS") {
				return Promise.reject(error);
			}
			throw error;
		});

const rename = (oldPath, newPath) => fse.rename(oldPath, newPath);

const copy = (oldPath, newPath) => fse.copy(oldPath, newPath);

const removeDirectory = (targetPath) =>
	new Promise((resolve, reject) => {
		try {
			if (!targetPath.includes(userDataPath()) && !targetPath.includes(tempDataPath())) {
				reject(new Error("Attempted to remove path outside of safe directories!"));
				return;
			}
			fse.rmdir(targetPath, { recursive: true }, resolve);
		} catch (error) {
			if (error.code !== "EEXISTS") {
				reject(error);
			}
			throw error;
		}
	});

const writeStream = (destination, stream) =>
	new Promise((resolve, reject) => {
		try {
			stream
				.pipe(fse.createWriteStream(destination))
				.on("error", reject)
				.on("finish", () => {
					resolve(destination);
				});
		} catch (error) {
			reject(error);
		}
	});

const createWriteStream = (destination) =>
	new Promise((resolve, reject) => {
		try {
			const ws = fse.createWriteStream(destination);
			resolve(ws);
		} catch (error) {
			reject(error);
		}
	});

const ensurePathExists = (targetPath) => {
	if (!targetPath) {
		throw new Error("No path provided to ensurePathExists");
	}

	if (!fs.existsSync(targetPath)) {
		fs.mkdirSync(targetPath, { recursive: true });
	}

	return Promise.resolve();
};

module.exports = {
	appPath,
	copy,
	createDirectory,
	createWriteStream,
	ensurePathExists,
	inSequence,
	readFile,
	removeDirectory,
	rename,
	splitUrl,
	tempDataPath,
	userDataPath,
	writeFile,
	writeStream,
};
