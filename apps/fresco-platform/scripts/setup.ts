#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Docker from "dockerode";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

const colors = {
	reset: "\x1b[0m",
	bright: "\x1b[1m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
	blue: "\x1b[34m",
};

function log(_message: string, _color = colors.reset) {}

function logStep(step: string) {
	log(`\n${colors.bright}➜ ${step}${colors.reset}`, colors.blue);
}

function logSuccess(message: string) {
	log(`  ✓ ${message}`, colors.green);
}

function _logWarning(message: string) {
	log(`  ⚠ ${message}`, colors.yellow);
}

function logError(message: string) {
	log(`  ✗ ${message}`, colors.red);
}

async function checkDockerRunning(): Promise<boolean> {
	try {
		await docker.ping();
		return true;
	} catch {
		return false;
	}
}

async function checkPostgresConnection(): Promise<boolean> {
	try {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			logError("DATABASE_URL environment variable is not set");
			return false;
		}

		execSync("pnpm prisma db execute --stdin <<< 'SELECT 1;'", {
			stdio: "pipe",
			cwd: join(process.cwd()),
		});
		return true;
	} catch {
		return false;
	}
}

async function createDockerNetwork(): Promise<void> {
	const networkName = process.env.DOCKER_NETWORK || "fresco-platform-network";

	try {
		const networks = await docker.listNetworks();
		const networkExists = networks.some((network) => network.Name === networkName);

		if (networkExists) {
			logSuccess(`Docker network "${networkName}" already exists`);
			return;
		}

		await docker.createNetwork({
			Name: networkName,
			Driver: "bridge",
			CheckDuplicate: true,
		});

		logSuccess(`Created Docker network "${networkName}"`);
	} catch (error) {
		if (error instanceof Error) {
			logError(`Failed to create Docker network: ${error.message}`);
		}
		throw error;
	}
}

async function initializeDatabase(): Promise<void> {
	try {
		const prismaSchemaPath = join(process.cwd(), "prisma", "schema.prisma");

		if (!existsSync(prismaSchemaPath)) {
			logError("Prisma schema file not found");
			throw new Error("Prisma schema not found");
		}

		log("  Generating Prisma Client...");
		execSync("pnpm prisma generate", {
			stdio: "inherit",
			cwd: process.cwd(),
		});

		log("  Pushing database schema...");
		execSync("pnpm prisma db push", {
			stdio: "inherit",
			cwd: process.cwd(),
		});

		logSuccess("Database initialized successfully");
	} catch (error) {
		if (error instanceof Error) {
			logError(`Failed to initialize database: ${error.message}`);
		}
		throw error;
	}
}

async function checkEnvironmentVariables(): Promise<boolean> {
	const requiredVars = [
		"DATABASE_URL",
		"NEXT_PUBLIC_APP_URL",
		"NEXT_PUBLIC_API_URL",
		"AUTH_SECRET",
		"DOCKER_NETWORK",
		"FRESCO_IMAGE",
	];

	let allPresent = true;

	for (const varName of requiredVars) {
		if (!process.env[varName]) {
			logError(`Missing required environment variable: ${varName}`);
			allPresent = false;
		}
	}

	if (allPresent) {
		logSuccess("All required environment variables are set");
	}

	return allPresent;
}

async function main() {
	log(`\n${colors.bright}=================================`, colors.blue);
	log("  Fresco Platform Setup", colors.blue);
	log(`=================================${colors.reset}\n`);

	try {
		logStep("Checking environment variables");
		const envVarsOk = await checkEnvironmentVariables();
		if (!envVarsOk) {
			logError("Please set all required environment variables in .env.local");
			process.exit(1);
		}

		logStep("Checking Docker daemon");
		const dockerRunning = await checkDockerRunning();
		if (!dockerRunning) {
			logError("Docker daemon is not running");
			logError("Please start Docker Desktop and try again");
			process.exit(1);
		}
		logSuccess("Docker is running");

		logStep("Checking PostgreSQL connection");
		const postgresConnected = await checkPostgresConnection();
		if (!postgresConnected) {
			logError("Cannot connect to PostgreSQL");
			logError("Please ensure PostgreSQL is running and DATABASE_URL is correct");
			logError("You can start PostgreSQL with Docker:");
			log(
				"\n  docker run -d --name fresco-postgres -e POSTGRES_PASSWORD=localdev -e POSTGRES_USER=fresco_platform_app -e POSTGRES_DB=fresco_platform -p 5432:5432 postgres:16",
			);
			process.exit(1);
		}
		logSuccess("PostgreSQL is accessible");

		logStep("Creating Docker network");
		await createDockerNetwork();

		logStep("Initializing database");
		await initializeDatabase();

		logStep("Verifying setup");
		logSuccess("All checks passed!");

		log(`\n${colors.bright}${colors.green}Setup completed successfully!${colors.reset}\n`);
		log("You can now start the development server with:");
		log(`  ${colors.bright}pnpm dev${colors.reset}\n`);
		log("Or start everything (including backend services) with:");
		log(`  ${colors.bright}pnpm dev:all${colors.reset}\n`);
	} catch (error) {
		log(`\n${colors.bright}${colors.red}Setup failed!${colors.reset}\n`);
		if (error instanceof Error) {
			logError(error.message);
		}
		process.exit(1);
	}
}

main();
