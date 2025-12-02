/**
 * Application Constants and Configuration
 * Centralized configuration to eliminate magic numbers and improve maintainability
 */

// Default Configuration Values
export const DEFAULT_CONFIG = {
	mergeCase: true,
	scanLimit: 500,
	defaultRoot: '',
	filterManual: true,
	filterNewMail: true,
	filterSending: false,
	filterArchive: false,
	filterPeriodic: false
}

// Filter Type Bitmasks (Thunderbird specification)
export const FILTER_TYPES = {
	NEW_MAIL: 1,         // Getting New Mail (Before Junk)
	NEW_MAIL_JUNK: 2,    // Getting New Mail (After Junk)
	MANUAL: 16,          // Manually Run
	SENDING: 32,         // After Sending
	ARCHIVE: 64,         // Archiving
	PERIODIC: 128        // Periodically
}

// Default filter type combination (Manual + New Mail)
export const DEFAULT_FILTER_TYPE = FILTER_TYPES.MANUAL + FILTER_TYPES.NEW_MAIL // 17

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
	CREATE_FOLDERS: 'create-folders'
}

// Message Actions
export const MESSAGE_ACTIONS = {
	ANALYZE: 'analyze',
	SCAN_MESSAGES: 'scanMessages',
	CREATE: 'create'
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
	ACTION_URI: /action="Move to folder"[\s\S]*?actionValue="([^"]+)"/,
	EMAIL_CONDITION: /\(from\s*,\s*(?:contains|is)\s*,\s*([^)]+)\)/gi,
	BASE_URI: /actionValue="(imap:\/\/[^/]+)\//,
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