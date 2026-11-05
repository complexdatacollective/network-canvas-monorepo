import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { isDestroying } from "@ember/destroyable";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import DButton from "discourse/components/d-button";
import SearchMenu from "discourse/components/search-menu";
import ageWithTooltip from "discourse/helpers/age-with-tooltip";
import avatar from "discourse/helpers/avatar";
import bodyClass from "discourse/helpers/body-class";
import categoryLink, {
  categoryBadgeHTML,
} from "discourse/helpers/category-link";
import icon from "discourse/helpers/d-icon";
import number from "discourse/helpers/number";
import { ajax } from "discourse/lib/ajax";
import getURL from "discourse/lib/get-url";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import ActivityNetwork from "./activity-network";
import {
  ConversationIcon,
  DocsIcon,
  HelpIcon,
  HeroIllustration,
  IdeasIcon,
  NewsIcon,
} from "./illustrations";

// The four places the page sends people, in the order it offers them. Each is
// a category named by a theme setting (a slug, or "parent/child"); one that
// does not exist, or that the visitor cannot see, is left out. `posts` says
// whether its button starts a topic or, for the team's announcements, opens
// the category; the three that take posts sit beside the heading, and the
// announcements below them. `primary` marks the one route whose button is
// filled: most people come with a question.
const ROUTES = [
  {
    key: "help",
    setting: "help_category",
    icon: HelpIcon,
    posts: true,
    primary: true,
    title: "landing.routes.help.title",
    body: "landing.routes.help.body",
    action: "landing.routes.help.action",
  },
  {
    key: "ideas",
    setting: "ideas_category",
    icon: IdeasIcon,
    posts: true,
    title: "landing.routes.ideas.title",
    body: "landing.routes.ideas.body",
    action: "landing.routes.ideas.action",
  },
  {
    key: "conversation",
    setting: "conversation_category",
    icon: ConversationIcon,
    posts: true,
    title: "landing.routes.conversation.title",
    body: "landing.routes.conversation.body",
    action: "landing.routes.conversation.action",
  },
  {
    key: "news",
    setting: "news_category",
    icon: NewsIcon,
    posts: false,
    title: "landing.routes.news.title",
    body: "landing.routes.news.body",
    action: "landing.routes.news.action",
  },
];

const LATEST_COUNT = 6;
const NETWORK_TOPICS = 8;

// The newest announcement is linked above the heading only while it is news.
const NEWS_MAX_AGE_DAYS = 120;

function topicUrl(topic) {
  return getURL(`/t/${topic.slug}/${topic.id}`);
}

// Discourse sends titles already escaped, with emoji as images.
function fancyTitle(topic) {
  return htmlSafe(topic.fancy_title);
}

function value(result) {
  return result.status === "fulfilled" ? result.value : null;
}

function categoryFor(setting) {
  return Category.findBySlugPath(settings[setting].split("/"));
}

/**
 * The forum's home page: what the community is for, where to post, and what
 * has been happening lately. It replaces Discourse's category list as the
 * homepage (the theme's `custom_homepage` modifier); Latest, Top and
 * Categories keep their own pages.
 */
export default class LandingPage extends Component {
  @service site;

  @tracked featured = new Map();
  @tracked latest = null;
  @tracked stats = null;
  @tracked news = null;
  @tracked loading = true;

  constructor() {
    super(...arguments);
    this.load();
  }

  async load() {
    const newsCategory = categoryFor("news_category");
    // Each card's newest topic comes from its own category's topic list.
    // `/categories.json` leaves topics out under some category-page styles,
    // and subcategories out when it is paged or not asked for them, so a
    // card could lose its topic to a site setting.
    const cardCategories = ROUTES.filter((route) => route.posts)
      .map((route) => categoryFor(route.setting))
      .filter(Boolean);
    const [latest, about, news, ...cardTopics] = await Promise.allSettled([
      ajax("/latest.json", { data: { no_definitions: true } }),
      ajax("/about.json"),
      newsCategory
        ? ajax(`${newsCategory.path}/l/latest.json`, {
            data: { order: "created", no_definitions: true },
          })
        : Promise.resolve(null),
      ...cardCategories.map((category) =>
        ajax(`${category.path}/l/latest.json`, {
          data: { no_definitions: true },
        })
      ),
    ]);
    if (isDestroying(this)) {
      return;
    }

    this.featured = new Map(
      cardCategories.map((category, index) => {
        const topics = value(cardTopics[index])?.topic_list?.topics ?? [];
        return [category.id, topics.find((topic) => !topic.pinned) ?? topics[0]];
      })
    );

    const latestList = value(latest);
    if (latestList) {
      this.latest = {
        topics: latestList.topic_list.topics.filter((topic) => !topic.pinned),
        users: new Map(latestList.users.map((user) => [user.id, user])),
      };
    }

    this.stats = value(about)?.about?.stats ?? null;

    const newest = value(news)?.topic_list?.topics?.[0];
    const age = newest ? Date.now() - new Date(newest.created_at) : Infinity;
    this.news = age < NEWS_MAX_AGE_DAYS * 86_400_000 ? newest : null;

    this.loading = false;
  }

  get routes() {
    return ROUTES.flatMap((route) => {
      const category = categoryFor(route.setting);
      if (!category) {
        return [];
      }
      const latest = this.featured.get(category.id);
      return {
        ...route,
        category,
        // The category's name and colour, not a link: the browse link beside
        // it goes to the same page.
        badge: htmlSafe(categoryBadgeHTML(category, { link: false })),
        latest,
        latestUrl: latest ? topicUrl(latest) : null,
        // By id: Discourse reads a `category` parameter as the first
        // category whose name or slug matches, which for a subcategory can
        // be another category of the same name.
        actionUrl: route.posts
          ? getURL(`/new-topic?category_id=${category.id}`)
          : category.url,
        actionClass: route.primary ? "btn-primary" : "btn-default",
      };
    });
  }

  get postingRoutes() {
    return this.routes.filter((route) => route.posts);
  }

  get newsRoute() {
    return this.routes.find((route) => !route.posts);
  }

  get latestTopics() {
    const { topics, users } = this.latest ?? { topics: [], users: new Map() };
    return topics.slice(0, LATEST_COUNT).map((topic) => ({
      topic,
      url: topicUrl(topic),
      category: Category.findById(topic.category_id),
      replies: Math.max(topic.posts_count - 1, 0),
      author: users.get(topic.posters?.[0]?.user_id),
    }));
  }

  get networkTopics() {
    return (this.latest?.topics ?? []).slice(0, NETWORK_TOPICS).map((topic) => ({
      id: topic.id,
      title: topic.title,
      color: Category.findById(topic.category_id)?.color ?? "",
      posterIds: (topic.posters ?? []).map((poster) => poster.user_id),
    }));
  }

  get newsUrl() {
    return this.news ? topicUrl(this.news) : null;
  }

  get failed() {
    return !this.loading && !this.latest;
  }

  <template>
    {{bodyClass "nc-landing-page"}}
    <div class="nc-landing">
      <div class="nc-landing__top">
        <section class="nc-landing__hero" aria-labelledby="nc-landing-title">
          {{#if this.news}}
            <a class="nc-landing__news" href={{this.newsUrl}}>
              <span class="nc-landing__news-label">
                {{i18n (themePrefix "landing.hero.news")}}
              </span>
              <span class="nc-landing__news-title">
                {{fancyTitle this.news}}
              </span>
              {{icon "arrow-right"}}
            </a>
          {{/if}}
          <h1 id="nc-landing-title" class="nc-landing__title">
            {{i18n (themePrefix "landing.hero.title")}}
          </h1>
          <p class="nc-landing__lead">
            {{i18n (themePrefix "landing.hero.lead")}}
          </p>
          <div class="nc-landing__search welcome-banner__wrap">
            <div class="search-menu welcome-banner__search-menu">
              <DButton
                @icon="magnifying-glass"
                @title="search.open_advanced"
                @href="/search?expanded=true"
                class="search-icon"
              />
              <SearchMenu
                @location="welcome-banner"
                @searchInputId="nc-landing-search-input"
                @searchInputPlaceholder="welcome_banner.search_placeholder"
              />
            </div>
          </div>
          <HeroIllustration />
        </section>

        <section class="nc-landing__routes" aria-labelledby="nc-landing-routes">
          <h2 id="nc-landing-routes" class="nc-landing__heading">
            {{i18n (themePrefix "landing.routes.title")}}
          </h2>
          <p class="nc-landing__section-lead">
            {{i18n (themePrefix "landing.routes.lead")}}
          </p>
          <ul class="nc-landing__route-list">
            {{#each this.postingRoutes as |route|}}
              <li class="nc-landing__card nc-route nc-route--{{route.key}}">
                <div class="nc-landing__icon">
                  <route.icon />
                </div>
                <div class="nc-route__body">
                  <h3 class="nc-route__title">
                    <a href={{route.category.url}}>
                      {{i18n (themePrefix route.title)}}
                    </a>
                  </h3>
                  <p class="nc-route__text">
                    {{i18n (themePrefix route.body)}}
                  </p>
                  {{#if route.latest}}
                    <p class="nc-route__latest">
                      <span class="nc-landing__eyebrow">
                        {{i18n (themePrefix "landing.routes.latestTopic")}}
                      </span>
                      <a class="nc-route__topic" href={{route.latestUrl}}>
                        {{fancyTitle route.latest}}
                      </a>
                    </p>
                  {{/if}}
                </div>
                <div class="nc-route__end">
                  <DButton
                    @href={{route.actionUrl}}
                    @translatedLabel={{i18n (themePrefix route.action)}}
                    class={{route.actionClass}}
                  />
                  <span class="nc-route__category">{{route.badge}}</span>
                  <a class="nc-route__browse" href={{route.category.url}}>
                    {{i18n
                      (themePrefix "landing.routes.browse")
                      count=route.category.topic_count
                    }}
                    {{icon "arrow-right"}}
                  </a>
                </div>
              </li>
            {{/each}}
          </ul>
        </section>
      </div>

      <div class="nc-landing__tiles">
        {{#if this.newsRoute}}
          <section
            class="nc-landing__card nc-landing__tile nc-landing__tile--news"
            aria-labelledby="nc-landing-news"
          >
            <div class="nc-landing__icon">
              <this.newsRoute.icon />
            </div>
            <div class="nc-landing__tile-body">
              <h2 id="nc-landing-news" class="nc-landing__tile-title">
                {{i18n (themePrefix this.newsRoute.title)}}
              </h2>
              <p>{{i18n (themePrefix this.newsRoute.body)}}</p>
            </div>
            <DButton
              @href={{this.newsRoute.actionUrl}}
              @translatedLabel={{i18n (themePrefix this.newsRoute.action)}}
              class={{this.newsRoute.actionClass}}
            />
          </section>
        {{/if}}
        <aside
          class="nc-landing__card nc-landing__tile nc-landing__tile--docs"
          aria-labelledby="nc-landing-docs"
        >
          <div class="nc-landing__icon">
            <DocsIcon />
          </div>
          <div class="nc-landing__tile-body">
            <h2 id="nc-landing-docs" class="nc-landing__tile-title">
              {{i18n (themePrefix "landing.docs.title")}}
            </h2>
            <p>{{i18n (themePrefix "landing.docs.body")}}</p>
          </div>
          <a class="btn btn-default" href={{settings.documentation_url}}>
            {{i18n (themePrefix "landing.docs.action")}}
          </a>
        </aside>
      </div>

      <section
        class="nc-landing__activity"
        aria-labelledby="nc-landing-activity"
        aria-busy={{if this.loading "true" "false"}}
      >
        <h2 id="nc-landing-activity" class="nc-landing__heading">
          {{i18n (themePrefix "landing.activity.title")}}
        </h2>
        {{#if this.failed}}
          <p class="nc-landing__unavailable">
            {{i18n (themePrefix "landing.activity.unavailable")}}
          </p>
        {{else}}
          <div class="nc-landing__activity-grid">
            <div class="nc-landing__card nc-landing__panel nc-landing__latest">
              <h3 class="nc-landing__subheading">
                {{i18n (themePrefix "landing.activity.latest")}}
              </h3>
              <ol class="nc-latest-list">
                {{#each this.latestTopics as |item|}}
                  <li class="nc-latest-list__item">
                    {{#if item.author}}
                      {{avatar item.author imageSize="medium"}}
                    {{/if}}
                    <div class="nc-latest-list__body">
                      <a class="nc-latest-list__title" href={{item.url}}>
                        {{fancyTitle item.topic}}
                      </a>
                      <div class="nc-latest-list__meta">
                        {{#if item.category}}
                          {{categoryLink item.category}}
                        {{/if}}
                        <span>
                          {{i18n
                            (themePrefix "landing.activity.replies")
                            count=item.replies
                          }}
                        </span>
                        {{ageWithTooltip item.topic.last_posted_at}}
                      </div>
                    </div>
                  </li>
                {{else}}
                  {{#if this.loading}}
                    <li class="nc-latest-list__placeholder"></li>
                    <li class="nc-latest-list__placeholder"></li>
                    <li class="nc-latest-list__placeholder"></li>
                  {{/if}}
                {{/each}}
              </ol>
              <a class="nc-landing__more" href={{getURL "/latest"}}>
                {{i18n (themePrefix "landing.activity.seeAll")}}
                {{icon "arrow-right"}}
              </a>
            </div>

            <div class="nc-landing__aside">
              {{#if this.latest}}
                <figure
                  class="nc-landing__card nc-landing__panel nc-landing__network"
                >
                  <h3 class="nc-landing__subheading">
                    {{i18n (themePrefix "landing.activity.network.title")}}
                  </h3>
                  <ActivityNetwork
                    @topics={{this.networkTopics}}
                    @users={{this.latest.users}}
                  />
                  <figcaption>
                    {{i18n (themePrefix "landing.activity.network.caption")}}
                  </figcaption>
                </figure>
              {{/if}}
              {{#if this.stats}}
                <div
                  class="nc-landing__card nc-landing__panel nc-landing__stats"
                >
                  <h3 class="nc-landing__subheading">
                    {{i18n (themePrefix "landing.activity.stats.title")}}
                  </h3>
                  <dl>
                    <div>
                      <dt>{{i18n (themePrefix "landing.activity.stats.members")}}</dt>
                      <dd>{{number this.stats.users_count}}</dd>
                    </div>
                    <div>
                      <dt>{{i18n (themePrefix "landing.activity.stats.topics")}}</dt>
                      <dd>{{number this.stats.topics_count}}</dd>
                    </div>
                    <div>
                      <dt>{{i18n (themePrefix "landing.activity.stats.posts")}}</dt>
                      <dd>{{number this.stats.posts_count}}</dd>
                    </div>
                  </dl>
                </div>
              {{/if}}
            </div>
          </div>
        {{/if}}
      </section>
    </div>
  </template>
}
