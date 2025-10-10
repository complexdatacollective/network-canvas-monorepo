import { orpcClient } from "./orpc-client";

type CheckSubdomainResponse = {
	available: boolean;
	suggestions: string[];
};

type CreateSessionResponse = {
	sessionId: string;
	resumed: boolean;
};

type UpdateSessionResponse = {
	success: boolean;
};

type GetSessionResponse = {
	email: string;
	stepCompleted: number;
	data: Record<string, unknown>;
};

type DeployTenantResponse = {
	userId: string;
	tenantId: string;
	subdomain: string;
};

type DeploymentStatusResponse = {
	status: string;
	subdomain: string;
	lastAction?: string;
	lastStatus?: string;
	error?: string;
};

export const wizardApi = {
	async checkSubdomain(subdomain: string): Promise<CheckSubdomainResponse> {
		return orpcClient.wizard.checkSubdomain({ subdomain });
	},

	async createSession(email: string): Promise<CreateSessionResponse> {
		return orpcClient.wizard.createSession({ email });
	},

	async updateSession(sessionId: string, step: number, data: Record<string, unknown>): Promise<UpdateSessionResponse> {
		return orpcClient.wizard.updateSession({ sessionId, step, data });
	},

	async getSession(sessionId: string): Promise<GetSessionResponse> {
		return orpcClient.wizard.getSession({ sessionId });
	},

	async deployTenant(sessionId: string): Promise<DeployTenantResponse> {
		return orpcClient.wizard.deployTenant({ sessionId });
	},

	async getDeploymentStatus(tenantId: string): Promise<DeploymentStatusResponse> {
		return orpcClient.wizard.getDeploymentStatus({ tenantId });
	},
};
