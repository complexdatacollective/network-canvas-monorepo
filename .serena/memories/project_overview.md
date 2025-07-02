# Network Canvas Project Overview

## Purpose
Network Canvas is a monorepo containing multiple applications and packages for conducting network analysis interviews. The main components are:

- **Architect** - Protocol builder application (React/Vite/Redux)
- **Analytics Web** - Analytics dashboard (Next.js/Clerk/Drizzle)
- **Documentation** - Documentation site (Next.js/MDX)

## Tech Stack
- **Monorepo Management**: pnpm workspaces
- **Frontend Framework**: React with Vite (architect), Next.js (analytics, docs)
- **State Management**: Redux with Redux Toolkit (architect)
- **Routing**: wouter (not React Router) in architect
- **Styling**: Migrating from Sass to Tailwind CSS
- **Language**: TypeScript throughout
- **Testing**: Vitest with React Testing Library
- **Linting/Formatting**: Biome

## Architecture
- Monorepo structure with apps/, packages/, and tooling/ directories
- Protocol-centric design with stages, codebook, and assets
- Custom timeline middleware for undo/redo functionality
- Bundle/unbundle system for packaging protocol files with assets