// Keeps the `thumbnail` class as a marker so legacy descendant rules
// (e.g. inside asset-browser/asset.css) still hook onto rendered thumbnails
// until that area is migrated.
export const thumbnailBase =
	"thumbnail inline-flex items-center bg-cyber-grape text-primary-foreground rounded-(--radius) p-(--space-md) w-[25rem] transition-[background-color] duration-(--animation-duration-standard) ease-(--animation-easing)";

export const thumbnailExisting = "bg-info italic";

export const thumbnailIcon = "flex-none w-[25px] mr-(--space-md)";

export const thumbnailLabel = "overflow-hidden break-words";
