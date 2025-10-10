#!/bin/bash

# Fresco Platform Startup Script
# This script starts all components needed for the Fresco Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Fresco Platform...${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running!${NC}"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo -e "${GREEN}✅ Docker is running${NC}"

# Check if docker-compose.dev.yml exists
if [ ! -f "docker-compose.dev.yml" ]; then
    echo -e "${RED}❌ docker-compose.dev.yml not found!${NC}"
    echo "Please run this script from the project root directory."
    exit 1
fi

# Start infrastructure services
echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker-compose -f docker-compose.dev.yml up -d

# Wait for PostgreSQL to be ready
echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
until docker exec fresco-platform-db pg_isready -U postgres > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo ""
echo -e "${GREEN}✅ PostgreSQL is ready${NC}"

# Check if packages need to be installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
fi

# Build packages
echo -e "${YELLOW}Building packages...${NC}"
pnpm --filter "@fresco/*" build

# Setup database
echo -e "${YELLOW}Setting up database...${NC}"
cd apps/fresco-platform
if [ ! -f ".env.local" ]; then
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}Creating .env.local from .env.example...${NC}"
        cp .env.example .env.local
        echo -e "${YELLOW}⚠️  Please update .env.local with your configuration${NC}"
    else
        echo -e "${RED}❌ No .env.local or .env.example found!${NC}"
        echo "Please create apps/fresco-platform/.env.local with your configuration."
        exit 1
    fi
fi

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

cd ../..

# Create a tmux session or use separate terminals
if command -v tmux &> /dev/null; then
    echo -e "${YELLOW}Starting services in tmux...${NC}"

    # Kill existing session if it exists
    tmux kill-session -t fresco-platform 2>/dev/null || true

    # Create new session
    tmux new-session -d -s fresco-platform -n api

    # Start API server
    tmux send-keys -t fresco-platform:api "cd packages/fresco-api && pnpm dev" C-m

    # Create window for NextJS app
    tmux new-window -t fresco-platform -n app
    tmux send-keys -t fresco-platform:app "cd apps/fresco-platform && pnpm dev" C-m

    echo ""
    echo -e "${GREEN}✅ All services started successfully!${NC}"
    echo ""
    echo -e "${GREEN}Services are running at:${NC}"
    echo -e "  • Frontend: ${YELLOW}http://localhost:3001${NC}"
    echo -e "  • API: ${YELLOW}http://localhost:3000${NC}"
    echo -e "  • Traefik Dashboard: ${YELLOW}http://localhost:8080${NC}"
    echo -e "  • PostgreSQL: ${YELLOW}localhost:5432${NC}"
    echo ""
    echo -e "${GREEN}To view logs:${NC}"
    echo -e "  • tmux attach -t fresco-platform"
    echo -e "  • Switch windows with Ctrl+B then 0 (API) or 1 (App)"
    echo -e "  • Detach with Ctrl+B then D"
    echo ""
    echo -e "${GREEN}To stop all services:${NC}"
    echo -e "  • Run: ${YELLOW}./scripts/stop-platform.sh${NC}"
else
    echo ""
    echo -e "${GREEN}✅ Infrastructure started successfully!${NC}"
    echo ""
    echo -e "${YELLOW}Please start the following services in separate terminals:${NC}"
    echo ""
    echo -e "${GREEN}Terminal 1 - API Server:${NC}"
    echo "  cd packages/fresco-api && pnpm dev"
    echo ""
    echo -e "${GREEN}Terminal 2 - NextJS App:${NC}"
    echo "  cd apps/fresco-platform && pnpm dev"
    echo ""
    echo -e "${GREEN}Services will be available at:${NC}"
    echo -e "  • Frontend: ${YELLOW}http://localhost:3001${NC}"
    echo -e "  • API: ${YELLOW}http://localhost:3000${NC}"
    echo -e "  • Traefik Dashboard: ${YELLOW}http://localhost:8080${NC}"
    echo -e "  • PostgreSQL: ${YELLOW}localhost:5432${NC}"
fi