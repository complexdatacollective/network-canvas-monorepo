// Custom hook for body scroll lock
export const useBodyScrollLock = (_isLocked: boolean) => {
	// useEffect(() => {
	// 	if (!isLocked) return;
	// 	const originalOverflow = document.body.style.overflow;
	// 	const originalPaddingRight = document.body.style.paddingRight;
	// 	const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	// 	// Lock body scroll and compensate for scrollbar
	// 	document.body.style.overflow = "hidden";
	// 	if (scrollbarWidth > 0) {
	// 		document.body.style.paddingRight = `${scrollbarWidth}px`;
	// 	}
	// 	return () => {
	// 		document.body.style.overflow = originalOverflow;
	// 		document.body.style.paddingRight = originalPaddingRight;
	// 	};
	// }, [isLocked]);
};
