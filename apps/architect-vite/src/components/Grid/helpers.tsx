export const convertSize = (size: number): string => {
	switch (size) {
		case 2:
			return "MEDIUM";
		case 4:
			return "LARGE";
		default:
			return "SMALL";
	}
};

export const parseSize = (size: string): number => {
	switch (size) {
		case "MEDIUM":
			return 2;
		case "LARGE":
			return 4;
		default:
			return 1;
	}
};

type GridItem = {
	size: string;
	id: string;
};

export const getRemainingSpace = (items: GridItem[] = [], capacity = 0): number =>
	items.reduce((acc, { size }) => acc - parseSize(size), capacity);

export const trimSize = (from: number, to: number, items: GridItem[], capacity: number): number => {
	const remainingSpace = getRemainingSpace(items, capacity);
	if (to !== 3) {
		return to;
	}
	if (from < 3 && remainingSpace === 4) {
		return 4;
	}
	return 2;
};

export const getLayout = (items: GridItem[] = [], capacity = 4) => {
	const remainingSpace = getRemainingSpace(items, capacity);

	const layout = items.reduce(
		(memo, { id, size }) => {
			const y = memo.reduce((acc, { h }) => acc + h, 0);
			const h = parseSize(size);
			const maxH = h + remainingSpace === 3 ? 2 : h + remainingSpace;

			return [
				...memo,
				{
					i: id,
					y,
					w: 1,
					h,
					x: 0,
					maxH,
				},
			];
		},
		[
			{
				/**
				 * Fixes a bug with react-grid-layout not updating when layout prop
				 * is updated, but hasn't changed, react-grid-layout may ignore prop.
				 * This forces an update every time.
				 */
				i: Math.random().toString(),
				y: 0,
				w: 0,
				h: 0,
				x: 0,
			},
		],
	);

	return layout;
};
