// `w-full max-w-[25rem]`, never a bare `w-[25rem]`: a fixed 400px card is
// wider than a 390px phone viewport, and because every ancestor between here
// and the editor's scroll container is a flex item with `min-width: auto`, that
// 400px became a floor the whole editor could not shrink below — the roster and
// geospatial editors measured 484px of content inside a 390px box (#1388). The
// cap keeps the intended card size wherever there is room; the `w-full` floor
// lets it shrink instead of forcing its container open. `min-w-0` stops the
// card's own flex children (the label) re-imposing a content-width floor.
export const thumbnailBase =
  'inline-flex items-center bg-cyber-grape text-primary-contrast rounded p-5 w-full max-w-[25rem] min-w-0 transition-[background-color] duration-300 ease-in-out';

export const thumbnailInteractive =
  'cursor-pointer transition-opacity duration-150 ease-in-out hover:opacity-80';

export const thumbnailFullWidth = 'flex w-full';

export const thumbnailExisting = 'bg-info italic';

export const thumbnailIcon = 'flex-none size-[25px] mr-5 [&_svg]:size-full';

export const thumbnailLabel = 'overflow-hidden break-words';
