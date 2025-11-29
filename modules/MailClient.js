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
		let account
		try {
			account = await messenger.accounts.get(accountId)
		} catch { return { folders: [], total: 0, leafs: 0 } }

		const folders = []
		let leafs = 0

		const traverse = async (folder, depth = 0) => {
			const item = {
				id: String(folder.id),
				name: folder.name,
				path: folder.path,
				cleanPath: folder.path.replace(/^\/+/, ''),
				depth
			}
			folders.push(item)

			try {
				const subs = await messenger.folders.getSubFolders(item.id)
				if (subs && subs.length > 0) {
					for (const sub of subs) await traverse(sub, depth + 1)
				} else {
					leafs++
				}
			} catch {
				leafs++ // Assume leaf on permission error
			}
		}

		if (account.folders) {
			for (const root of account.folders) await traverse(root)
		}

		return { folders, total: folders.length, leafs }
	},

	/**
	 * Scan folder for unique senders (excluding self)
	 */
	async getSenders(folderId, limit, selfIdentities = []) {
		const folder = await messenger.folders.get(String(folderId))
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