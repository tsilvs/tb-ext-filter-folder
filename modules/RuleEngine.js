/**
 * Modules/RuleEngine.js
 * Centralized parsing logic for Thunderbird filter rules.
 */

export const RuleEngine = {
	// Thunderbird Filter Type Bitmasks
	TYPES: {
		NEW_MAIL: 1,         // Getting New Mail (Before Junk)
		NEW_MAIL_JUNK: 2,    // Getting New Mail (After Junk) - Note: Often combined with 1 in modern TB
		MANUAL: 16,          // Manually Run
		SENDING: 32,         // After Sending
		ARCHIVE: 64,         // Archiving
		PERIODIC: 128        // Periodically
	},

	/**
	 * Main parser: Extracts structured data from raw file content.
	 * @param {string} content - Raw msgFilterRules.dat content
	 * @returns {Array<{path: string, emails: string[], uri: string, enabled: boolean}>}
	 */
	parse(content) {
		if (!content) return []
		const rules = []
		
		// Split by 'name=' to isolate rules roughly
		const blocks = content.split(/^name=/m)
		
		for (const block of blocks) {
			if (!block.trim()) continue

			// 1. Extract Action URI (Move to folder)
			const uri = this.extractUriFromBlock(block)
			const path = uri ? this.uriToPath(uri) : null
			if (!path) continue

			// 2. Extract Emails from Conditions
			// Matches: (from, contains, "email") or (from, is, email)
			const emails = []
			const condRegex = /\(from\s*,\s*(?:contains|is)\s*,\s*([^)]+)\)/gi
			let match
			while ((match = condRegex.exec(block)) !== null) {
				const rawEmail = match[1].replace(/^"|"$/g, '').trim().toLowerCase()
				if (rawEmail.includes('@')) emails.push(rawEmail)
			}

			rules.push({
				path,
				emails,
				uri,
				enabled: block.includes('enabled="yes"')
			})
		}
		return rules
	},

	/**
	 * Sorts the raw content of a msgFilterRules.dat file by target folder path.
	 */
	sortRawRules(content) {
		const marker = 'name="';
		const firstIdx = content.indexOf(marker);
		if (firstIdx === -1) return content;

		const header = content.substring(0, firstIdx);
		// Split using lookahead to keep the delimiter at the start of each block
		const rawRules = content.substring(firstIdx).split(/(?=name=")/);

		rawRules.sort((a, b) => {
			// Extract path or default to zzz to put non-movers at the end
			const pathA = (this.extractPathFromBlock(a) || 'zzz').toLowerCase();
			const pathB = (this.extractPathFromBlock(b) || 'zzz').toLowerCase();
			return pathA.localeCompare(pathB);
		});

		return header + rawRules.join('');
	},

	extractUriFromBlock(block) {
		// Matches: action="Move to folder" ... actionValue="imap://..."
		// Note: actionValue might be on a new line
		const match = block.match(/action="Move to folder"[\s\S]*?actionValue="([^"]+)"/);
		return match ? match[1] : null;
	},

	extractPathFromBlock(block) {
		const uri = this.extractUriFromBlock(block);
		return uri ? this.uriToPath(uri) : null;
	},

	/**
	 * Extract Base URI prefix from content (imap://user@host)
	 */
	extractBaseUri(content) {
		const match = content && content.match(/actionValue="(imap:\/\/[^/]+)\//)
		return match ? match[1] : "imap://REPLACE_ME"
	},

	/**
	 * Convert IMAP/Mailbox URI to Folder Path
	 */
	uriToPath(uri) {
		// Matches: imap://user@host/Path or mailbox://host/Path
		const match = uri.match(/(?:imap|mailbox):\/\/[^/]+(?:\@[^/]+)?\/(.+)/)
		return match ? decodeURIComponent(match[1]) : null
	},

	/**
	 * Convert Email to Path (bob@foo.co.uk -> uk/co/foo/bob)
	 */
	emailToPath(email) {
		const parts = email.toLowerCase().trim().split('@')
		if (parts.length !== 2) return null
		const [user, domain] = parts
		return [...domain.split('.').reverse(), user].join('/')
	},

	/**
	 * Infer Root path from existing rule structure
	 */
	inferRoot(parsedRules) {
		const counts = new Map()
		parsedRules.forEach(rule => {
			rule.emails.forEach(email => {
				const suffix = this.emailToPath(email)
				const path = rule.path.toLowerCase()
				if (suffix && path.endsWith(suffix.toLowerCase())) {
					const root = rule.path.substring(0, rule.path.length - suffix.length).replace(/\/$/, '')
					counts.set(root, (counts.get(root) || 0) + 1)
				}
			})
		})
		
		// Return root with max votes
		let best = null, max = 0
		for (const [root, count] of counts) {
			if (count > max) { max = count; best = root; }
		}
		return best
	},

	/**
	 * Calculate the 'type' bitmask based on boolean options
	 * @param {Object} options - { manual, newMail, afterSending, archiving, periodic }
	 * @returns {number}
	 */
	calculateType(options) {
		let val = 0;
		if (options.newMail) val += this.TYPES.NEW_MAIL;
		if (options.manual) val += this.TYPES.MANUAL;
		if (options.afterSending) val += this.TYPES.SENDING;
		if (options.archiving) val += this.TYPES.ARCHIVE;
		if (options.periodic) val += this.TYPES.PERIODIC;
		// Default to 17 (Manual + New Mail) if nothing selected to avoid broken rules
		return val === 0 ? 17 : val;
	},

	/**
	 * Generate msgFilterRules.dat entry
	 */
	generateBlock(baseUri, email, path, typeValue = 17) {
		const fullUri = `${baseUri}/${path.split('/').map(encodeURIComponent).join('/')}`
		return `name="From ${email}"
enabled="yes"
type="${typeValue}"
action="Move to folder"
actionValue="${fullUri}"
condition="AND (from,contains,${email})"`
	},

	/**
	 * Bulk update the 'type' attribute in a raw rules content string
	 */
	updateFilterTypes(content, newTypeValue) {
		// Regex to find type="number" inside entries
		// We use a global replace.
		return content.replace(/type="\d+"/g, `type="${newTypeValue}"`);
	}
}