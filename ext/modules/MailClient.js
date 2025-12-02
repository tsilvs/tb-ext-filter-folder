/**
 * Modules/MailClient.js
 * Thunderbird API wrapper with pure functions and dependency injection
 */

import { LIMITS, INBOX_FOLDER_NAME, ERROR_MESSAGES } from '../config/constants.js'
import { toSet, fromSet } from '../utils/data.js'
import { curry } from '../utils/functional.js'

// ============================================================================
// Account Operations
// ============================================================================

/**
 * Get account by ID with fallback strategies
 * @param {Object} api - Messenger API object
 * @param {string} accountId - Account ID
 * @returns {Promise<Object|null>} Account object or null
 */
export const getAccount = curry(async (api, accountId) => {
	try {
		// Strategy 1: Direct get
		let account = await api.accounts.get(String(accountId))
		
		// Strategy 2: List fallback if folders missing
		if (!account || !account.folders || account.folders.length === 0) {
			const all = await api.accounts.list()
			account = all.find(a => String(a.id) === String(accountId))
		}
		
		return account || null
	} catch (e) {
		console.error(ERROR_MESSAGES.GET_ACCOUNT_FAILED, e)
		return null
	}
})

/**
 * List all IMAP accounts
 * @param {Object} api - Messenger API object
 * @returns {Promise<Array>} Array of IMAP accounts
 */
export const listImapAccounts = async (api) => {
	try {
		const accounts = await api.accounts.list()
		return accounts.filter(a => a.type === 'imap')
	} catch (e) {
		console.error(ERROR_MESSAGES.LIST_ACCOUNTS_FAILED, e)
		return []
	}
}

// ============================================================================
// Folder Operations
// ============================================================================

/**
 * Create folder object from raw folder data
 * @param {Object} folder - Raw folder object
 * @param {number} depth - Folder depth level
 * @returns {Object} Normalized folder object
 */
const createFolderItem = (folder, depth = 0) => ({
	id: String(folder.id),
	name: folder.name,
	path: folder.path,
	cleanPath: (folder.path || '').replace(/^\/+/, ''),
	type: folder.type,
	depth
})

/**
 * Recursively traverse folder tree
 * @param {Object} api - Messenger API object
 * @param {Object} folder - Current folder
 * @param {number} depth - Current depth
 * @param {Array} folders - Accumulator for folders
 * @param {Object} stats - Accumulator for stats
 * @returns {Promise<void>}
 */
const traverseFolder = async (api, folder, depth, folders, stats) => {
	if (!folder || !folder.id) return
	
	const item = createFolderItem(folder, depth)
	folders.push(item)
	
	try {
		const subs = await api.folders.getSubFolders(item.id)
		if (subs && subs.length > 0) {
			// Parallel recursion for performance
			await Promise.all(
				subs.map(sub => traverseFolder(api, sub, depth + 1, folders, stats))
			)
		} else {
			stats.leafs++
		}
	} catch (e) {
		// Permission errors on special folders - count as leaf
		stats.leafs++
	}
}

/**
 * Get root folders from account
 * @param {Object} account - Account object
 * @returns {Array} Array of root folders
 */
const getRootFolders = (account) => {
	let roots = account.folders
	if ((!roots || roots.length === 0) && account.rootFolder) {
		roots = [account.rootFolder]
	}
	return roots || []
}

/**
 * Scan account for all folders recursively
 * @param {Object} api - Messenger API object
 * @param {string} accountId - Account ID
 * @returns {Promise<Object>} Object with folders array, total count, and leaf count
 */
export const scanAccount = curry(async (api, accountId) => {
	const account = await getAccount(api, accountId)
	
	if (!account) {
		return { folders: [], total: 0, leafs: 0 }
	}
	
	const folders = []
	const stats = { leafs: 0 }
	const roots = getRootFolders(account)
	
	if (roots.length > 0) {
		await Promise.all(
			roots.map(root => traverseFolder(api, root, 0, folders, stats))
		)
	} else {
		console.warn(ERROR_MESSAGES.NO_ACCOUNT, account)
	}
	
	return {
		folders,
		total: folders.length,
		leafs: stats.leafs
	}
})

/**
 * Create a folder
 * @param {Object} api - Messenger API object
 * @param {string} parentId - Parent folder ID
 * @param {string} name - Folder name
 * @returns {Promise<Object>} Created folder object
 */
export const createFolder = curry(async (api, parentId, name) => {
	return api.folders.create(String(parentId), name)
})

/**
 * Find inbox folder from folder list
 * @param {Array} folders - Array of folder objects
 * @returns {Object|null} Inbox folder or first folder or null
 */
export const findInboxFolder = (folders) => {
	if (!folders || folders.length === 0) return null
	return folders.find(f => f.type === 'inbox' || f.name === INBOX_FOLDER_NAME) || folders[0]
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Extract email from author string
 * Handles formats: "Name <email>" or "email"
 * @param {string} author - Author string
 * @returns {string|null} Extracted email or null
 */
const extractEmail = (author) => {
	if (!author) return null
	
	const match = author.match(/<([^>]+)>/) || [null, author]
	const email = (match[1] || match[0])
		.replace(/["']/g, '')
		.trim()
		.toLowerCase()
	
	return email.includes('@') ? email : null
}

/**
 * Check if email should be excluded
 * @param {Set} selfEmails - Set of self email addresses
 * @param {string} email - Email to check
 * @returns {boolean} True if should be excluded
 */
const shouldExcludeEmail = (selfEmails, email) => {
	return !email || selfEmails.has(email)
}

/**
 * Get unique sender emails from folder
 * @param {Object} api - Messenger API object
 * @param {string} folderId - Folder ID to scan
 * @param {number} limit - Maximum messages to scan
 * @param {Array} selfIdentities - Array of identity objects to exclude
 * @returns {Promise<Array<string>>} Array of unique sender emails
 */
export const getSenders = curry(async (api, folderId, limit, selfIdentities = []) => {
	const messageLimit = limit || LIMITS.DEFAULT_SCAN_LIMIT
	
	const messages = await api.messages.list(String(folderId))
	const list = (messages.messages || []).slice(0, messageLimit)
	
	const selfEmails = toSet(
		selfIdentities.map(i => (i.email || '').toLowerCase())
	)
	const senders = new Set()
	
	for (const msg of list) {
		const email = extractEmail(msg.author)
		if (!shouldExcludeEmail(selfEmails, email)) {
			senders.add(email)
		}
	}
	
	return fromSet(senders)
})

// ============================================================================
// Folder Hierarchy Operations
// ============================================================================

/**
 * Build folder map for quick lookup
 * @param {Array} folders - Array of folder objects
 * @returns {Map} Map of cleanPath (lowercase) to folder
 */
export const buildFolderMap = (folders) => {
	return new Map(
		folders.map(f => [f.cleanPath.toLowerCase(), f])
	)
}

/**
 * Sort paths by depth (for hierarchical creation)
 * @param {Array<string>} paths - Array of folder paths
 * @returns {Array<string>} Sorted paths (shallow to deep)
 */
export const sortPathsByDepth = (paths) => {
	return [...paths].sort((a, b) => {
		const depthA = a.split('/').length
		const depthB = b.split('/').length
		return depthA - depthB
	})
}

/**
 * Get parent path from path
 * @param {string} path - Folder path
 * @returns {string|null} Parent path or null if root
 */
export const getParentPath = (path) => {
	const parts = path.split('/')
	if (parts.length <= 1) return null
	return parts.slice(0, -1).join('/')
}

/**
 * Check if folder exists in map (case-insensitive)
 * @param {Map} folderMap - Folder map
 * @param {string} path - Path to check
 * @returns {boolean} True if exists
 */
export const folderExists = curry((folderMap, path) => {
	return folderMap.has(path.toLowerCase())
})

// ============================================================================
// Legacy Namespace Export (for backward compatibility during migration)
// ============================================================================

export const MailClient = {
	// Primary functions
	scanAccount: (accountId) => scanAccount(messenger, accountId),
	getSenders: (folderId, limit, selfIdentities) => 
		getSenders(messenger, folderId, limit, selfIdentities),
	createFolder: (parentId, name) => createFolder(messenger, parentId, name),
	
	// Additional exports
	getAccount: (accountId) => getAccount(messenger, accountId),
	listImapAccounts: () => listImapAccounts(messenger),
	findInboxFolder,
	buildFolderMap,
	sortPathsByDepth,
	getParentPath,
	folderExists: (folderMap, path) => folderExists(folderMap, path)
}