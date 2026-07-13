export const NATIVE_LINK_ROOT_CLASS_NAME =
  'group text-link focusable rounded-sm font-semibold';

const ANIMATED_UNDERLINE_CLASS_NAME =
  'from-link to-link bg-linear-to-r bg-[length:0%_2px] bg-bottom-left bg-no-repeat pb-0.5 transition-[background-size] duration-200 ease-out';

export const NATIVE_LINK_LABEL_CLASS_NAME = `${ANIMATED_UNDERLINE_CLASS_NAME} group-hover:bg-[length:100%_2px] group-focus-visible:bg-[length:100%_2px]`;
