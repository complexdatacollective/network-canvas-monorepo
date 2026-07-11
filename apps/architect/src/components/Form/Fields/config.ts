export const ALLOWED_MARKDOWN_TAGS = [
  'br',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'p',
  'strong',
  'hr',
  'a',
] as const;

const _ALLOWED_MARKDOWN_PROMPT_TAGS = ['p', 'em', 'strong'] as const;
