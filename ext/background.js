/**
 * Background Service Worker
 * Handles message routing and long-running operations
 */
import { RuleEngine, getUniquePaths } from './modules/RuleEngine.js'
import { MailClient, findInboxFolder, sortPathsByDepth } from './modules/MailClient.js'
import {
	MESSAGE_ACTIONS,
	MESSAGE_TYPES,
	PORT_NAMES,
	ERROR_MESSAGES
} from './config/constants.js'
import { toSet } from './utils/data.js'

// ============================================================================
// Analysis Functions
// ============================================================================

/**
 * Build sets of existing folder paths
 * @param {Array} folders - Array of folder objects
 * @returns {Object} Object with exact and lowercase path sets
 */
const buildExistingSets = (folders) => ({
	exact: toSet(folders.map(f => f.cleanPath)),
	lower: toSet(folders.map(f => f.cleanPath.toLowerCase()))
})

/**
 * Check if path is missing
 * @param {Object} existingSets - Existing path sets
 * @param {boolean} mergeCase - Whether to merge case-insensitive
 * @param {string} path - Path to check
 * @returns {boolean} True if missing
 */
const isMissingPath = (existingSets, mergeCase, path) => {
	if (existingSets.exact.has(path)) return false
	if (mergeCase && existingSets.lower.has(path.toLowerCase())) return false
	return true
}

/**
 * Analyze account for missing folders
 * @param {Object} data - Analysis data
 * @returns {Promise<Object>} Analysis results
 */
async function analyze(data) {
	// Get existing folders
	const { folders } = await MailClient.scanAccount(data.accountId)
	const existingSets = buildExistingSets(folders)

	// Parse required folders from rules
	const rules = RuleEngine.parse(data.filterContent)
	const requiredPaths = getUniquePaths(rules)

	// Find missing paths
	const missing = requiredPaths.filter(path =>
		isMissingPath(existingSets, data.mergeCase, path)
	)

	return {
		accountId: data.accountId,
		totalRules: rules.length,
		totalLeafs: requiredPaths.length,
		missing
	}
}

// ============================================================================
// Discovery Functions
// ============================================================================

/**
 * Scan messages for unique senders
 * @param {Object} data - Scan data
 * @returns {Promise<Array>} Array of unique sender emails
 */
async function scanMessages(data) {
	const folder = await messenger.folders.get(String(data.folderId))
	const account = await messenger.accounts.get(folder.accountId)
	return MailClient.getSenders(data.folderId, data.limit, account.identities)
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
		path
	})
}

/**
 * Send folder completion message
 * @param {Object} port - Message port
 * @param {string} path - Completed path
 */
const sendFolderComplete = (port, path) => {
	port.postMessage({
		type: MESSAGE_TYPES.FOLDER_COMPLETE,
		path
	})
}

/**
 * Get parent folder ID for path segment
 * @param {Map} folderMap - Folder map
 * @param {Object} inbox - Inbox folder
 * @param {Array<string>} pathParts - Path segments
 * @param {number} index - Current index
 * @returns {string} Parent folder ID
 * @throws {Error} If parent not found
 */
const getParentId = (folderMap, inbox, pathParts, index) => {
	if (index === 0) return inbox.id
	
	const parentPath = pathParts.slice(0, index).join('/').toLowerCase()
	if (!folderMap.has(parentPath)) {
		throw new Error(ERROR_MESSAGES.MISSING_PARENT(parentPath))
	}
	
	return folderMap.get(parentPath).id
}

/**
 * Create folder and update cache
 * @param {Map} folderMap - Folder map to update
 * @param {string} parentId - Parent folder ID
 * @param {string} name - Folder name
 * @returns {Promise<void>}
 */
const createAndCache = async (folderMap, parentId, name) => {
	const created = await MailClient.createFolder(parentId, name)
	const createdPath = created.path.replace(/^\/+/, '')
	
	folderMap.set(createdPath.toLowerCase(), {
		...created,
		cleanPath: createdPath,
		id: String(created.id)
	})
}

/**
 * Process single path creation
 * @param {Map} folderMap - Folder map
 * @param {Object} inbox - Inbox folder
 * @param {string} path - Path to create
 * @returns {Promise<void>}
 */
const processPath = async (folderMap, inbox, path) => {
	const parts = path.split('/')
	
	for (let j = 0; j < parts.length; j++) {
		const currentPath = parts.slice(0, j + 1).join('/')
		const normalized = currentPath.toLowerCase()
		
		if (folderMap.has(normalized)) continue
		
		const parentId = getParentId(folderMap, inbox, parts, j)
		await createAndCache(folderMap, parentId, parts[j])
	}
}

/**
 * Handle folder creation error
 * @param {Error} error - Error object
 * @param {string} path - Path that failed
 * @param {Object} results - Results accumulator
 */
const handleCreationError = (error, path, results) => {
	if (!error.message.includes(ERROR_MESSAGES.ALREADY_EXISTS)) {
		results.failed.push({ path, error: error.message })
	} else {
		results.created.push(path)
	}
}

/**
 * Create folders from paths
 * @param {Object} data - Creation data
 * @param {Object} port - Message port
 * @returns {Promise<Object>} Creation results
 */
async function createFolders(data, port) {
	const { accountId, paths } = data
	const results = { created: [], failed: [] }
	
	// Sort by depth to ensure parents exist
	const sortedPaths = sortPathsByDepth(paths)

	// Refresh folder cache
	const { folders } = await MailClient.scanAccount(accountId)
	const folderMap = new Map(folders.map(f => [f.cleanPath.toLowerCase(), f]))
	
	// Find inbox
	const inbox = findInboxFolder(folders)
	if (!inbox) throw new Error(ERROR_MESSAGES.NO_INBOX)

	// Process each path
	for (let i = 0; i < sortedPaths.length; i++) {
		const path = sortedPaths[i]
		sendProgress(port, i + 1, sortedPaths.length, path)
		
		try {
			await processPath(folderMap, inbox, path)
			results.created.push(path)
			sendFolderComplete(port, path)
		} catch (e) {
			handleCreationError(e, path, results)
		}
	}
	
	return results
}

// ============================================================================
// Message Routing
// ============================================================================

/**
 * Route table for message actions
 */
const MESSAGE_ROUTES = {
	[MESSAGE_ACTIONS.ANALYZE]: analyze,
	[MESSAGE_ACTIONS.SCAN_MESSAGES]: scanMessages
}

/**
 * Handle runtime message
 * @param {Object} msg - Message object
 * @param {Function} sendResponse - Response callback
 */
const handleMessage = (msg, sendResponse) => {
	const route = MESSAGE_ROUTES[msg.action]
	
	if (route) {
		route(msg)
			.then(sendResponse)
			.catch(e => sendResponse({ error: e.message }))
		return true
	}
}

/**
 * Handle port connection for long-running operations
 * @param {Object} port - Message port
 */
const handlePortConnection = (port) => {
	if (port.name === PORT_NAMES.CREATE_FOLDERS) {
		port.onMessage.addListener(async (msg) => {
			try {
				const results = await createFolders(msg, port)
				port.postMessage({
					type: MESSAGE_TYPES.COMPLETE,
					results
				})
			} catch (e) {
				port.postMessage({
					type: MESSAGE_TYPES.ERROR,
					error: e.message
				})
			}
		})
	}
}

/**
 * Launch or focus UI window
 */
const launchUI = async () => {
	const url = messenger.runtime.getURL('ui.html')
	const tabs = await messenger.tabs.query({ url })
	
	if (tabs.length) {
		await messenger.windows.update(tabs[0].windowId, { focused: true })
		await messenger.tabs.update(tabs[0].id, { active: true })
	} else {
		await messenger.tabs.create({ url })
	}
}

// ============================================================================
// Event Listeners
// ============================================================================

messenger.runtime.onMessage.addListener(handleMessage)
messenger.runtime.onConnect.addListener(handlePortConnection)
messenger.action.onClicked.addListener(launchUI)