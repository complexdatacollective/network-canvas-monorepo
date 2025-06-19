# Network Canvas

Network Canvas is an innovative suite of applications for conducting network research interviews and data collection. This monorepo contains all the core packages and applications that power the Network Canvas ecosystem.

## 🌐 Overview

Network Canvas helps researchers collect data about social, personal, and professional networks through intuitive interfaces and powerful data management tools.

## 📦 Repository Structure

This monorepo is organized into three main categories:

### Apps

- **`analytics-web/`** - Analytics dashboard and data visualization platform
- **`documentation/`** - Documentation website and user guides
- **`architect-vite/`** - Protocol design and management application

### Packages

- **`analytics/`** - Core analytics utilities and functions
- **`art/`** - UI components and design system elements
- **`protocol-validation/`** - Protocol schema validation and migration tools
- **`shared-consts/`** - Shared constants and type definitions
- **`ui/`** - Reusable React UI components

### Tooling

- **`tailwind/`** - Shared Tailwind CSS configuration
- **`typescript/`** - TypeScript configurations

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 10.0.0

### Installation

```bash
# Clone the repository
git clone https://github.com/complexdatacollective/network-canvas.git
cd network-canvas

# Install dependencies
pnpm install
```

### Development

```bash
# Start all applications in development mode
pnpm dev

# Build all packages and applications
pnpm build

# Run tests across all packages
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Working with Individual Packages

```bash
# Work with a specific package
pnpm --filter @codaco/shared-consts build
pnpm --filter analytics-web dev

# Run commands in multiple packages
pnpm --filter "./packages/*" build
pnpm --filter "./apps/*" dev
```

## 🛠️ Development Tools

This monorepo uses modern development tools and practices:

- **🏗️ Build System**: Vite for fast builds and development
- **📦 Package Manager**: pnpm with workspace support
- **🎨 Code Formatting**: Biome for consistent code style
- **🔧 Type Checking**: TypeScript with shared configurations
- **🚀 CI/CD**: GitHub Actions with optimized workflows
- **📋 Change Management**: Changesets for version management

## 📚 Documentation

Comprehensive documentation is available at the documentation app within this monorepo. Key topics include:

- **Getting Started** - Installation and basic setup
- **Interface Documentation** - Detailed guides for each interface type
- **Key Concepts** - Understanding protocols, variables, and data structures
- **Tutorials** - Step-by-step protocol building guides
- **Advanced Topics** - Custom integrations and advanced configurations

## 🔄 Version Management

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated releases.

### Creating a Changeset

```bash
# Add a changeset for your changes
pnpm changeset

```

### Publishing

Add a changeset to your PR. Once it is merged, a PR will be created that summarizes the changes and bumps the version of the packages. You can then review and merge this PR to publish the updated packages.

```bash

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run tests for a specific package
pnpm --filter protocol-validation test

# Run tests in watch mode
pnpm test:watch

# Type check all packages
pnpm typecheck-all
```

## 🎨 Code Style

This project uses Biome for formatting and linting:

```bash
# Check formatting and linting
pnpm run format-and-lint

# Auto-fix formatting and linting issues
pnpm run format-and-lint:fix
```

Pre-commit hooks automatically format code on commit.

## 📋 Scripts

Key scripts available in the root package:

- **`pnpm build`** - Build all packages and applications
- **`pnpm dev`** - Start development servers for all apps
- **`pnpm test`** - Run test suites across all packages
- **`pnpm changeset`** - Create a changeset for version management
- **`pnpm run publish-packages`** - Build and publish packages to npm
- **`pnpm run format-and-lint:fix`** - Format and lint all code

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `pnpm run format-and-lint:fix`
6. Submit a pull request

## 📄 License

This project is licensed under the terms specified in individual package LICENSE files.

## 🔗 Links

- **Main Website**: [Network Canvas](https://networkcanvas.com)
- **Documentation**: [Network Canvas Documentation](https://documentation.networkcanvas.com)
- **Issues**: [GitHub Issues](https://github.com/complexdatacollective/network-canvas/issues)

---

Built with ❤️ by the Complex Data Collective team
