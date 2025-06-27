import { createSelector } from "@reduxjs/toolkit";
import {
	selectAllProtocols,
	selectProtocolById,
	selectRecentProtocols,
	selectProtocolExists,
} from "~/ducks/modules/protocols";

// Re-export the main selectors from the protocols module for convenience
export { selectAllProtocols, selectProtocolById, selectRecentProtocols, selectProtocolExists };

// Additional convenience selectors

/**
 * Get the most recently modified protocol
 */
export const getMostRecentProtocol = createSelector([selectAllProtocols], (protocols) => protocols[0] || null);

/**
 * Get protocol count
 */
export const getProtocolCount = createSelector([selectAllProtocols], (protocols) => protocols.length);

/**
 * Get protocols by name search
 */
export const makeGetProtocolsBySearch = () =>
	createSelector([selectAllProtocols, (state, searchTerm) => searchTerm], (protocols, searchTerm) => {
		if (!searchTerm) return protocols;

		const lowerSearchTerm = searchTerm.toLowerCase();
		return protocols.filter(
			(protocol) =>
				protocol.name.toLowerCase().includes(lowerSearchTerm) ||
				(protocol.description && protocol.description.toLowerCase().includes(lowerSearchTerm)),
		);
	});

/**
 * Check if any protocols exist
 */
export const getHasAnyProtocols = createSelector([selectAllProtocols], (protocols) => protocols.length > 0);

/**
 * Get protocols created in the last N days
 */
export const makeGetRecentlyCreatedProtocols = (days = 7) =>
	createSelector([selectAllProtocols], (protocols) => {
		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
		return protocols.filter((protocol) => protocol.createdAt > cutoffTime);
	});

/**
 * Get protocols modified in the last N days
 */
export const makeGetRecentlyModifiedProtocols = (days = 7) =>
	createSelector([selectAllProtocols], (protocols) => {
		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
		return protocols.filter((protocol) => protocol.lastModified > cutoffTime);
	});
