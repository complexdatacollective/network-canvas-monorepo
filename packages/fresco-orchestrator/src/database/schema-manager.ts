import crypto from "node:crypto";
import { Client } from "pg";
import { z } from "zod";

export const TenantSchemaConfigSchema = z.object({
	tenantId: z.string().uuid(),
	databaseUrl: z.string(),
	schemaPrefix: z.string().default("tenant"),
});

export type TenantSchemaConfig = z.infer<typeof TenantSchemaConfigSchema>;

export interface TenantDatabaseInfo {
	schemaName: string;
	username: string;
	password: string;
	connectionString: string;
}

export class SchemaManager {
	private adminConnectionString: string;
	private databaseName: string;

	constructor(adminConnectionString: string) {
		this.adminConnectionString = adminConnectionString;
		// Extract database name from connection string
		const match = adminConnectionString.match(/\/([^/?]+)(\?|$)/);
		this.databaseName = match?.[1] || "fresco_platform";
	}

	/**
	 * Create a new schema and user for a tenant
	 */
	async createTenantSchema(config: TenantSchemaConfig): Promise<TenantDatabaseInfo> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();

			// Generate unique identifiers
			const schemaName = `${config.schemaPrefix}_${config.tenantId.replace(/-/g, "_")}`;
			const username = `tenant_user_${config.tenantId.replace(/-/g, "_")}`;
			const password = this.generateSecurePassword();

			// Start transaction
			await client.query("BEGIN");

			// Create schema
			await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

			// Create user with password
			await client.query(`CREATE USER "${username}" WITH PASSWORD '${password}'`);

			// Grant privileges on schema
			await client.query(`GRANT ALL PRIVILEGES ON SCHEMA "${schemaName}" TO "${username}"`);

			// Set default privileges for future objects
			await client.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
				 GRANT ALL PRIVILEGES ON TABLES TO "${username}"`,
			);
			await client.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
				 GRANT ALL PRIVILEGES ON SEQUENCES TO "${username}"`,
			);
			await client.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
				 GRANT ALL PRIVILEGES ON FUNCTIONS TO "${username}"`,
			);

			// Set search path for the user
			await client.query(`ALTER USER "${username}" SET search_path TO "${schemaName}"`);

			// Commit transaction
			await client.query("COMMIT");

			// Build connection string for tenant
			const url = new URL(this.adminConnectionString);
			url.username = username;
			url.password = password;
			url.pathname = `/${this.databaseName}`;
			url.searchParams.set("schema", schemaName);

			return {
				schemaName,
				username,
				password,
				connectionString: url.toString(),
			};
		} catch (error) {
			// Rollback on error
			await client.query("ROLLBACK");
			throw new Error(`Failed to create tenant schema: ${error}`);
		} finally {
			await client.end();
		}
	}

	/**
	 * Drop a tenant's schema and user
	 */
	async dropTenantSchema(tenantId: string): Promise<void> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();

			const schemaName = `tenant_${tenantId.replace(/-/g, "_")}`;
			const username = `tenant_user_${tenantId.replace(/-/g, "_")}`;

			// Start transaction
			await client.query("BEGIN");

			// Drop schema and all objects within it
			await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);

			// Drop user (this will fail if user owns objects in other schemas)
			await client.query(`DROP USER IF EXISTS "${username}"`);

			// Commit transaction
			await client.query("COMMIT");
		} catch (error) {
			// Rollback on error
			await client.query("ROLLBACK");
			throw new Error(`Failed to drop tenant schema: ${error}`);
		} finally {
			await client.end();
		}
	}

	/**
	 * Check if a schema exists
	 */
	async schemaExists(tenantId: string): Promise<boolean> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();

			const schemaName = `tenant_${tenantId.replace(/-/g, "_")}`;
			const result = await client.query(
				`SELECT 1 FROM information_schema.schemata
				 WHERE schema_name = $1`,
				[schemaName],
			);

			return result.rows.length > 0;
		} finally {
			await client.end();
		}
	}

	/**
	 * Get schema statistics
	 */
	async getSchemaStats(tenantId: string): Promise<{
		tableCount: number;
		totalSize: string;
		rowCount: number;
	}> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();

			const schemaName = `tenant_${tenantId.replace(/-/g, "_")}`;

			// Get table count
			const tableResult = await client.query(
				`SELECT COUNT(*) as count
				 FROM information_schema.tables
				 WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
				[schemaName],
			);

			// Get schema size
			const sizeResult = await client.query(
				`SELECT pg_size_pretty(SUM(pg_total_relation_size(quote_ident(schemaname)||'.'||quote_ident(tablename)))) as size
				 FROM pg_tables
				 WHERE schemaname = $1`,
				[schemaName],
			);

			// Get approximate row count across all tables
			const rowResult = await client.query(
				`SELECT SUM(n_live_tup) as count
				 FROM pg_stat_user_tables
				 WHERE schemaname = $1`,
				[schemaName],
			);

			return {
				tableCount: Number.parseInt(tableResult.rows[0]?.count || "0", 10),
				totalSize: sizeResult.rows[0]?.size || "0 bytes",
				rowCount: Number.parseInt(rowResult.rows[0]?.count || "0", 10),
			};
		} finally {
			await client.end();
		}
	}

	/**
	 * List all tenant schemas
	 */
	async listTenantSchemas(): Promise<string[]> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();

			const result = await client.query(
				`SELECT schema_name
				 FROM information_schema.schemata
				 WHERE schema_name LIKE 'tenant_%'
				 ORDER BY schema_name`,
			);

			return result.rows.map((row) => row.schema_name);
		} finally {
			await client.end();
		}
	}

	/**
	 * Test tenant connection
	 */
	async testTenantConnection(connectionString: string): Promise<boolean> {
		const client = new Client(connectionString);

		try {
			await client.connect();
			await client.query("SELECT 1");
			return true;
		} catch {
			return false;
		} finally {
			await client.end();
		}
	}

	/**
	 * Generate a secure random password
	 */
	private generateSecurePassword(length = 32): string {
		const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=";
		let password = "";
		const randomBytes = crypto.randomBytes(length);

		for (let i = 0; i < length; i++) {
			const byte = randomBytes[i];
			if (byte !== undefined) {
				password += charset[byte % charset.length];
			}
		}

		return password;
	}

	/**
	 * Health check for database connection
	 */
	async healthCheck(): Promise<boolean> {
		const client = new Client(this.adminConnectionString);

		try {
			await client.connect();
			await client.query("SELECT 1");
			return true;
		} catch {
			return false;
		} finally {
			await client.end();
		}
	}
}
