/**
 * Background Service Worker
 * Handles message routing and long-running operations
 */
import { RuleEngine, getUniquePaths } from "./modules/RuleEngine.js";
import { MailClient, sortPathsByDepth } from "./modules/MailClient.js";
import {
	MESSAGE_ACTIONS,
	MESSAGE_TYPES,
	PORT_NAMES,
	ERROR_MESSAGES,
} from "./config/constants.js";
import { toSet } from "./utils/data.js";

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Build sets of existing folder paths
 * @param {Array} folders - Array of folder objects
 * @returns {Object} Object with exact and lowercase path sets
 */
const buildExistingSets = (folders) => ({
	exact: toSet(folders.map((f) => f.cleanPath)),
	lower: toSet(folders.map((f) => f.cleanPath.toLowerCase())),
});

/**
 * Check if path is missing
 * @param {Object} existingSets - Existing path sets
 * @param {boolean} mergeCase - Whether to merge case-insensitive
 * @param {string} path - Path to check
 * @returns {boolean} True if missing
 */
const isMissingPath = (existingSets, mergeCase, path) => {
	if (existingSets.exact.has(path)) return false;
	if (mergeCase && existingSets.lower.has(path.toLowerCase())) return false;
	return true;
};

/**
 * Analyze account for missing folders
 * @param {Object} data - Analysis data
 * @returns {Promise<Object>} Analysis results
 */
async function analyze(data) {
	// Get existing folders
	const { folders } = await MailClient.scanAccount(data.accountId);
	const rootPath = (data.rootPath || "").replace(/\/+$/, "");
	const scopedFolders = rootPath
		? folders.filter(
				(folder) =>
					folder.cleanPath === rootPath ||
					folder.cleanPath.startsWith(`${rootPath}/`),
			)
		: folders;
	const existingSets = buildExistingSets(scopedFolders);

	// Parse required folders from rules
	const rules = RuleEngine.parse(data.filterContent);
	const requiredPaths = getUniquePaths(rules);
	const scopedRequiredPaths = rootPath
		? requiredPaths.filter(
				(path) => path === rootPath || path.startsWith(`${rootPath}/`),
			)
		: requiredPaths;

	// Find missing paths
	const missing = scopedRequiredPaths.filter((path) =>
		isMissingPath(existingSets, data.mergeCase, path),
	);

	return {
		accountId: data.accountId,
		totalRules: rules.length,
		totalLeafs: scopedRequiredPaths.length,
		missing,
	};
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Scan a specific folder for sender emails
 * @param {Object} data - Scan data
 * @returns {Promise<Object>} Object with folderId and senders
 */
async function scanFolderSenders(data) {
	const folderId = String(data.folderId);
	const folder = await messenger.folders.get(folderId);
	const account = await messenger.accounts.get(folder.accountId);
	const senders = await MailClient.getSenders(
		folderId,
		data.limit,
		account.identities,
	);
	return { folderId, senders };
}

// ============================================================================
// Folder Creation Functions
// ============================================================================

/**
 * Send progress message
 * @param {Object} port - Message port
 * @param {number} current - Current index
 * @param {number} total - Total count
 * @param {string} path - Current path
 */
const sendProgress = (port, current, total, path) => {
	port.postMessage({
		type: MESSAGE_TYPES.PROGRESS,
		current,
		total,
		path,
	});
};

/**
 * Send folder completion message
 * @param {Object} port - Message port
 * @param {string} path - Completed path
 */
const sendFolderComplete = (port, path) => {
	port.postMessage({
		type: MESSAGE_TYPES.FOLDER_COMPLETE,
		path,
	});
};

/**
 * Get parent folder ID for path segment
 * @param {Map} folderMap - Folder map
 * @param {Object} inbox - Inbox folder
 * @param {Array<string>} pathParts - Path segments
 * @param {number} index - Current index
 * @returns {string} Parent folder ID
 * @throws {Error} If parent not found
 */
const resolveRoot = (folders, preferredRoot) => {
	if (preferredRoot) {
		const match = folders.find(
			(folder) =>
				folder.cleanPath.toLowerCase() === preferredRoot.toLowerCase(),
		);
		if (match) return match;
	}
	return folders[0] || null;
};

const getParentId = (folderMap, rootFolder, pathParts, index) => {
	if (index === 0) return rootFolder.id;

	const parentPath = pathParts.slice(0, index).join("/").toLowerCase();
	if (!folderMap.has(parentPath)) {
		throw new Error(ERROR_MESSAGES.MISSING_PARENT(parentPath));
	}

	return folderMap.get(parentPath).id;
};

/**
 * Create folder and update cache
 * @param {Map} folderMap - Folder map to update
 * @param {string} parentId - Parent folder ID
 * @param {string} name - Folder name
 * @returns {Promise<void>}
 */
const createAndCache = async (folderMap, parentId, name) => {
	const created = await MailClient.createFolder(parentId, name);
	const createdPath = created.path.replace(/^\/+/, "");

	folderMap.set(createdPath.toLowerCase(), {
		...created,
		cleanPath: createdPath,
		id: String(created.id),
	});
};

/**
 * Process single path creation
 * @param {Map} folderMap - Folder map
 * @param {Object} inbox - Inbox folder
 * @param {string} path - Path to create
 * @returns {Promise<void>}
 */
const processPath = async (folderMap, rootFolder, path) => {
	const parts = path.split("/");

	for (let j = 0; j < parts.length; j++) {
		const currentPath = parts.slice(0, j + 1).join("/");
		const normalized = currentPath.toLowerCase();

		if (folderMap.has(normalized)) continue;

		const parentId = getParentId(folderMap, rootFolder, parts, j);
		await createAndCache(folderMap, parentId, parts[j]);
	}
};

/**
 * Handle folder creation error
 * @param {Error} error - Error object
 * @param {string} path - Path that failed
 * @param {Object} results - Results accumulator
 */
const handleCreationError = (error, path, results) => {
	if (!error.message.includes(ERROR_MESSAGES.ALREADY_EXISTS)) {
		results.failed.push({ path, error: error.message });
	} else {
		results.skipped.push(path);
	}
};

// ============================================================================
// Folder Deletion Functions
// ============================================================================

const SPECIAL_FOLDER_TYPES = new Set([
	"inbox",
	"trash",
	"drafts",
	"sent",
	"junk",
	"archive",
	"templates",
	"outbox",
	"virtual",
]);

const NON_RETRY_ERROR_MATCHES = [
	"not permitted",
	"permission",
	"special folder",
	"special",
	"not found",
	"does not exist",
	"cannot delete",
	"cant delete",
	"cannot remove",
	"cant remove",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryDelete = (errorMessage) => {
	const lower = (errorMessage || "").toLowerCase();
	return !NON_RETRY_ERROR_MATCHES.some((fragment) => lower.includes(fragment));
};

const verifyFolderDeleted = async (folderId) => {
	try {
		await messenger.folders.get(folderId);
		return false;
	} catch (e) {
		return true;
	}
};

const deleteWithRetry = async (folderId) => {
	try {
		await messenger.folders.delete(folderId);
		return {
			ok: true,
			verified: true,
			retryAttempted: false,
			errorMessage: null,
		};
	} catch (e) {
		const errorMessage = e?.message || "Delete failed";
		if (shouldRetryDelete(errorMessage)) {
			await sleep(200);
			try {
				await messenger.folders.delete(folderId);
				return {
					ok: true,
					verified: true,
					retryAttempted: true,
					errorMessage: null,
				};
			} catch (retryError) {
				const retryMessage = retryError?.message || errorMessage;
				const verified = await verifyFolderDeleted(folderId);
				return {
					ok: false,
					verified,
					retryAttempted: true,
					errorMessage: retryMessage,
				};
			}
		}
		const verified = await verifyFolderDeleted(folderId);
		return { ok: false, verified, retryAttempted: false, errorMessage };
	}
};

/**
 * Delete folders from paths (deepest first)
 * @param {Object} data - Deletion data
 * @param {Object} port - Message port
 * @returns {Promise<Object>} Deletion results
 */
async function deleteFolders(data, port) {
	const { accountId, paths } = data;
	const results = { deleted: [], failed: [] };

	const { folders } = await MailClient.scanAccount(accountId);
	const folderMap = new Map(folders.map((f) => [f.cleanPath.toLowerCase(), f]));
	const sortedPaths = sortPathsByDepth(paths).reverse();

	for (let i = 0; i < sortedPaths.length; i++) {
		const path = sortedPaths[i];
		sendProgress(port, i + 1, sortedPaths.length, path);
		const folder = folderMap.get(path.toLowerCase());
		if (!folder) {
			results.failed.push({
				path,
				error: `Folder not found: ${path}`,
				folder: null,
			});
			console.warn("Delete failed: folder not found", { path });
			continue;
		}
		if (
			folder.type &&
			SPECIAL_FOLDER_TYPES.has(String(folder.type).toLowerCase())
		) {
			results.failed.push({
				path,
				error: `Skipped special folder: ${folder.type}`,
				folder: {
					id: folder.id,
					name: folder.name,
					path: folder.path,
					cleanPath: folder.cleanPath,
					type: folder.type,
				},
			});
			console.warn("Delete skipped: special folder", {
				path,
				folderId: folder.id,
				type: folder.type,
			});
			continue;
		}
		const { ok, verified, retryAttempted, errorMessage } =
			await deleteWithRetry(folder.id);
		if (ok || verified) {
			results.deleted.push(path);
		} else {
			const error = retryAttempted
				? `Retry failed: ${errorMessage}`
				: errorMessage;
			results.failed.push({
				path,
				error,
				folder: {
					id: folder.id,
					name: folder.name,
					path: folder.path,
					cleanPath: folder.cleanPath,
					type: folder.type,
				},
			});
			console.error(
				retryAttempted ? "Delete failed after retry" : "Delete failed",
				{
					path,
					folderId: folder.id,
					name: folder.name,
					cleanPath: folder.cleanPath,
					type: folder.type,
					error: errorMessage,
				},
			);
		}
		await sleep(50);
	}

	if (results.failed.length > 0) {
		try {
			const { folders: finalFolders } = await MailClient.scanAccount(accountId);
			const finalSet = new Set(
				finalFolders.map((f) => f.cleanPath.toLowerCase()),
			);
			const confirmedFailed = [];
			results.failed.forEach((item) => {
				if (!finalSet.has(item.path.toLowerCase())) {
					results.deleted.push(item.path);
					console.info("Delete verified after error", { path: item.path });
				} else {
					confirmedFailed.push(item);
				}
			});
			results.failed = confirmedFailed;
		} catch (e) {
			console.warn("Delete verification failed", { error: e?.message || e });
		}
	}

	return results;
}

/**
 * Create folders from paths
 * @param {Object} data - Creation data
 * @param {Object} port - Message port
 * @returns {Promise<Object>} Creation results
 */
async function createFolders(data, port) {
	const { accountId, paths, preferredRoot } = data;
	const results = { created: [], skipped: [], failed: [] };

	// Sort by depth to ensure parents exist
	const sortedPaths = sortPathsByDepth(paths);

	// Refresh folder cache
	const { folders } = await MailClient.scanAccount(accountId);
	const folderMap = new Map(folders.map((f) => [f.cleanPath.toLowerCase(), f]));

	const rootFolder = resolveRoot(folders, preferredRoot);
	if (!rootFolder) throw new Error(ERROR_MESSAGES.NO_INBOX);

	// Process each path
	for (let i = 0; i < sortedPaths.length; i++) {
		const path = sortedPaths[i];
		sendProgress(port, i + 1, sortedPaths.length, path);

		try {
			await processPath(folderMap, rootFolder, path);
			results.created.push(path);
			sendFolderComplete(port, path);
		} catch (e) {
			handleCreationError(e, path, results);
		}
	}

	return results;
}

// ============================================================================
// Message Routing
// ============================================================================

/**
 * Route table for message actions
 */
const MESSAGE_ROUTES = {
	[MESSAGE_ACTIONS.ANALYZE]: analyze,
	[MESSAGE_ACTIONS.SCAN_FOLDER_SENDERS]: scanFolderSenders,
};

/**
 * Handle runtime message
 * @param {Object} msg - Message object
 * @returns {Promise<Object>} Standardized response
 */
const handleMessage = async (msg) => {
	const route = MESSAGE_ROUTES[msg.action];
	if (!route) {
		return { ok: false, error: `Unknown action: ${msg.action || "unknown"}` };
	}

	try {
		const data = await route(msg);
		return { ok: true, data };
	} catch (e) {
		return { ok: false, error: e?.message || "Unexpected error" };
	}
};

/**
 * Handle port connection for long-running operations
 * @param {Object} port - Message port
 */
const PORT_HANDLERS = {
	[PORT_NAMES.CREATE_FOLDERS]: createFolders,
	[PORT_NAMES.DELETE_FOLDERS]: deleteFolders,
};

const handlePortConnection = (port) => {
	const handler = PORT_HANDLERS[port.name];
	if (!handler) return;
	port.onMessage.addListener(async (msg) => {
		try {
			port.postMessage({
				type: MESSAGE_TYPES.COMPLETE,
				results: await handler(msg, port),
			});
		} catch (e) {
			port.postMessage({
				type: MESSAGE_TYPES.ERROR,
				error: e.message,
			});
		}
	});
};

/**
 * Launch or focus UI window
 */
const launchUI = async () => {
	const url = messenger.runtime.getURL("ui.html");
	const tabs = await messenger.tabs.query({ url });

	if (tabs.length) {
		await messenger.windows.update(tabs[0].windowId, { focused: true });
		await messenger.tabs.update(tabs[0].id, { active: true });
	} else {
		await messenger.tabs.create({ url });
	}
};

// ============================================================================
// Event Listeners
// ============================================================================

messenger.runtime.onMessage.addListener(handleMessage);
messenger.runtime.onConnect.addListener(handlePortConnection);
messenger.action.onClicked.addListener(launchUI);
