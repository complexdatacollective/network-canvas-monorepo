# Network Canvas Documentation

Welcome to the Network Canvas documentation website—a comprehensive resource for users of Network Canvas, a suite of applications designed to facilitate the collection of social network data.

## Overview

This documentation site covers various aspects of Network Canvas, including detailed information about its primary applications and related products. Whether you're a researcher, developer, or user, this documentation aims to provide you with the necessary information to make the most out of Network Canvas.

## Development

To run the app locally:

1. Set up the required environment variables in the `.env` file (refer to the template in `.env.example`).
2. Run `pnpm run build` to generate the static sidebar JSON and Algolia search index.

## Features

### 1. Product Coverage

- **Network Canvas Core:** The desktop suite includes two applications tailored to assist researchers in social network data collection.

- **Fresco (Interviewer in Browser):** Explore detailed documentation on Fresco, a key component of Network Canvas, providing an in-browser interviewer for streamlined data collection.

### 2. Search Functionality

Effortlessly find the information you need with the top-level search bar. Instantly locate relevant documentation, making navigation and discovery a breeze.

### 3. Table of Contents

For in-depth articles, utilize the convenient Table of Contents component located on the right side of the page. Jump directly to the sections you need, enhancing your reading experience.

### 4. Sidebar Navigation

Navigate seamlessly through the documentation using the intuitive sidebar located on the left. Access different sections and categories with ease.

### 5. AI Assistant

Experience enhanced productivity with our AI Assistant. Trained on the documentation, it can generate precise answers based on the content, aiding users in finding information quickly.

### 6. Language Localization

Tailor your experience with language localization support. Currently supporting English and Russian, this feature ensures a global audience can access documentation in their preferred language.

### 7. Dark and Light Modes

Choose between dark and light modes to suit your preferences and reduce eye strain during extended reading sessions.

### 8. Analytics

The documentation site uses `@codaco/analytics` (PostHog via Cloudflare Worker proxy) for pageview and pageleave tracking. Analytics are initialized in `instrumentation-client.ts`, which runs once when client-side JS loads.

Analytics are **only active on production deployments**. Preview and development builds use a no-op implementation. This is controlled by a `NEXT_PUBLIC_IS_PRODUCTION` env var computed at build time in `next.config.ts` from platform-specific variables (`VERCEL_ENV` for Vercel, `CONTEXT` for Netlify). Analytics can also be manually disabled by setting `NEXT_PUBLIC_DISABLE_ANALYTICS=true`.

## Get Started

Explore the Network Canvas documentation to unlock the full potential of social network data collection. Whether you're a new user or an experienced researcher, this documentation is here to support you

Thank you for choosing Network Canvas!

---

# Description for vercel.json file

Here, we have several redirection rules. Each rule is an object with `source`, `destination`, and `permanent` properties.

- `source`: This is the path that will be matched in the incoming request.
- `destination`: This is the path that the request will be redirected to if the `source` matches.
- `permanent`: If `true`, the redirection will be a 301 (permanent) redirect. If `false`, it will be a 302 (temporary) redirect.

## Line 78-82 in vercel.json

The last rule in this excerpt is a catch-all rule that matches any path that doesn't start with `en`, `_next/static`, `_next/image`, `assets`, `protocols`, `favicons`, `images` or `.*\\.\\w+.*`(This regular expression is used to match any path that contains a file extension - i.g: _icon.svg_)

```JSON
{
  "source": "/:path((?!en|_next/static|_next/image|assets|protocols|favicons|images|.*\\.\\w+.*).*)",
  "destination": "/en/desktop/:path*",
  "permanent": true
}
```

The above rule redirects matching requests to the `/en/desktop/:path*` path.

