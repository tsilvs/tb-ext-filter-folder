/**
 * Modules/RuleEngine.js
 * Centralized parsing logic for Thunderbird filter rules.
 * Refactored to use pure functions with dependency injection.
 */

import {
	FILTER_TYPES,
	DEFAULT_FILTER_TYPE,
	PLACEHOLDER_URI,
	PATH_SEPARATOR,
	REGEX_PATTERNS
} from '../config/constants.js'

import { unique, sortBy } from '../utils/data.js'
import { curry } from '../utils/functional.js'

// ============================================================================
// URI & Path Operations
// ============================================================================

/**
 * Extract action URI from a rule block
 * @param {string} block - Rule block content
 * @returns {string|null} Extracted URI or null
 */
export const extractUriFromBlock = (block) => {
	const match = block.match(REGEX_PATTERNS.ACTION_URI)
	return match ? match[1] : null
}

/**
 * Extract base URI prefix from content (imap://user@host)
 * @param {string} content - Rules file content
 * @returns {string} Base URI or placeholder
 */
export const extractBaseUri = (content) => {
	const match = content && content.match(REGEX_PATTERNS.BASE_URI)
	return match ? match[1] : PLACEHOLDER_URI
}

/**
 * Convert IMAP/Mailbox URI to Folder Path
 * @param {string} uri - Full URI
 * @returns {string|null} Decoded path or null
 */
export const uriToPath = (uri) => {
	const match = uri.match(REGEX_PATTERNS.URI_TO_PATH)
	return match ? decodeURIComponent(match[1]) : null
}

/**
 * Extract folder path from a rule block
 * @param {string} block - Rule block content
 * @returns {string|null} Folder path or null
 */
export const extractPathFromBlock = (block) => {
	const uri = extractUriFromBlock(block)
	return uri ? uriToPath(uri) : null
}

/**
 * Convert email to reverse-domain path (bob@foo.co.uk -> uk/co/foo/bob)
 * @param {string} email - Email address
 * @returns {string|null} Path or null if invalid email
 */
export const emailToPath = (email) => {
	const parts = email.toLowerCase().trim().split('@')
	if (parts.length !== 2) return null
	
	const [user, domain] = parts
	return [...domain.split('.').reverse(), user].join(PATH_SEPARATOR)
}

/**
 * Build full URI from base and path
 * @param {string} baseUri - Base URI (e.g., imap://user@host)
 * @param {string} path - Folder path
 * @returns {string} Full URI with encoded path segments
 */
export const buildFullUri = curry((baseUri, path) => {
	const encodedPath = path.split(PATH_SEPARATOR)
		.map(encodeURIComponent)
		.join(PATH_SEPARATOR)
	return `${baseUri}${PATH_SEPARATOR}${encodedPath}`
})

// ============================================================================
// Email Extraction
// ============================================================================

/**
 * Extract emails from conditions in a rule block
 * @param {string} block - Rule block content
 * @returns {string[]} Array of email addresses
 */
export const extractEmailsFromBlock = (block) => {
	const emails = []
	const condRegex = new RegExp(REGEX_PATTERNS.EMAIL_CONDITION.source, 'gi')
	let match
	
	while ((match = condRegex.exec(block)) !== null) {
		const rawEmail = match[1].replace(/^"|"$/g, '').trim().toLowerCase()
		if (rawEmail.includes('@')) {
			emails.push(rawEmail)
		}
	}
	
	return emails
}

// ============================================================================
// Rule Parsing
// ============================================================================

/**
 * Parse a single rule block into structured data
 * @param {string} block - Single rule block
 * @returns {Object|null} Parsed rule or null if invalid
 */
export const parseRuleBlock = (block) => {
	if (!block.trim()) return null
	
	const uri = extractUriFromBlock(block)
	const path = uri ? uriToPath(uri) : null
	if (!path) return null
	
	const emails = extractEmailsFromBlock(block)
	
	return {
		path,
		emails,
		uri,
		enabled: block.includes('enabled="yes"')
	}
}

/**
 * Parse filter rules content into structured data
 * @param {string} content - Raw msgFilterRules.dat content
 * @returns {Array<Object>} Array of parsed rules
 */
export const parse = (content) => {
	if (!content) return []
	
	const blocks = content.split(REGEX_PATTERNS.RULE_NAME_MARKER)
	
	return blocks
		.map(parseRuleBlock)
		.filter(Boolean)
}

// ============================================================================
// Filter Type Calculations
// ============================================================================

/**
 * Calculate filter type bitmask from options
 * @param {Object} options - Boolean flags for each filter type
 * @param {boolean} options.manual - Manual run
 * @param {boolean} options.newMail - New mail trigger
 * @param {boolean} options.afterSending - After sending trigger
 * @param {boolean} options.archiving - Archiving trigger
 * @param {boolean} options.periodic - Periodic trigger
 * @returns {number} Calculated bitmask
 */
export const calculateType = (options) => {
	let value = 0
	
	if (options.newMail) value += FILTER_TYPES.NEW_MAIL
	if (options.manual) value += FILTER_TYPES.MANUAL
	if (options.afterSending) value += FILTER_TYPES.SENDING
	if (options.archiving) value += FILTER_TYPES.ARCHIVE
	if (options.periodic) value += FILTER_TYPES.PERIODIC
	
	// Default to 17 (Manual + New Mail) if nothing selected
	return value === 0 ? DEFAULT_FILTER_TYPE : value
}

// ============================================================================
// Rule Generation
// ============================================================================

/**
 * Generate a single filter rule block
 * @param {string} baseUri - Base IMAP URI
 * @param {string} email - Email address to filter
 * @param {string} path - Target folder path
 * @param {number} typeValue - Filter type bitmask (default: 17)
 * @returns {string} Filter rule block
 */
export const generateBlock = curry((baseUri, email, path, typeValue = DEFAULT_FILTER_TYPE) => {
	const fullUri = buildFullUri(baseUri, path)
	
	return `name="From ${email}"
enabled="yes"
type="${typeValue}"
action="Move to folder"
actionValue="${fullUri}"
condition="AND (from,contains,${email})"`
})

// ============================================================================
// Rule Sorting
// ============================================================================

/**
 * Sort rule blocks by path
 * @param {string} a - First rule block
 * @param {string} b - Second rule block
 * @returns {number} Sort comparison result
 */
const compareRulesByPath = (a, b) => {
	// Extract path or default to 'zzz' to put non-movers at end
	const pathA = (extractPathFromBlock(a) || 'zzz').toLowerCase()
	const pathB = (extractPathFromBlock(b) || 'zzz').toLowerCase()
	return pathA.localeCompare(pathB)
}

/**
 * Sort raw filter rules content alphabetically by target path
 * @param {string} content - Raw rules content
 * @returns {string} Sorted content
 */
export const sortRawRules = (content) => {
	const marker = 'name="'
	const firstIdx = content.indexOf(marker)
	if (firstIdx === -1) return content
	
	const header = content.substring(0, firstIdx)
	const rulesContent = content.substring(firstIdx)
	
	// Split using lookahead to keep delimiter at start of each block
	const rawRules = rulesContent.split(REGEX_PATTERNS.RULE_NAME_SPLIT)
	
	const sortedRules = sortBy(compareRulesByPath, rawRules)
	
	return header + sortedRules.join('')
}

// ============================================================================
// Bulk Operations
// ============================================================================

/**
 * Update all filter type values in content
 * @param {string} content - Raw rules content
 * @param {number} newTypeValue - New type value to apply
 * @returns {string} Updated content
 */
export const updateFilterTypes = curry((content, newTypeValue) => {
	return content.replace(REGEX_PATTERNS.TYPE_ATTRIBUTE, `type="${newTypeValue}"`)
})

// ============================================================================
// Path Inference
// ============================================================================

/**
 * Count occurrences of each root path
 * @param {Array<Object>} parsedRules - Parsed rules
 * @returns {Map<string, number>} Map of root paths to counts
 */
const countRootPaths = (parsedRules) => {
	const counts = new Map()
	
	parsedRules.forEach(rule => {
		rule.emails.forEach(email => {
			const suffix = emailToPath(email)
			const path = rule.path.toLowerCase()
			
			if (suffix && path.endsWith(suffix.toLowerCase())) {
				const root = rule.path
					.substring(0, rule.path.length - suffix.length)
					.replace(/\/$/, '')
				
				counts.set(root, (counts.get(root) || 0) + 1)
			}
		})
	})
	
	return counts
}

/**
 * Find root path with maximum count
 * @param {Map<string, number>} counts - Path counts
 * @returns {string|null} Most common root path or null
 */
const findMaxCount = (counts) => {
	let best = null
	let max = 0
	
	for (const [root, count] of counts) {
		if (count > max) {
			max = count
			best = root
		}
	}
	
	return best
}

/**
 * Infer root path from existing rule structure
 * @param {Array<Object>} parsedRules - Parsed rules
 * @returns {string|null} Inferred root path or null
 */
export const inferRoot = (parsedRules) => {
	const counts = countRootPaths(parsedRules)
	return findMaxCount(counts)
}

// ============================================================================
// Helper Compositions
// ============================================================================

/**
 * Get unique paths from rules
 * @param {Array<Object>} rules - Parsed rules
 * @returns {Array<string>} Unique paths
 */
export const getUniquePaths = (rules) => {
	return unique(rules.map(r => r.path))
}

/**
 * Get all emails from rules
 * @param {Array<Object>} rules - Parsed rules
 * @returns {Array<string>} All emails (flattened)
 */
export const getAllEmails = (rules) => {
	return rules.flatMap(r => r.emails)
}

/**
 * Get unique emails from rules
 * @param {Array<Object>} rules - Parsed rules
 * @returns {Array<string>} Unique emails
 */
export const getUniqueEmails = (rules) => {
	return unique(getAllEmails(rules))
}

// ============================================================================
// Legacy Namespace Export (for backward compatibility during migration)
// ============================================================================

export const RuleEngine = {
	TYPES: FILTER_TYPES,
	parse,
	sortRawRules,
	extractUriFromBlock,
	extractPathFromBlock,
	extractBaseUri,
	uriToPath,
	emailToPath,
	inferRoot,
	calculateType,
	generateBlock,
	updateFilterTypes,
	// New exports
	buildFullUri,
	extractEmailsFromBlock,
	parseRuleBlock,
	getUniquePaths,
	getAllEmails,
	getUniqueEmails
}