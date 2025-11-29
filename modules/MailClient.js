/**
 * Modules/MailClient.js
 * Thunderbird API wrapper
 */

export const MailClient = {

	/**
	 * Recursively scans account for all folders.
	 * Returns flat list + stats.
	 */
	async scanAccount(accountId) {
		let account = null
		try {
			// Strategy 1: Explicit Get
			account = await messenger.accounts.get(String(accountId))

			// Strategy 2: List Fallback (if .folders is missing/empty on the specific get)
			if (!account || !account.folders || account.folders.length === 0) {
				const all = await messenger.accounts.list()
				account = all.find(a => String(a.id) === String(accountId))
			}
		} catch (e) {
			console.error("MailClient: Failed to get account", e)
		}

		if (!account) return { folders: [], total: 0, leafs: 0 }

		const folders = []
		let leafs = 0

		const traverse = async (folder, depth = 0) => {
			if (!folder || !folder.id) return

			const item = {
				id: String(folder.id),
				name: folder.name,
				path: folder.path,
				cleanPath: (folder.path || "").replace(/^\/+/, ''),
				depth
			}
			folders.push(item)

			try {
				const subs = await messenger.folders.getSubFolders(item.id)
				if (subs && subs.length > 0) {
					// Parallel recursion for speed
					await Promise.all(subs.map(sub => traverse(sub, depth + 1)))
				} else {
					leafs++
				}
			} catch (e) {
				// Often hits permission errors on special root folders, count as leaf to be safe
				// console.warn(`MailClient: Traversal error for ${folder.name}`, e)
				leafs++
			}
		}

		// Start Nodes: Prefer account.folders (Inbox, etc), fallback to rootFolder (Account Name)
		let roots = account.folders
		if ((!roots || roots.length === 0) && account.rootFolder) {
			roots = [account.rootFolder]
		}

		if (roots && roots.length > 0) {
			await Promise.all(roots.map(root => traverse(root)))
		} else {
			console.warn("MailClient: Account has no folders or rootFolder property", account)
		}

		return { folders, total: folders.length, leafs }
	},

	/**
	 * Scan folder for unique senders (excluding self)
	 */
	async getSenders(folderId, limit, selfIdentities = []) {
		const messages = await messenger.messages.list(String(folderId))
		const list = (messages.messages || []).slice(0, limit || 500)

		const myEmails = new Set(selfIdentities.map(i => (i.email || '').toLowerCase()))
		const senders = new Set()

		for (const msg of list) {
			if (!msg.author) continue
			// Extract email from "Name <email>" or "email"
			const match = msg.author.match(/<([^>]+)>/) || [null, msg.author]
			const email = (match[1] || match[0]).replace(/["']/g, '').trim().toLowerCase()

			if (email.includes('@') && !myEmails.has(email)) {
				senders.add(email)
			}
		}
		return Array.from(senders)
	},

	async createFolder(parentId, name) {
		return messenger.folders.create(String(parentId), name)
	}
}