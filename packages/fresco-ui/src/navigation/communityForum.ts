export const COMMUNITY_FORUM_URL = 'https://community.networkcanvas.com/';

/**
 * The community forum's sections a person can post in, by the slug its
 * new-topic link takes and the name it shows; Announcements is the team's own.
 * The names stay in English, as the forum shows them.
 */
export const FORUM_SECTIONS = {
  feedback: {
    slug: 'feedback-and-feature-requests',
    name: 'Feedback & Feature Requests',
  },
  help: { slug: 'help-support', name: 'Help & Support' },
  general: { slug: 'general', name: 'General Conversation' },
} as const;

export type ForumSection = keyof typeof FORUM_SECTIONS;

export const FORUM_SECTION_IDS = [
  'feedback',
  'help',
  'general',
] as const satisfies readonly ForumSection[];

export const isForumSection = (value: unknown): value is ForumSection =>
  FORUM_SECTION_IDS.some((section) => section === value);

/**
 * The forum's new-topic composer, in `section`, with the title and body filled
 * in. The person posts it there under their own account; nothing is sent from
 * here.
 */
export function forumTopicUrl({
  section,
  title,
  body,
}: {
  section: ForumSection;
  title: string;
  body: string;
}) {
  const url = new URL('new-topic', COMMUNITY_FORUM_URL);
  url.searchParams.set('category', FORUM_SECTIONS[section].slug);
  if (title !== '') url.searchParams.set('title', title);
  if (body !== '') url.searchParams.set('body', body);
  return url.toString();
}
