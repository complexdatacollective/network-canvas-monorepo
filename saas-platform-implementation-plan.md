# Multi-Tenant SaaS Platform Implementation Plan

## Project-Specific Decisions

### Implementation Context
- **Starting Point**: Starting from scratch within the existing Network Canvas monorepo
- **Monorepo Integration**: Platform will be integrated into the existing monorepo structure following NextJS and oRPC best practices
- **Database Strategy**: Platform and tenant databases will share the same PostgreSQL instance using schema-based isolation
- **Container Image**: Using existing Fresco image at `ghcr.io/complexdatacollective/fresco:latest`
- **Deployment Target**: Linux VPS provider with documented requirements
- **Traefik**: Will be pre-configured in production environment
- **Development Approach**: Flexible phase ordering based on technical dependencies

### Local Development Requirements
- Docker and Docker Compose for container orchestration
- PostgreSQL instance for both platform and tenant schemas
- Local Traefik or similar proxy for subdomain routing simulation
- Node.js 22+ and pnpm for monorepo management

## Executive Summary

This document outlines the implementation plan for a multi-tenant SaaS platform that enables users to sign up and deploy isolated instances of a containerized application. The platform provides automated provisioning, management, and monitoring of tenant applications through a web-based interface.

## 1. System Overview

### 1.1 Core Objectives

- Enable self-service deployment of application instances
- Provide complete tenant isolation at database and container levels
- Automate infrastructure provisioning and management
- Deliver real-time monitoring and control capabilities
- Ensure secure, scalable multi-tenant architecture

### 1.2 Key Components

- **Orchestration Service**: Manages Docker containers and database schemas
- **API Layer**: Type-safe RPC interface using oRPC via Hono adapter (<https://orpc.unnoq.com/docs/adapters/hono>)
- **Web Application**: NextJS-based signup wizard and admin dashboard
- **Database Layer**: PostgreSQL with schema-based tenant isolation
- **Connection Pooler**: Efficiently manages database connections
- **Reverse Proxy**: Traefik for routing and SSL termination (already implemented in infrastructure)
- **Container Runtime**: Docker for application isolation

## 2. Architecture Specification

### 2.1 System Architecture

#### Three-Tier Architecture

1. **Presentation Layer**: NextJS web application
2. **Application Layer**: Node.js/TypeScript backend with oRPC
3. **Data/Infrastructure Layer**: PostgreSQL database behind connection pooler, and Docker engine

#### Component Communication Flow

- Frontend communicates with backend exclusively through oRPC procedures
- Backend orchestrator interacts with Docker daemon via Unix socket
- Database connections use connection pooling for efficiency
- Traefik handles all inbound HTTP/HTTPS traffic routing
- Instances are accessible via unique subdomains

### 2.2 Deployment Architecture

#### VPS Infrastructure Requirements

**Minimum System Requirements:**
- Linux-based OS (Ubuntu 22.04 LTS or similar)
- 4GB RAM minimum (2GB for platform, 2GB for initial tenants)
- 2 CPU cores minimum
- 40GB SSD storage (for OS, Docker images, and database)
- Docker Engine 24+ and Docker Compose v2+
- PostgreSQL 16+ with UUID extension
- Node.js 22+ runtime (for platform backend)
- systemd or PM2 for process management

**Per-Tenant Resource Allocation:**
- 256-512MB RAM per Fresco container
- 0.25-0.5 CPU cores per container
- ~100MB disk space per tenant (logs, temp files)
- Dedicated PostgreSQL schema

**Production Requirements:**
- Traefik reverse proxy (pre-configured)
- Let's Encrypt SSL certificates
- PgBouncer for connection pooling
- Automated backup solution
- Monitoring stack (optional: Prometheus + Grafana)

#### Network Architecture

- Single Docker network for all services
- PostgreSQL accessible only within Docker network
- Traefik handles all external traffic (ports 80/443)
- Internal services communicate via Docker network
- Tenant containers isolated but routable via Traefik

## 3. Technology Stack

### 3.1 Backend Technologies

- **Runtime**: Node.js 22 with TypeScript 5+
- **RPC Framework**: oRPC for type-safe API communication via Hono adapter (<https://orpc.unnoq.com/docs/adapters/hono>)
- **Container Management**: Dockerode for Docker API interaction
- **Database Client**: node-postgres (pg) for PostgreSQL
- **Connection Pooling**: PgBouncer for efficient DB connections
- **Authentication**: Better-Auth (<https://www.better-auth.com/>) using Hono integration
- **Validation**: Zod v4 for schema validation
- **API Server**: Hono framework

### 3.2 Frontend Technologies

- **Framework**: Next.js 15+ with App Router
- **Language**: TypeScript for type safety
- **RPC Client**: oRPC client with React Query integration
- **Styling**: Tailwind CSS
- **State Management**: zustand and React Query for server state
- **Form Handling**: React Hook Form with Zod validation
- **Authentication**: Better-Auth (<https://www.better-auth.com/>) using Hono integration

### 3.3 Infrastructure Technologies

- **Container Runtime**: Docker Engine 24+
- **Reverse Proxy**: Traefik 3.x with automatic SSL
- **Database**: PostgreSQL 16+ with schema isolation
- **Connection Pooler**: PgBouncer for managing DB connections
- **Process Manager**: PM2 or systemd for backend service
- **Monitoring**: Docker stats API for container metrics

## 4. Database Design

### 4.1 Platform Database Schema

Use Prisma ORM for schema definition and migrations.

#### Users Table

Refer to Better Auth documentation for user schema requirements (<https://www.better-auth.com/>).

- **id**: UUID primary key
- **email**: Unique user email
- **password_hash**: Bcrypt/Argon2 hashed password
- **email_verified**: Boolean verification status
- **created_at**: Timestamp of account creation
- **last_login**: Timestamp of last authentication
- **metadata**: JSONB for additional user data

#### Tenants Table

- **id**: UUID primary key
- **user_id**: Foreign key to users table
- **tenant_identifier**: Unique identifier for Docker/DB operations
- **subdomain**: Unique subdomain for tenant access
- **status**: Enum (pending, provisioning, active, stopped, error)
- **container_id**: Docker container identifier
- **created_at**: Timestamp of tenant creation
- **last_deployed_at**: Timestamp of last deployment
- **metadata**: JSONB for configuration and settings
- **resource_limits**: JSONB for CPU/memory constraints

#### Deployment Logs Table

- **id**: UUID primary key
- **tenant_id**: Foreign key to tenants table
- **action**: Action type (create, start, stop, destroy)
- **status**: Result status (initiated, success, failed)
- **error_message**: Error details if failed
- **metadata**: JSONB for additional context
- **created_at**: Timestamp of log entry

#### Signup Sessions Table

- **id**: UUID primary key
- **email**: User email address
- **step_completed**: Current wizard step
- **data**: JSONB for wizard state
- **expires_at**: Session expiration timestamp
- **created_at**: Session creation timestamp

### 4.2 Tenant Database Isolation

#### Schema-Based Isolation Strategy

**Shared PostgreSQL Instance Architecture:**
- Single PostgreSQL instance hosts both platform and tenant data
- Platform uses default `public` schema
- Each tenant receives dedicated schema: `tenant_{identifier}`
- Tenant schemas in same database as platform for simplified management
- Connection string includes schema specification for tenant isolation

**Tenant Schema Configuration:**
- Schema name format: `tenant_{uuid}` (e.g., `tenant_a1b2c3d4`)
- Dedicated database user per tenant: `tenant_user_{uuid}`
- Automatic search_path configuration: `SET search_path TO tenant_{uuid}`
- Environment variables passed to Fresco containers:
  - `DATABASE_URL`: Connection string with schema-specific user
  - `DATABASE_SCHEMA`: Schema name for explicit reference

#### Security Considerations

- Tenant users restricted to their own schema only
- No access to `public` schema (platform data)
- No cross-schema access between tenants
- REVOKE all default privileges, then GRANT specific:
  - `USAGE` on schema
  - `CREATE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` on tables
- Connection pooling with user-based separation
- Automated cleanup on tenant deletion (CASCADE drop)

## 5. API Specification

### 5.1 oRPC Contract Definition

#### Authentication Procedures

- Refer to better auth documentation for requirements (<https://www.better-auth.com/>)

#### Signup Wizard Procedures

**wizard.checkSubdomain**

- Input: subdomain string
- Output: availability boolean, suggestions array
- Validation: Subdomain format and uniqueness
- Real-time availability checking

**wizard.createSignupSession**

- Input: email
- Output: sessionId
- Validation: Email format
- Session expiration: 1 hour

**wizard.updateSession**

- Input: sessionId, step, data
- Output: success boolean
- Validation: Session validity, step progression
- State persistence between steps

**wizard.deployTenant**

- Input: sessionId, configuration
- Output: tenantId, deployment status
- Validation: Complete session data
- Asynchronous deployment process

#### Tenant Management Procedures

**tenants.list**

- Input: pagination parameters
- Output: array of tenant objects
- Authorization: User authentication required
- Includes container status and metrics

**tenants.get**

- Input: tenantId
- Output: detailed tenant object
- Authorization: Owner verification
- Includes logs and metrics

**tenants.start**

- Input: tenantId
- Output: success status
- Authorization: Owner verification
- Container state validation

**tenants.stop**

- Input: tenantId
- Output: success status
- Authorization: Owner verification
- Graceful shutdown process

**tenants.restart**

- Input: tenantId
- Output: success status
- Authorization: Owner verification
- Health check after restart

**tenants.destroy**

- Input: tenantId, confirmation
- Output: success status
- Authorization: Owner verification
- Complete cleanup process

**tenants.getLogs**

- Input: tenantId, filter parameters
- Output: array of log entries
- Authorization: Owner verification
- Pagination support

**tenants.getMetrics**

- Input: tenantId, time range
- Output: CPU, memory, network statistics
- Authorization: Owner verification
- Real-time and historical data

### 5.2 Middleware Requirements

#### Authentication Middleware

See better auth documentation for requirements (<https://www.better-auth.com/>).

#### Rate Limiting Middleware

- Per-user request limits
- Endpoint-specific limits
- Deployment action throttling
- DDoS protection

#### Validation Middleware

- Input schema validation
- Output format consistency
- Error standardization
- Type coercion (check oRPC docs)

#### Logging Middleware

- Request/response logging
- Performance metrics
- Error tracking
- Audit trail

## 6. Frontend Requirements

### 6.1 Public Pages

#### Landing Page

- Marketing content:draw from Fresco project documentation: <https://documentation.networkcanvas.com/en/fresco>

- value proposition
- Feature highlights
- Call-to-action for deployment

#### Login Page

- Email/password authentication
- "Remember me" functionality
- Password reset link
- Social login options (future)

#### Signup Wizard

**Step 1: Account Creation**

- Email input with validation
- Password input with strength indicator
- Password confirmation
- Email verification notice

**Step 2: Intended use-case**

- Radio group: Conducting a study, Testing features, Learning the platform, Other (with text input)
- If "testing features" or "learning the platform" is selected, suggest the user use the Fresco sandbox instead.
- Otherwise continue.

**Step 3: Subdomain Selection**

- Subdomain input with real-time availability
- Subdomain format requirements display
- Alternative suggestions on conflict
- Preview of final URL

**Step 4: Terms and Conditions**

- Scrollable terms display
- Mandatory agreement checkbox
- Privacy policy link
- Service level agreement

**Step 5: Deployment Progress**

- Real-time deployment status
- Progress indicators
- Estimated completion time
- Error handling and retry options

**Step 6: Success Confirmation**

- Deployment confirmation
- Access credentials display
- Quick start guide
- Dashboard navigation

### 6.2 Dashboard Pages

#### Applications Overview

- Grid/list view of all tenants
- Status indicators (active, stopped, error)
- Quick action buttons
- Resource usage summary
- Search and filter capabilities

#### Application Details

- Comprehensive status information
- Resource usage graphs
- Access URL and credentials
- Environment variables management
- Custom domain configuration (future)

#### Logs Viewer

- Real-time log streaming
- Log level filtering
- Search functionality
- Export capabilities
- Timestamp display

#### Settings Page

- Account information management
- Password change functionality
- Email preferences
- Billing information (future)
- API key management (future)

#### Support Page

- Documentation links
- Contact support form
- FAQ section
- System status page

### 6.3 UI/UX Requirements

#### Design System

- Use tailwind theme variables from Fresco: tooling/tailwind/fresco.css
- Consistent color palette
- Typography hierarchy
- Component library
- Responsive design
- Use existing components where possible (packages/ui)
- Use radix primitives where needed

#### Accessibility

- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader compatibility
- Focus indicators
- Error message clarity

#### Performance

- Initial load under 3 seconds
- Lazy loading for heavy components
- Optimistic UI updates
- Proper loading states
- Error boundaries

## 7. Container Orchestration

### 7.1 Docker Management

#### Container Lifecycle

**Fresco Container Deployment:**
- Image: `ghcr.io/complexdatacollective/fresco:latest`
- Container naming: `fresco_tenant_{uuid}`
- Environment variables injected at runtime:
  - `DATABASE_URL`: PostgreSQL connection with tenant schema
  - `FRESCO_URL`: Public URL (https://{subdomain}.example.com)
  - `NODE_ENV`: "production"
  - Additional Fresco-specific configuration
- Health check endpoint monitoring
- Automatic restart policy: `unless-stopped`
- Graceful shutdown handling (SIGTERM)

#### Resource Management

**Container Resource Limits:**
- Memory: 256MB minimum, 512MB recommended
- Memory swap: Limited to 2x memory allocation
- CPU: 0.25 cores minimum, 0.5 cores recommended
- PIDs limit: 100 per container
- Storage: No explicit limit (monitor usage)
- Network: Unrestricted within Docker network

**Monitoring and Enforcement:**
- Docker stats API for real-time metrics
- OOM killer protection for platform services
- Automatic container restart on crash
- Resource alerts at 80% utilization

#### Image Management

**Fresco Image Handling:**
- Pull from GitHub Container Registry (ghcr.io)
- Image updates coordinated with tenant restarts
- Version pinning option for stability
- Local image caching for faster deployments
- Registry authentication via Docker secrets

### 7.2 Traefik Configuration

#### Routing Rules

- Dynamic subdomain-based routing
- Automatic SSL certificate generation
- WebSocket support
- Load balancing (future)
- Custom domain support (future)

#### Security Headers

- HSTS enforcement
- XSS protection
- Content type sniffing prevention
- Frame options
- CSP headers

#### Monitoring

- Access log collection
- Metrics exposure
- Health check endpoints
- Certificate renewal monitoring

## 8. Security Requirements

### 8.1 Application Security

#### Authentication and Authorization

- Secure password storage (bcrypt/argon2)
- JWT with short expiration times
- Refresh token rotation
- Session management
- Multi-factor authentication (future)

#### Input Validation

- All inputs sanitized and validated
- SQL injection prevention
- XSS protection
- Command injection prevention
- Path traversal protection

#### API Security

- HTTPS enforcement
- CORS configuration
- Rate limiting
- API versioning
- Request signing (optional)

### 8.2 Infrastructure Security

#### Docker Security

- Read-only Docker socket access
- Limited Docker API permissions
- Container isolation
- Security scanning of images
- Runtime security monitoring

#### Database Security

- Encrypted connections
- Principle of least privilege
- Regular security updates
- Backup encryption
- Audit logging

#### Network Security

- Firewall configuration
- DDoS protection
- Intrusion detection
- VPN access for administration
- Regular security audits

### 8.3 Data Protection

#### Privacy Compliance

- GDPR compliance measures
- Data minimization
- Right to deletion
- Data portability
- Privacy policy

#### Backup and Recovery

- Automated daily backups
- Point-in-time recovery
- Backup encryption
- Off-site backup storage
- Regular recovery testing

## 9. Monitoring and Observability

### 9.1 Application Monitoring

#### Performance Metrics

- API response times
- Database query performance
- Container startup times
- Resource utilization
- Error rates

#### Business Metrics

- User signups
- Tenant deployments
- Active tenants
- Resource consumption
- Feature usage

### 9.2 Infrastructure Monitoring

#### System Metrics

- CPU utilization
- Memory usage
- Disk I/O
- Network throughput
- Container health

#### Alerting Rules

- Container failures
- High resource usage
- Database connection issues
- SSL certificate expiration
- Deployment failures

### 9.3 Logging Strategy

#### Log Collection

- Centralized log aggregation
- Structured logging format
- Log retention policies
- Log rotation
- Search and analysis tools

#### Audit Logging

- User actions
- Administrative changes
- Security events
- Deployment activities
- Access logs

## 10. Implementation Approach

### Development Priority Order

Implementation will proceed based on technical dependencies rather than strict phases:

#### 1. Foundation Components
- **Local development environment** (Docker Compose setup)
- **Monorepo structure** (NextJS app, API package, orchestrator package)
- **Database setup** (PostgreSQL with Prisma, schema design)
- **Basic Docker orchestration** (Container management via Dockerode)

#### 2. Core Platform Services
- **Authentication system** (Better Auth integration)
- **oRPC API setup** (Hono adapter, type-safe procedures)
- **Tenant provisioning** (Schema creation, container deployment)
- **Basic monitoring** (Container stats, health checks)

#### 3. User-Facing Features
- **Signup wizard** (Multi-step form with validation)
- **Admin dashboard** (Tenant management interface)
- **Public pages** (Landing, login, documentation)
- **Real-time updates** (WebSocket or polling for status)

#### 4. Production Readiness
- **Security hardening** (Input validation, rate limiting)
- **Error handling** (Comprehensive error recovery)
- **Monitoring/logging** (Structured logs, metrics)
- **Documentation** (Deployment guide, API docs)
- **Testing** (Unit, integration, E2E tests)

### Monorepo Integration

#### Directory Structure
```
apps/
  fresco-platform/      # NextJS SaaS platform app
    src/
      app/              # App router pages
      components/       # Platform-specific components
      lib/              # Client utilities
packages/
  fresco-api/          # oRPC API with Hono
    src/
      procedures/      # oRPC procedures
      middleware/      # Auth, validation, etc.
  fresco-orchestrator/ # Docker/DB management
    src/
      docker/          # Container management
      database/        # Schema provisioning
      monitoring/      # Metrics collection
  fresco-shared/       # Shared types and utilities
    src/
      types/           # TypeScript types
      schemas/         # Zod schemas
```

### Local Development Setup

#### docker-compose.yml
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: fresco_platform
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## 11. Scalability Considerations

### 11.1 Horizontal Scaling

#### Application Layer

- Stateless backend design
- Load balancer configuration
- Session management
- Cache implementation
- Database connection pooling

#### Database Scaling

- Read replica configuration
- Connection pooling
- Query optimization
- Index management
- Partitioning strategy

### 11.2 Vertical Scaling

#### Resource Planning

- Tenant density calculations
- Memory allocation strategy
- CPU allocation strategy
- Storage requirements
- Network bandwidth planning

### 11.3 Future Enhancements

#### Feature Roadmap

- Custom domains
- Backup/restore functionality
- Team collaboration features
- API access for tenants
- White-label options

#### Technical Improvements

- Kubernetes migration path
- Multi-region deployment
- CDN integration
- GraphQL API option
- WebSocket support

## 12. Maintenance and Operations

### 12.1 Routine Maintenance

#### Daily Tasks

- Monitor system health
- Review error logs
- Check backup completion
- Verify SSL certificates
- Monitor resource usage

#### Weekly Tasks

- Security updates review
- Performance analysis
- Capacity planning review
- User feedback review
- Documentation updates

#### Monthly Tasks

- Security audit
- Disaster recovery test
- Performance optimization
- Cost analysis
- Feature planning

### 12.2 Incident Response

#### Response Procedures

- Incident classification
- Escalation paths
- Communication protocols
- Resolution tracking
- Post-mortem process

#### Recovery Procedures

- Backup restoration
- Container recovery
- Database recovery
- DNS failover
- Communication plan

## 13. Documentation Requirements

### 13.1 Technical Documentation

#### API Documentation

- Endpoint descriptions
- Request/response schemas
- Authentication guide
- Error codes
- Rate limits

#### Deployment Documentation

- Installation guide
- Configuration reference
- Troubleshooting guide
- Upgrade procedures
- Backup procedures

### 13.2 User Documentation

#### End User Guides

- Getting started guide
- Feature documentation
- FAQ section
- Video tutorials
- Support resources

#### Administrator Guides

- System administration
- User management
- Monitoring guide
- Security best practices
- Troubleshooting guide

## 14. Success Metrics

### 14.1 Technical Metrics

- System uptime (target: 99.9%)
- Average deployment time (<2 minutes)
- API response time (<200ms p95)
- Container startup time (<10 seconds)
- Error rate (<0.1%)

### 14.2 Business Metrics

- User activation rate
- Tenant retention rate
- Resource utilization efficiency
- Support ticket volume
- Feature adoption rate

## 15. Risk Assessment

### 15.1 Technical Risks

#### High Priority

- Docker daemon failure
- Database corruption
- Security breach
- Resource exhaustion
- Network outage

#### Mitigation Strategies

- Redundancy implementation
- Regular backups
- Security audits
- Resource monitoring
- Failover procedures

### 15.2 Business Risks

#### Identified Risks

- Low user adoption
- Scaling challenges
- Competition
- Regulatory changes
- Technical debt

#### Mitigation Approaches

- User feedback loops
- Incremental scaling
- Feature differentiation
- Compliance monitoring
- Regular refactoring

## Conclusion

This implementation plan provides a comprehensive roadmap for building a robust multi-tenant SaaS platform. The architecture emphasizes security, scalability, and maintainability while delivering a seamless user experience. Success depends on careful execution of each phase, continuous monitoring, and iterative improvements based on user feedback and operational insights.

The modular design allows for future enhancements and scaling strategies, ensuring the platform can grow with demand while maintaining performance and reliability standards.
