# Fresco Platform Setup Instructions

This guide will walk you through setting up the Fresco Platform for local development.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20 or later)
- **pnpm** (v9 or later)
- **Docker Desktop** (for running containers and PostgreSQL)
- **Git** (for cloning the repository)

## Quick Start

1. **Install Dependencies**

   ```bash
   pnpm install
   ```

2. **Configure Environment Variables**

   Copy the example environment file and configure it:

   ```bash
   cp .env.example .env.local
   ```

   The default values should work for local development, but review them:

   ```env
   # Database
   DATABASE_URL="postgresql://fresco_platform_app:localdev@localhost:5432/fresco_platform"

   # App URLs
   NEXT_PUBLIC_APP_URL="http://localhost:3001"
   NEXT_PUBLIC_API_URL="http://localhost:3000"

   # Docker
   DOCKER_HOST="/var/run/docker.sock"
   DOCKER_NETWORK="fresco-platform-network"

   # Better Auth (change AUTH_SECRET in production!)
   AUTH_SECRET="your-super-secret-key-change-in-production"
   AUTH_URL="http://localhost:3001"

   # Fresco Image
   FRESCO_IMAGE="ghcr.io/complexdatacollective/fresco:latest"

   # Development Mode
   NODE_ENV="development"
   ```

3. **Start PostgreSQL**

   The platform requires PostgreSQL. Start it with Docker:

   ```bash
   docker run -d \
     --name fresco-postgres \
     -e POSTGRES_PASSWORD=localdev \
     -e POSTGRES_USER=fresco_platform_app \
     -e POSTGRES_DB=fresco_platform \
     -p 5432:5432 \
     postgres:16
   ```

4. **Run Setup Script**

   This will verify your environment, create Docker networks, and initialize the database:

   ```bash
   pnpm setup
   ```

   The setup script will:
   - ✓ Check all required environment variables
   - ✓ Verify Docker is running
   - ✓ Test PostgreSQL connection
   - ✓ Create the Docker network for Fresco instances
   - ✓ Generate Prisma Client
   - ✓ Push database schema to PostgreSQL

5. **Start Development Server**

   ```bash
   pnpm dev
   ```

   The application will be available at: http://localhost:3001

## Testing the Full Flow

### 1. Create an Account

1. Navigate to http://localhost:3001
2. Click "Deploy Your Instance" or go to http://localhost:3001/signup
3. Complete the signup wizard:
   - **Step 1**: Create account with email and password
   - **Step 2**: Choose your use case
   - **Step 3**: Select a subdomain
   - **Step 4**: Accept terms and conditions
   - **Step 5**: Deploy your instance
   - **Step 6**: Success! View your deployment

### 2. Sign In

1. Go to http://localhost:3001/login
2. Enter your email and password
3. Check "Remember me" to stay signed in (optional)
4. You'll be redirected to the dashboard

### 3. Manage Instances

From the dashboard, you can:
- View all your Fresco instances
- Start/stop instances
- View instance details and logs
- Deploy new instances
- Delete instances

### 4. Sign Out

Click your user icon in the top-right corner and select "Sign out"

## Common Issues and Troubleshooting

### PostgreSQL Connection Failed

**Problem**: Cannot connect to PostgreSQL

**Solutions**:
1. Verify PostgreSQL is running:
   ```bash
   docker ps | grep fresco-postgres
   ```

2. If not running, start it:
   ```bash
   docker start fresco-postgres
   ```

3. Check the connection manually:
   ```bash
   docker exec -it fresco-postgres psql -U fresco_platform_app -d fresco_platform -c "SELECT 1;"
   ```

### Docker Daemon Not Running

**Problem**: Setup script fails with "Docker daemon is not running"

**Solution**: Start Docker Desktop and wait for it to be fully running, then retry the setup.

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3001`

**Solution**: Another process is using port 3001. Either:
1. Stop the other process
2. Change the port in `.env.local`:
   ```env
   NEXT_PUBLIC_APP_URL="http://localhost:3002"
   AUTH_URL="http://localhost:3002"
   ```
   Then start with: `pnpm dev --port 3002`

### Prisma Client Not Generated

**Problem**: Import errors for `@prisma/client`

**Solution**: Regenerate the Prisma client:
```bash
pnpm db:generate
```

### Database Schema Out of Sync

**Problem**: Prisma errors about missing tables or columns

**Solution**: Reset the database:
```bash
pnpm db:push
```

### Auth Secret Error

**Problem**: Better Auth errors about missing or invalid secret

**Solution**: Ensure `AUTH_SECRET` is set in `.env.local`. Generate a new one:
```bash
openssl rand -base64 32
```

### Container Creation Fails

**Problem**: Error when deploying a Fresco instance

**Solutions**:
1. Check Docker network exists:
   ```bash
   docker network ls | grep fresco-platform-network
   ```

2. If missing, create it:
   ```bash
   docker network create fresco-platform-network
   ```

3. Verify the Fresco image is available:
   ```bash
   docker pull ghcr.io/complexdatacollective/fresco:latest
   ```

## Development Scripts

- `pnpm dev` - Start the Next.js development server
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm setup` - Run the setup script
- `pnpm dev:all` - Start all services (PostgreSQL + app)
- `pnpm test` - Run tests
- `pnpm test:watch` - Run tests in watch mode
- `pnpm typecheck` - Type check the codebase
- `pnpm db:generate` - Generate Prisma Client
- `pnpm db:push` - Push schema changes to database
- `pnpm db:migrate` - Create and run migrations
- `pnpm db:studio` - Open Prisma Studio (database GUI)

## Database Management

### View Database with Prisma Studio

```bash
pnpm db:studio
```

This opens a GUI at http://localhost:5555 where you can view and edit data.

### Reset Database

To completely reset the database:

```bash
docker exec -it fresco-postgres psql -U fresco_platform_app -d fresco_platform -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pnpm db:push
```

### Backup Database

```bash
docker exec fresco-postgres pg_dump -U fresco_platform_app fresco_platform > backup.sql
```

### Restore Database

```bash
docker exec -i fresco-postgres psql -U fresco_platform_app fresco_platform < backup.sql
```

## Architecture Overview

### Authentication Flow

1. User signs up via `/signup` - creates account in Better Auth
2. User signs in via `/login` - creates session
3. Protected routes check session via `AuthGuard` component
4. Session is validated on each request to protected routes
5. User can sign out, which invalidates the session

### Instance Deployment Flow

1. User completes signup wizard with subdomain and configuration
2. Platform creates database schema for the tenant
3. Docker container is created with:
   - Unique port mapping
   - Connection to shared PostgreSQL (tenant's schema)
   - Mounted volumes for data persistence
   - Connected to platform network
4. Container starts and Fresco application initializes
5. User can access their instance at the assigned port

### Database Structure

- **users** - User accounts (Better Auth)
- **sessions** - Active user sessions (Better Auth)
- **accounts** - Authentication providers (Better Auth)
- **tenants** - Fresco instances (one per user)
- **deployment_logs** - Audit trail of deployments
- **signup_sessions** - Temporary wizard state

## Production Deployment

Before deploying to production:

1. **Generate Strong Secrets**
   ```bash
   openssl rand -base64 32
   ```
   Use this for `AUTH_SECRET`

2. **Use Production Database**
   Update `DATABASE_URL` to point to production PostgreSQL

3. **Configure URLs**
   Update `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, and `AUTH_URL`

4. **Set NODE_ENV**
   ```env
   NODE_ENV="production"
   ```

5. **Enable HTTPS**
   Ensure all URLs use `https://` in production

6. **Resource Limits**
   Configure Docker resource limits for tenant containers

7. **Monitoring**
   Set up monitoring for container health and resource usage

## Getting Help

If you encounter issues not covered here:

1. Check the application logs for error details
2. Review Docker logs: `docker logs <container-name>`
3. Check PostgreSQL logs: `docker logs fresco-postgres`
4. Consult the [main project documentation](../../README.md)

## Next Steps

After setup, you can:

- Customize the platform theme and branding
- Add additional tenant configuration options
- Implement backup and restore features
- Add monitoring and alerting
- Configure email notifications
- Set up CI/CD pipelines
