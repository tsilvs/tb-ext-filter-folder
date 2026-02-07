/**
 * Application Constants and Configuration
 * Centralized configuration to eliminate magic numbers and improve maintainability
 */

// Default Configuration Values
export const FILTER_TYPES = {
	PRE_JUNK: 1,
	MANUAL: 16,
	POST_JUNK: 32,
	SENDING: 64,
	ARCHIVE: 128,
	PERIODIC: 256
}

export const DEFAULT_FILTER_CONFIG = [
	{ id: 'preJunk', value: FILTER_TYPES.PRE_JUNK, label: 'optPreJunk', enabled: false },
	{ id: 'manual', value: FILTER_TYPES.MANUAL, label: 'optManual', enabled: true },
	{ id: 'postJunk', value: FILTER_TYPES.POST_JUNK, label: 'optPostJunk', enabled: true },
	{ id: 'sending', value: FILTER_TYPES.SENDING, label: 'optSending', enabled: false },
	{ id: 'archive', value: FILTER_TYPES.ARCHIVE, label: 'optArchive', enabled: false },
	{ id: 'periodic', value: FILTER_TYPES.PERIODIC, label: 'optPeriodic', enabled: false }
]

export const DEFAULT_CONFIG = {
	mergeCase: true,
	scanLimit: 500,
	defaultRoot: '',
	folderRoot: '',
	filters: DEFAULT_FILTER_CONFIG,
	accountPreferences: {}
}

// Default filter type combination (Manual + Post-Junk)
export const DEFAULT_FILTER_TYPE = FILTER_TYPES.MANUAL + FILTER_TYPES.POST_JUNK // 48

// URI Constants
export const URI_SCHEMES = {
	IMAP: 'imap://',
	MAILBOX: 'mailbox://'
}

export const PLACEHOLDER_URI = 'imap://REPLACE_ME'

// Path Constants
export const PATH_SEPARATOR = '/'
export const INBOX_FOLDER_NAME = 'Inbox'

// UI Timing Constants (milliseconds)
export const UI_TIMEOUTS = {
	TOAST_DURATION: 2000,
	BUTTON_FEEDBACK: 1000,
	SCROLL_BEHAVIOR: 'smooth'
}

// Message Port Names
export const PORT_NAMES = {
	CREATE_FOLDERS: 'create-folders',
	DELETE_FOLDERS: 'delete-folders'
}

// Message Actions
export const MESSAGE_ACTIONS = {
	ANALYZE: 'analyze',
	SCAN_MESSAGES: 'scanMessages',
	CREATE: 'create',
	SCAN_FOLDER_SENDERS: 'scanFolderSenders'
}

// Message Types (for port communication)
export const MESSAGE_TYPES = {
	PROGRESS: 'progress',
	FOLDER_COMPLETE: 'folderComplete',
	COMPLETE: 'complete',
	ERROR: 'error'
}

// Regex Patterns
export const REGEX_PATTERNS = {
	RULE_NAME_MARKER: /^name=/m,
	RULE_NAME_SPLIT: /(?=name=")/,
	ACTION_URI: /action="(?:Move|Copy) to folder"[\s\S]*?actionValue="([^"]+)"/,
	EMAIL_CONDITION: /\(from\s*,\s*(?:contains|is)\s*,\s*([^)]+)\)/gi,
	BASE_URI: /actionValue="((?:imap|mailbox):\/\/[^/]+)\//,
	URI_TO_PATH: /(?:imap|mailbox):\/\/[^/]+(?:@[^/]+)?\/(.+)/,
	TYPE_ATTRIBUTE: /type="\d+"/g
}

// File Constants
export const FILE_CONSTANTS = {
	FILTER_RULES_FILENAME: 'msgFilterRules.dat',
	EXPORT_MIME_TYPE: 'text/plain'
}

// Limits and Boundaries
export const LIMITS = {
	DEFAULT_SCAN_LIMIT: 500,
	MIN_SCAN_LIMIT: 100,
	MAX_SCAN_LIMIT: 5000,
	MAX_FOLDER_DEPTH: 10
}

// Status/Message CSS Classes
export const STATUS_CLASSES = {
	INFO: 'info',
	SUCCESS: 'success',
	ERROR: 'error',
	WARNING: 'warning',
	PROGRESS: 'progress'
}

// Element State Classes
export const ELEMENT_CLASSES = {
	HIDDEN: 'hidden',
	ACTIVE: 'active',
	SELECTED: 'selected',
	DISABLED: 'disabled',
	PENDING: 'pending',
	COMPLETE: 'complete',
	FAILED: 'failed'
}

// Sort Directions
export const SORT_DIRECTION = {
	ASC: 1,
	DESC: -1
}

// Storage Areas
export const STORAGE_AREAS = {
	SYNC: 'sync',
	LOCAL: 'local'
}

// Error Messages
export const ERROR_MESSAGES = {
	NO_INBOX: 'No inbox folder found',
	MISSING_PARENT: (path) => `Missing parent: ${path}`,
	ALREADY_EXISTS: 'already exists',
	NO_ACCOUNT: 'No account found',
	LOAD_CONFIG_FAILED: 'Failed to load config',
	SAVE_CONFIG_FAILED: 'Error saving settings',
	LIST_ACCOUNTS_FAILED: 'Failed to list accounts',
	GET_ACCOUNT_FAILED: 'Failed to get account details'
}
