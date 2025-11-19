# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Cloudflare Worker that serves as a proxy for the latest Development.netcanvas asset from GitHub releases. It provides a stable URL that always resolves to the most recent @codaco/development-protocol release from the complexdatacollective/network-canvas-monorepo repository, solving CORS issues when accessing GitHub assets directly.

## Development Commands

### Core Commands
- `pnpm dev` - Start local development server (runs on http://localhost:8787/)
- `pnpm test` - Run tests using Vitest
- `pnpm deploy` - Deploy worker to Cloudflare
- `pnpm run cf-typegen` - Generate TypeScript types for Cloudflare Worker environment

### Testing
- Tests are in the `test/` directory using Vitest with @cloudflare/vitest-pool-workers
- Supports both unit tests (mocked) and integration tests (using SELF.fetch)
- Test configuration in `vitest.config.mts`

## Architecture

The worker implements a single fetch handler that:

1. **Fetches all releases** from GitHub API (not just latest, since latest is rarely a development protocol release)
2. **Filters for development protocol releases** using naming pattern `@codaco/development-protocol-YYYYMMDDHHMMSS-SHA`
3. **Sorts by timestamp** extracted from release names to find the most recent
4. **Proxies the Development.netcanvas asset** with proper CORS headers
5. **Handles OPTIONS requests** for CORS preflight

## Code Style

- **Prettier configuration**: 140 char width, single quotes, tabs, semicolons required
- **TypeScript**: ES2021 target, strict mode, isolated modules
- **Interface definitions** for external APIs (GitHubRelease, GitHubAsset)
- **Async/await pattern** for HTTP requests with proper error handling
- **CORS headers** on all responses with 5-minute caching

## Key Implementation Details

- Uses Web APIs only (no Node.js APIs available in Cloudflare Workers)
- Timestamp extraction uses regex: `/@codaco\/development-protocol-(\d{14})/`
- Release sorting is done by comparing timestamp strings lexicographically
- Proper error responses with appropriate HTTP status codes
- Response streaming for large assets