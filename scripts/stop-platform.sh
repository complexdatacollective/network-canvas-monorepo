#!/bin/bash

# Fresco Platform Stop Script
# This script stops all components of the Fresco Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping Fresco Platform...${NC}"
echo ""

# Stop tmux session if it exists
if command -v tmux &> /dev/null; then
    if tmux has-session -t fresco-platform 2>/dev/null; then
        echo -e "${YELLOW}Stopping application services...${NC}"
        tmux kill-session -t fresco-platform
        echo -e "${GREEN}✅ Application services stopped${NC}"
    fi
fi

# Stop Docker services
if [ -f "docker-compose.dev.yml" ]; then
    echo -e "${YELLOW}Stopping infrastructure services...${NC}"
    docker-compose -f docker-compose.dev.yml down
    echo -e "${GREEN}✅ Infrastructure services stopped${NC}"
else
    echo -e "${RED}⚠️  docker-compose.dev.yml not found${NC}"
    echo "Skipping infrastructure shutdown."
fi

echo ""
echo -e "${GREEN}✅ Fresco Platform stopped successfully${NC}"