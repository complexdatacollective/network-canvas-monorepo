# Fresco Platform - Multi-Tenant SaaS

A self-service platform for deploying isolated Network Canvas Fresco instances. Users can sign up and get their own containerized Fresco instance with a dedicated database schema.

## Architecture

The platform consists of:

- **NextJS App** (`apps/fresco-platform/`): Web frontend with signup wizard and admin dashboard
- **API Package** (`packages/fresco-api/`): oRPC API with Hono server for backend operations
- **Orchestrator Package** (`packages/fresco-orchestrator/`): Docker and database management
- **PostgreSQL Database**: Shared instance with schema-based tenant isolation
- **Docker**: Container runtime for Fresco instances
- **Traefik**: Reverse proxy for subdomain routing (production only)

## Prerequisites

- Node.js 22+
- pnpm 8+
- Docker and Docker Compose
- PostgreSQL 16+ (via Docker)

## Local Development Setup

### 1. Install Dependencies

```bash
# From the monorepo root
pnpm install
```

### 2. Start Infrastructure

```bash
# Start PostgreSQL and Traefik
docker-compose -f docker-compose.dev.yml up -d

# Verify services are running
docker-compose -f docker-compose.dev.yml ps
```

### 3. Setup Database

```bash
# Navigate to the platform app
cd apps/fresco-platform

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# (Optional) Open Prisma Studio to view data
pnpm db:studio
```

### 4. Environment Variables

Create `.env` files in the following locations:

**apps/fresco-platform/.env.local** (already created):
```env
DATABASE_URL="postgresql://fresco_platform_app:localdev@localhost:5432/fresco_platform"
NEXT_PUBLIC_APP_URL="http://localhost:3001"
DOCKER_HOST="/var/run/docker.sock"
DOCKER_NETWORK="fresco-platform-network"
AUTH_SECRET="your-super-secret-key-change-in-production"
AUTH_URL="http://localhost:3001"
FRESCO_IMAGE="ghcr.io/complexdatacollective/fresco:latest"
NODE_ENV="development"
```

**packages/fresco-api/.env**:
```env
DATABASE_URL="postgresql://fresco_platform_app:localdev@localhost:5432/fresco_platform"
PORT="3000"
CORS_ORIGIN="http://localhost:3001"
DOCKER_HOST="/var/run/docker.sock"
DOCKER_NETWORK="fresco-platform-network"
FRESCO_IMAGE="ghcr.io/complexdatacollective/fresco:latest"
DEFAULT_MEMORY="512"
DEFAULT_CPUS="0.5"
```

### 5. Build Packages

```bash
# From monorepo root
pnpm --filter "@fresco/orchestrator" build
pnpm --filter "@fresco/api" build
```

### 6. Start Development Servers

```bash
# Terminal 1: Start API server
cd packages/fresco-api
pnpm dev

# Terminal 2: Start NextJS app
cd apps/fresco-platform
pnpm dev
```

The platform will be available at:
- Frontend: http://localhost:3001
- API: http://localhost:3000
- Traefik Dashboard: http://localhost:8080

## Development Workflow

### Working on the Orchestrator

```bash
cd packages/fresco-orchestrator
pnpm dev  # Watch mode
pnpm test:watch  # Test watch mode
```

### Working on the API

```bash
cd packages/fresco-api
pnpm dev  # Watch mode
pnpm test:watch  # Test watch mode
```

### Working on the Frontend

```bash
cd apps/fresco-platform
pnpm dev  # NextJS dev server
pnpm test:watch  # Test watch mode
```

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter "@fresco/orchestrator" test
pnpm --filter "@fresco/api" test
pnpm --filter "fresco-platform" test
```

### Integration Tests

```bash
# Ensure Docker is running
docker-compose -f docker-compose.dev.yml up -d

# Run integration tests
pnpm test:integration
```

## Production Deployment

### VPS Requirements

Minimum specifications:
- **OS**: Ubuntu 22.04 LTS or similar Linux distribution
- **CPU**: 2 cores minimum
- **RAM**: 4GB minimum (2GB platform + 2GB for tenants)
- **Storage**: 40GB SSD
- **Network**: Public IP with DNS pointing to the server

Software requirements:
- Docker Engine 24+
- Docker Compose v2+
- Node.js 22+ (for platform backend)
- PostgreSQL 16+ with UUID extension
- Traefik (pre-configured)
- systemd or PM2 for process management

### Deployment Steps

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd network-canvas
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   pnpm build
   ```

3. **Configure Environment**
   Create production `.env` files with appropriate values

4. **Setup Database**
   ```bash
   cd apps/fresco-platform
   pnpm db:migrate
   ```

5. **Start Services**
   ```bash
   # Using PM2
   pm2 start packages/fresco-api/dist/server.js --name fresco-api
   pm2 start apps/fresco-platform --name fresco-platform

   # Or using systemd (create service files)
   sudo systemctl start fresco-api
   sudo systemctl start fresco-platform
   ```

6. **Configure Traefik**
   Ensure Traefik is configured to:
   - Route platform traffic to the NextJS app
   - Handle wildcard subdomains for tenant instances
   - Manage SSL certificates via Let's Encrypt

## Tenant Management

### Creating a Tenant

1. User signs up through the wizard at `/signup`
2. System provisions:
   - PostgreSQL schema (`tenant_{uuid}`)
   - Database user with restricted permissions
   - Docker container from Fresco image
   - Traefik routing rules

### Tenant Lifecycle

- **Start**: Starts stopped container
- **Stop**: Gracefully stops container
- **Restart**: Restarts container
- **Destroy**: Removes container and database schema

### Resource Limits

Default per tenant:
- Memory: 256-512MB
- CPU: 0.25-0.5 cores
- Database: Isolated schema
- Network: Shared Docker network

## Monitoring

### Container Metrics

The orchestrator collects:
- CPU usage percentage
- Memory usage and limits
- Network I/O
- Container status

### Database Metrics

Per-tenant database statistics:
- Table count
- Total size
- Row count

### Health Checks

- Docker daemon health
- PostgreSQL connectivity
- Container status checks

## Troubleshooting

### Common Issues

1. **Docker permission errors**
   ```bash
   sudo usermod -aG docker $USER
   # Log out and back in
   ```

2. **Database connection errors**
   - Check PostgreSQL is running: `docker-compose ps`
   - Verify connection string in `.env`
   - Check database exists and user has permissions

3. **Container creation failures**
   - Verify Docker network exists: `docker network ls`
   - Check Fresco image is accessible: `docker pull ghcr.io/complexdatacollective/fresco:latest`
   - Review orchestrator logs

4. **Port conflicts**
   - Change ports in `.env` and `package.json` scripts
   - Check for conflicting services: `lsof -i :3000` or `lsof -i :3001`

### Logs

- API logs: Check console output or PM2 logs
- Container logs: `docker logs fresco_tenant_{uuid}`
- Database logs: `docker-compose logs postgres`
- Traefik logs: `docker-compose logs traefik`

## API Documentation

The platform uses oRPC for type-safe RPC communication.

### Key Endpoints

- `POST /api/wizard.checkSubdomain` - Check subdomain availability
- `POST /api/wizard.createSession` - Start signup session
- `POST /api/wizard.deployTenant` - Deploy new tenant
- `POST /api/tenants.list` - List user's tenants
- `POST /api/tenants.start` - Start a tenant
- `POST /api/tenants.stop` - Stop a tenant
- `POST /api/tenants.destroy` - Remove a tenant

## Security Considerations

- Tenant isolation via Docker containers
- Database schema isolation with restricted permissions
- No cross-tenant data access
- Automatic resource limits enforcement
- SSL/TLS via Traefik in production

## Contributing

1. Create a feature branch
2. Make changes and add tests
3. Ensure all tests pass: `pnpm test`
4. Run linting: `pnpm lint:fix`
5. Submit pull request

## License

[License information here]

## Support

For issues and questions:
- GitHub Issues: [repository issues URL]
- Documentation: https://documentation.networkcanvas.com/en/fresco