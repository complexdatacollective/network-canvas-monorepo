# Architect

Architect is the protocol designer application for Network Canvas. It provides a visual interface for researchers to create and edit interview protocols used in Network Canvas data collection applications.

## Overview

Architect allows researchers to design structured network research interviews by:

- Defining **node types** (people, places, organizations, etc.) and **edge types** (relationships between nodes)
- Creating **variables** with validation rules for data collection
- Building **interview stages** including name generators, sociograms, forms, and more
- Managing **assets** like images, audio, video, and external data sources
- Validating protocols against the Network Canvas schema

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

### Development

From the monorepo root:

```bash
# Install dependencies
pnpm install

# Start the development server
pnpm --filter architect-vite dev
```

The app will be available at `http://localhost:5173`.

### Environment Variables

Copy `.env.example` to `.env` and configure:

- `VITE_PUBLIC_POSTHOG_KEY` - PostHog analytics key (optional for development)
- `VITE_FRESCO_PREVIEW_URL` - Base URL for the Fresco preview service used to upload and view protocol previews
- `VITE_FRESCO_PREVIEW_API_TOKEN` - API token used to authenticate requests to the Fresco preview service

### Building

```bash
# Build for production
pnpm --filter architect-vite build

# Preview production build
pnpm --filter architect-vite preview
```

### Testing

```bash
# Run tests
pnpm --filter architect-vite test

# Type check
pnpm --filter architect-vite typecheck
```

## Tech Stack

- **Vite** - Build tool and dev server
- **React** - UI framework
- **Redux** + **Redux Form** - State management
- **Tailwind CSS** + **SCSS** - Styling
- **Wouter** - Client-side routing
- **Zod** - Schema validation (via `@codaco/protocol-validation`)
- **PostHog** - Analytics
- **Vitest** - Testing framework

## Project Structure

```
src/
├── components/       # React components
│   ├── AssetBrowser/ # Asset management UI
│   ├── Codebook/     # Variable and entity type editors
│   ├── Form/         # Form fields and input components
│   ├── StageEditor/  # Interview stage configuration
│   ├── Timeline/     # Protocol stage timeline
│   └── ViewManager/  # Main app views and routing
├── ducks/            # Redux slices (reducers, actions, selectors)
├── hooks/            # Custom React hooks
├── lib/              # Legacy UI components and utilities
├── selectors/        # Redux selectors
├── styles/           # Global SCSS styles
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Key Concepts

### Protocols

A protocol defines the complete structure of a Network Canvas interview, including:

- **Codebook** - Definitions for node types, edge types, ego, and their variables
- **Stages** - Ordered list of interview steps
- **Assets** - Media files and external data referenced by the protocol

### Stage Types

Architect supports configuring various interview stage types:

- **Name Generators** - Create nodes through panels, forms, or quick add
- **Sociogram** - Visual network mapping interface
- **Ordinal/Categorical Bin** - Sort nodes into categories
- **Narrative** - Freeform data collection with positioned nodes
- **Dyad Census / Tie Strength Census** - Systematic edge elicitation
- **Ego Form** - Collect data about the participant
- **Information** - Display informational content

### Validation

Protocols are validated using `@codaco/protocol-validation` which provides:

- Schema validation with Zod
- Cross-reference validation (e.g., variables referenced in stages exist in codebook)
- Migration support between protocol versions

## Workspace Dependencies

This app depends on other packages in the monorepo:

- `@codaco/protocol-validation` - Protocol schema validation and migration
- `@codaco/shared-consts` - Shared constants and type definitions
- `@codaco/development-protocol` - Sample protocol for testing (dev dependency)
