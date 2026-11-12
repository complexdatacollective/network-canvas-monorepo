export const NATIVE_LINK_ROOT_CLASS_NAME =
  'group/link text-link focusable rounded-sm font-semibold';

// The underline grows from where the label starts. `background-position` has
// no logical keywords, so that edge is two physical declarations.
const ANIMATED_UNDERLINE_CLASS_NAME =
  'from-link to-link bg-linear-to-r bg-size-(--link-underline-rest,0%_2px) bg-bottom-left bg-no-repeat rtl:bg-bottom-right pb-0.5 transition-[background-size] duration-200 ease-out';

export const NATIVE_LINK_LABEL_CLASS_NAME = `${ANIMATED_UNDERLINE_CLASS_NAME} group-hover/link:bg-size-(--link-underline-active,100%_2px) group-focus-visible/link:bg-size-(--link-underline-active,100%_2px)`;
