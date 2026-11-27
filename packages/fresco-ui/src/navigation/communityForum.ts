export const COMMUNITY_FORUM_URL = 'https://community.networkcanvas.com/';

/**
 * The slug of the forum section that every post from the feedback dialog goes
 * in, "Feedback & Feature Requests".
 */
const FEEDBACK_CATEGORY = 'feedback-and-feature-requests';

/**
 * The longest new-topic link the forum is sent, in characters of the encoded
 * URL. The forum's web server refuses a longer request line with HTTP 414 (URI
 * Too Long): measured in November 2026, a link of about 10,000 characters
 * opened and one of about 10,500 was refused. 8,000 stays 20% under that, so a
 * small change to the server's limit does not break the link, and it matches
 * the 8 KB request-line limit that web servers commonly use by default.
 *
 * Every character outside ASCII is percent-encoded as two to four bytes of
 * three characters each, so a post in Arabic or Chinese reaches this limit at
 * a fraction of the length of one in English.
 */
export const FORUM_TOPIC_URL_MAX_LENGTH = 8000;

/**
 * The forum's new-topic composer, in the feedback section, with the title and
 * body filled in. The person posts it there under their own account; nothing
 * is sent from here.
 */
export function forumTopicUrl({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const url = new URL('new-topic', COMMUNITY_FORUM_URL);
  url.searchParams.set('category', FEEDBACK_CATEGORY);
  if (title !== '') url.searchParams.set('title', title);
  if (body !== '') url.searchParams.set('body', body);
  return url.toString();
}
