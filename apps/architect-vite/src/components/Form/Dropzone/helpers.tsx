const getExtension = (filename: string) => {
	const match = /(.[A-Za-z0-9]+)$/.exec(filename);
	if (!match) {
		return null;
	}
	return match[1];
};

const matchExtension = (filename: string, extension: string) =>
	RegExp(`${extension}$`).test(filename.toLowerCase());

const acceptsFile = (accepts: string[]) => (file: File) => accepts.some((accept) => matchExtension(file.name, accept));

export const acceptsFiles = (accepts: string[], files: File[]) => {
	if (!files || files.length === 0) {
		return false;
	}
	return files.every(acceptsFile(accepts));
};

export const getRejectedExtensions = (accepts: string[], files: File[]) =>
	files.reduce((memo: string[], file: File) => {
		if (acceptsFile(accepts)(file)) {
			return memo;
		}
		const extension = getExtension(file.name);
		if (!extension || memo.includes(extension)) {
			return memo;
		}
		memo.push(extension);
		return memo;
	}, []);

export const getAcceptsExtensions = (accepts: string[]) => accepts.map((accept) => accept.substring(1));
