import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * The copy of the forum's landing page. Nothing imports these descriptors:
 * `i18n:extract` reads them into `locales/en.json`, the build writes every
 * catalog into the theme's Discourse translations, and the landing page's
 * JavaScript reads each one by its id without the `communityTheme.` prefix
 * (`communityTheme.landing.hero.title` is `themePrefix("landing.hero.title")`).
 */
export const landingMessages = defineMessages({
  heroTitle: {
    id: 'communityTheme.landing.hero.title',
    defaultMessage: 'Get help and share ideas with other Network Canvas users',
    description:
      'Main heading of the community forum home page, beside an illustration of researchers talking.',
  },
  heroLead: {
    id: 'communityTheme.landing.hero.lead',
    defaultMessage:
      'Ask a question, suggest an improvement, or talk about network research with people who use Network Canvas in their studies.',
    description: 'The sentence under the main heading of the forum home page.',
  },
  heroNews: {
    id: 'communityTheme.landing.hero.news',
    defaultMessage: 'News',
    description:
      'Label on a small link above the main heading that opens the newest announcement from the Network Canvas team; the announcement title follows it.',
  },
  routesTitle: {
    id: 'communityTheme.landing.routes.title',
    defaultMessage: 'Where should I post?',
    description:
      'Heading above four cards that each describe one forum category and when to post in it.',
  },
  routesLead: {
    id: 'communityTheme.landing.routes.lead',
    defaultMessage:
      'Choose what you need, and your post will reach the people who can help.',
    description: 'Sentence under the "Where should I post?" heading.',
  },
  helpTitle: {
    id: 'communityTheme.landing.routes.help.title',
    defaultMessage: 'Get help',
    description:
      'Heading of the card for the forum category where users ask for help and report problems.',
  },
  helpBody: {
    id: 'communityTheme.landing.routes.help.body',
    defaultMessage:
      'Ask how to do something, or report a problem with Architect, Interviewer or Fresco.',
    description:
      'Explains when to post in the help category. Architect, Interviewer and Fresco are product names; do not translate them.',
  },
  helpAction: {
    id: 'communityTheme.landing.routes.help.action',
    defaultMessage: 'Ask a question',
    description:
      'Button that starts a new topic in the help category (signing in first if needed).',
  },
  ideasTitle: {
    id: 'communityTheme.landing.routes.ideas.title',
    defaultMessage: 'Suggest an idea',
    description:
      'Heading of the card for the forum category for feature requests and feedback.',
  },
  ideasBody: {
    id: 'communityTheme.landing.routes.ideas.body',
    defaultMessage:
      'Request a feature, or tell us how the software could work better for your research.',
    description:
      'Explains when to post in the feature-request category. "Us" is the Network Canvas team.',
  },
  ideasAction: {
    id: 'communityTheme.landing.routes.ideas.action',
    defaultMessage: 'Share an idea',
    description:
      'Button that starts a new topic in the feature-request category.',
  },
  conversationTitle: {
    id: 'communityTheme.landing.routes.conversation.title',
    defaultMessage: 'Talk with other researchers',
    description:
      'Heading of the card for the general discussion category, where users talk with each other.',
  },
  conversationBody: {
    id: 'communityTheme.landing.routes.conversation.body',
    defaultMessage:
      'Discuss study design and network methods, or tell others about your work.',
    description: 'Explains when to post in the general discussion category.',
  },
  conversationAction: {
    id: 'communityTheme.landing.routes.conversation.action',
    defaultMessage: 'Start a conversation',
    description:
      'Button that starts a new topic in the general discussion category.',
  },
  newsTitle: {
    id: 'communityTheme.landing.routes.news.title',
    defaultMessage: 'Hear what’s new',
    description:
      'Heading of the card for the announcements category, where only the Network Canvas team posts.',
  },
  newsBody: {
    id: 'communityTheme.landing.routes.news.body',
    defaultMessage:
      'Releases, tutorials and news from the Network Canvas team.',
    description: 'Describes what the announcements category contains.',
  },
  newsAction: {
    id: 'communityTheme.landing.routes.news.action',
    defaultMessage: 'Read the news',
    description: 'Button that opens the announcements category.',
  },
  browse: {
    id: 'communityTheme.landing.routes.browse',
    defaultMessage:
      '{count, plural, one {Browse # topic} other {Browse # topics}}',
    description:
      'Link on each category card that opens the category; the number is how many topics it has.',
  },
  latestTopic: {
    id: 'communityTheme.landing.routes.latestTopic',
    defaultMessage: 'Most recent topic',
    description:
      'Small label above the title of the newest topic in a category, on that category’s card.',
  },
  docsText: {
    id: 'communityTheme.landing.docs.text',
    defaultMessage:
      'Looking for step-by-step guides? The documentation covers building protocols, running interviews and exporting data.',
    description:
      'Note under the category cards pointing to the Network Canvas documentation website.',
  },
  docsAction: {
    id: 'communityTheme.landing.docs.action',
    defaultMessage: 'Visit the documentation',
    description: 'Link to the Network Canvas documentation website.',
  },
  activityTitle: {
    id: 'communityTheme.landing.activity.title',
    defaultMessage: 'Recent activity',
    description:
      'Heading of the home page section that summarises the latest discussions.',
  },
  latestTitle: {
    id: 'communityTheme.landing.activity.latest',
    defaultMessage: 'Latest discussions',
    description: 'Heading above a list of the most recently active topics.',
  },
  replies: {
    id: 'communityTheme.landing.activity.replies',
    defaultMessage: '{count, plural, one {# reply} other {# replies}}',
    description: 'How many replies a topic in the latest discussions list has.',
  },
  seeAll: {
    id: 'communityTheme.landing.activity.seeAll',
    defaultMessage: 'See all discussions',
    description: 'Link under the latest discussions list to the full list.',
  },
  networkTitle: {
    id: 'communityTheme.landing.activity.network.title',
    defaultMessage: 'Who’s taking part',
    description:
      'Heading of a diagram that links recent discussions to the people who posted in them.',
  },
  networkCaption: {
    id: 'communityTheme.landing.activity.network.caption',
    defaultMessage:
      'Each dot is a recent discussion, linked to the people who posted in it.',
    description:
      'Explains the diagram of recent discussions and the people who posted in them.',
  },
  networkLabel: {
    id: 'communityTheme.landing.activity.network.label',
    defaultMessage:
      'A diagram of recent discussions and the people who posted in them',
    description:
      'Text alternative for screen readers describing the diagram of recent discussions.',
  },
  statsTitle: {
    id: 'communityTheme.landing.activity.stats.title',
    defaultMessage: 'The community so far',
    description:
      'Heading above the total numbers of forum members, topics and posts.',
  },
  members: {
    id: 'communityTheme.landing.activity.stats.members',
    defaultMessage: 'Members',
    description:
      'Label beside the total number of forum members; the number is shown separately.',
  },
  topics: {
    id: 'communityTheme.landing.activity.stats.topics',
    defaultMessage: 'Topics',
    description:
      'Label beside the total number of forum topics; the number is shown separately.',
  },
  posts: {
    id: 'communityTheme.landing.activity.stats.posts',
    defaultMessage: 'Posts',
    description:
      'Label beside the total number of forum posts; the number is shown separately.',
  },
  unavailable: {
    id: 'communityTheme.landing.activity.unavailable',
    defaultMessage:
      'Recent activity could not be loaded. Reload the page to try again.',
    description:
      'Shown in place of the recent activity section when the forum could not provide it.',
  },
});
