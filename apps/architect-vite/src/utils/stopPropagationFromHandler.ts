const stopPropagationFromHandler =
	<T extends (...args: never[]) => unknown>(f: T) =>
	(e: { stopPropagation: () => void }, ...rest: unknown[]) => {
		e.stopPropagation();
		(f as unknown as (...args: unknown[]) => unknown)(e, ...rest);
	};

export default stopPropagationFromHandler;
