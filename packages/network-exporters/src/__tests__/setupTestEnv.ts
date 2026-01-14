import { Writable } from "node:stream";

interface WriteableStreamWithAsString extends Writable {
	asString: () => Promise<string>;
}

export const makeWriteableStream = (): WriteableStreamWithAsString => {
	const chunks: string[] = [];

	const writable = new Writable({
		write(chunk, _encoding, next) {
			chunks.push(chunk.toString());
			next(null);
		},
	}) as WriteableStreamWithAsString;

	writable.asString = async () =>
		new Promise((resolve, reject) => {
			writable.on("finish", () => {
				resolve(chunks.join(""));
			});
			writable.on("error", (err) => {
				reject(err);
			});
		});

	return writable;
};
