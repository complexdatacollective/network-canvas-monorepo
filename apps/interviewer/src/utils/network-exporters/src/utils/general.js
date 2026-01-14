const { first } = require("lodash");
const { dialog, shell, BrowserWindow } = require("electron");
const fse = require("fs-extra");
const { ExportError, ErrorMessages } = require("../errors/ExportError");
const {
	caseProperty,
	sessionProperty,
	protocolProperty,
	sessionExportTimeProperty,
	codebookHashProperty,
} = require("@codaco/shared-consts");

const verifySessionVariables = (sessionVariables) => {
	if (
		!sessionVariables[caseProperty] ||
		!sessionVariables[sessionProperty] ||
		!sessionVariables[protocolProperty] ||
		!sessionVariables[sessionExportTimeProperty] ||
		!sessionVariables[codebookHashProperty]
	) {
		throw new ExportError(ErrorMessages.MissingParameters);
	}

	return true;
};

const sleep =
	(time = 2000) =>
	(passThrough) =>
		new Promise((resolve) => setTimeout(() => resolve(passThrough), time));

const handlePlatformSaveDialog = (zipLocation, filename) =>
	new Promise((resolve, reject) => {
		if (!zipLocation) {
			reject();
			return;
		}

		const browserWindow = first(BrowserWindow.getAllWindows());

		dialog
			.showSaveDialog(browserWindow, {
				filters: [{ name: "zip", extensions: ["zip"] }],
				defaultPath: filename,
			})
			.then(({ canceled, filePath }) => {
				if (canceled) {
					resolve(true);
					return;
				}

				fse
					.copy(zipLocation, filePath)
					.then(() => {
						shell.showItemInFolder(filePath);
						resolve();
					})
					.catch(reject);
			});
	});

class ObservableValue {
	constructor(value) {
		this.valueInternal = value;
		this.valueListener = () => {};
	}

	set value(val) {
		this.valueInternal = val;
		this.valueListener(val);
	}

	get value() {
		return this.valueInternal;
	}

	registerListener(listener) {
		this.valueListener = listener;
	}
}

module.exports = {
	verifySessionVariables,
	sleep,
	handlePlatformSaveDialog,
	ObservableValue,
};
