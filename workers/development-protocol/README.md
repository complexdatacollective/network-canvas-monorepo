# Development Protocol Worker

A Cloudflare Worker that provides a stable URL for accessing the latest Development.netcanvas asset from the Network Canvas monorepo releases.

## Overview

This worker solves the problem of accessing the latest Development Protocol release assets without CORS issues. Instead of manually tracking GitHub releases or dealing with cross-origin restrictions, this worker:

1. Fetches all releases from the [Network Canvas monorepo](https://github.com/complexdatacollective/network-canvas-monorepo)
2. Identifies development protocol releases using the naming pattern: `@codaco/development-protocol-YYYYMMDDHHMMSS-SHA`
3. Sorts releases by timestamp to find the most recent one
4. Serves the `Development.netcanvas` asset with proper CORS headers

## Usage

Once deployed, simply make a GET request to your worker's URL:

```bash
curl https://your-worker.your-subdomain.workers.dev/
```

The worker will respond with the latest `Development.netcanvas` file, including appropriate headers for cross-origin access.

## Development

### Prerequisites

- [pnpm](https://pnpm.io/) package manager
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (included as dev dependency)

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The development server will be available at `http://localhost:8787/`.

### Testing

```bash
# Run all tests
pnpm test
```

Tests are written using Vitest with Cloudflare Workers pool, supporting both unit and integration testing styles.

### Deployment

```bash
# Deploy to Cloudflare Workers
pnpm deploy
```

## Configuration

The worker is configured through `wrangler.jsonc`:

- **Entry point**: `src/index.ts`
- **Compatibility date**: 2025-09-26
- **Observability**: Enabled

## API Response

### Success Response (200)

Returns the `Development.netcanvas` file with headers:
- `Content-Type`: Based on the asset's content type
- `Content-Disposition`: `attachment; filename="Development.netcanvas"`
- `Access-Control-Allow-Origin`: `*`
- `Cache-Control`: `public, max-age=300` (5 minutes)

### Error Responses

- **404**: No development protocol releases found or asset not found in release
- **500**: GitHub API errors or network issues

### CORS Support

The worker handles CORS preflight requests (OPTIONS) and includes appropriate headers for cross-origin access.

## Architecture

The worker implements a simple fetch handler that:

1. Queries the GitHub API for all releases
2. Filters releases matching the development protocol naming pattern
3. Sorts by embedded timestamp to find the latest
4. Fetches and proxies the Development.netcanvas asset
5. Adds CORS headers for browser compatibility

## License

Private project.