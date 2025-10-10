import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dashboardApi } from "../lib/dashboard-mock-api";

export function useTenants(page = 1, limit = 10) {
	return useQuery({
		queryKey: ["tenants", page, limit],
		queryFn: () => dashboardApi.listTenants(page, limit),
	});
}

export function useTenant(id: string) {
	return useQuery({
		queryKey: ["tenant", id],
		queryFn: () => dashboardApi.getTenant(id),
		enabled: !!id,
	});
}

export function useStartTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => dashboardApi.startTenant(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			queryClient.invalidateQueries({ queryKey: ["tenant"] });
		},
	});
}

export function useStopTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => dashboardApi.stopTenant(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			queryClient.invalidateQueries({ queryKey: ["tenant"] });
		},
	});
}

export function useRestartTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => dashboardApi.restartTenant(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
			queryClient.invalidateQueries({ queryKey: ["tenant"] });
		},
	});
}

export function useDestroyTenant() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (id: string) => dashboardApi.destroyTenant(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["tenants"] });
		},
	});
}

export function useTenantMetrics(id: string, refetchInterval?: number) {
	return useQuery({
		queryKey: ["tenant-metrics", id],
		queryFn: () => dashboardApi.getTenantMetrics(id),
		enabled: !!id,
		refetchInterval: refetchInterval || false,
	});
}

export function useTenantLogs(id: string, lines = 100) {
	return useQuery({
		queryKey: ["tenant-logs", id, lines],
		queryFn: () => dashboardApi.getTenantLogs(id, lines),
		enabled: !!id,
		refetchInterval: 5000,
	});
}
