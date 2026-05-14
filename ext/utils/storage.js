/**
 * Storage Service
 * Provides sync->local fallback and configuration migration
 */

import { DEFAULT_CONFIG, DEFAULT_FILTER_CONFIG } from "../config/constants.js";

// Namespace compatibility
const browserApi = messenger;

const cloneFilterConfig = (filters = DEFAULT_FILTER_CONFIG) =>
	filters.map((filter) => ({ ...filter }));

const normalizeFilters = (filters) => {
	if (!Array.isArray(filters) || filters.length === 0) {
		return cloneFilterConfig(DEFAULT_FILTER_CONFIG);
	}

	return DEFAULT_FILTER_CONFIG.map((def) => {
		const existing = filters.find((filter) => filter.id === def.id);
		return existing ? { ...def, ...existing } : { ...def };
	});
};

const migrateLegacyConfig = (data = {}) => {
	const migrated = { ...data };

	if (migrated.filterManual !== undefined && !migrated.filters) {
		migrated.filters = DEFAULT_FILTER_CONFIG.map((filter) => ({
			...filter,
			enabled:
				filter.id === "manual"
					? !!migrated.filterManual
					: filter.id === "preJunk"
						? !!migrated.filterNewMail
						: filter.id === "sending"
							? !!migrated.filterSending
							: filter.id === "archive"
								? !!migrated.filterArchive
								: filter.id === "periodic"
									? !!migrated.filterPeriodic
									: filter.enabled,
		}));

		delete migrated.filterManual;
		delete migrated.filterNewMail;
		delete migrated.filterSending;
		delete migrated.filterArchive;
		delete migrated.filterPeriodic;
	}

	migrated.filters = normalizeFilters(migrated.filters);

	if (migrated.folderRoot === undefined) {
		migrated.folderRoot = DEFAULT_CONFIG.folderRoot;
	}

	if (
		!migrated.accountPreferences ||
		typeof migrated.accountPreferences !== "object"
	) {
		migrated.accountPreferences = {};
	}

	return migrated;
};

export const get = async (keys = DEFAULT_CONFIG) => {
	try {
		const result = await browserApi.storage.sync.get(keys);
		return migrateLegacyConfig(result);
	} catch (error) {
		console.warn("Sync storage failed, using local:", error);
		const result = await browserApi.storage.local.get(keys);
		return migrateLegacyConfig(result);
	}
};

export const set = async (items) => {
	try {
		await browserApi.storage.sync.set(items);
	} catch (error) {
		console.warn("Sync storage failed, using local:", error);
		await browserApi.storage.local.set(items);
	}
};
