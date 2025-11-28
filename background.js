// Parse msgFilterRules.dat format
// Synchronized with frontend robust parser
const parseFilterRules = (content) => {
	const folderPaths = new Set()
	if (!content) return []

	// Split by rule definition block start roughly
	const blocks = content.split('name=')
	console.log('Parsing filter rules, blocks:', blocks.length)

	blocks.forEach(block => {
		// Look for move to folder action
		const actionMatch = block.match(/actionValue="([^"]+)"/)

		if (actionMatch) {
			const uri = actionMatch[1]
			// Support standard IMAP, no-user format, and mailbox format
			let pathMatch = uri.match(/imap:\/\/[^/]+@[^/]+\/(.+)/)
			if (!pathMatch) pathMatch = uri.match(/imap:\/\/[^/]+\/(.+)/)
			if (!pathMatch) pathMatch = uri.match(/mailbox:\/\/[^/]+\/(.+)/)

			if (pathMatch) {
				const path = decodeURIComponent(pathMatch[1])
				folderPaths.add(path)
			}
		}
	})
	return Array.from(folderPaths)
}

const countActionRules = (content) => {
	const matches = content.match(/actionValue="imap:/g)
	return matches ? matches.length : 0
}

// Async recursive helper
const traverseFolderTree = async (folder, list = []) => {
	if (!folder || !folder.id) return list

	list.push(folder)
	try {
		const folderId = String(folder.id)
		const subFolders = await messenger.folders.getSubFolders(folderId)
		if (subFolders && Array.isArray(subFolders)) {
			for (const sub of subFolders) {
				await traverseFolderTree(sub, list)
			}
		}
	} catch (e) { }
	return list
}

const getAccountFolderList = async (account) => {
	const folderList = []
	if (account.folders) {
		for (const root of account.folders) {
			await traverseFolderTree(root, folderList)
		}
	}
	return folderList
}

// Create folder recursively
const createFolder = async (accountId, folderPath, progressCallback) => {
	const parts = folderPath.split('/')
	const account = await messenger.accounts.get(accountId)
	const rootFolders = account.folders || []
	const allFolders = await getAccountFolderList(account)

	const folderMap = new Map()
	allFolders.forEach(f => {
		const clean = f.path.replace(/^\/+/, '')
		folderMap.set(clean.toLowerCase(), f)
	})

	for (let i = 0; i < parts.length; i++) {
		const pathSoFar = parts.slice(0, i + 1).join('/')
		const normalized = pathSoFar.toLowerCase()

		if (folderMap.has(normalized)) continue

		let parent
		if (i === 0) {
			parent = rootFolders.find(f => f.type === 'inbox') || rootFolders[0]
		} else {
			const parentPath = parts.slice(0, i).join('/').toLowerCase()
			parent = folderMap.get(parentPath)
		}

		if (!parent) throw new Error(`Parent folder not found for: ${pathSoFar}`)

		try {
			const parentId = String(parent.id)
			const created = await messenger.folders.create(parentId, parts[i])
			const cleanCreated = created.path.replace(/^\/+/, '')
			folderMap.set(cleanCreated.toLowerCase(), created)
			folderMap.set(normalized, created)

			if (progressCallback) await progressCallback({ type: 'created', path: pathSoFar })
		} catch (e) {
			if (!e.message.includes('already exists')) {
				throw e
			}
		}
	}
}

// Analyze missing folders (Tab 1)
const analyzeMissingFolders = async (filterContent, accountId, mergeCase) => {
	const account = await messenger.accounts.get(accountId)
	if (!account || account.type !== 'imap') throw new Error('Invalid IMAP account')

	const existingPaths = new Set()
	const existingPathsLower = new Set()

	const allFolders = await getAccountFolderList(account)
	for (const folder of allFolders) {
		const cleanPath = folder.path.replace(/^\/+/, '')
		existingPaths.add(cleanPath)
		existingPathsLower.add(cleanPath.toLowerCase())
	}

	const requiredFolders = parseFilterRules(filterContent)
	const missing = requiredFolders.filter(path => {
		if (existingPaths.has(path)) return false
		if (mergeCase && existingPathsLower.has(path.toLowerCase())) return false
		return true
	})

	return {
		accountId: account.id,
		accountName: account.name,
		totalRules: countActionRules(filterContent),
		totalLeafs: requiredFolders.length,
		existing: existingPaths.size,
		missing,
		warnings: []
	}
}

// Scan Messages for Discovery (Tab 2)
const scanForSenders = async (folderIdInput, limit) => {
	try {
		const folderId = String(folderIdInput)

		// Get account info for current user to exclude self
		const folder = await messenger.folders.get(folderId)
		const account = await messenger.accounts.get(folder.accountId)

		// List messages
		console.log(`Scanning folder ${folderId} for messages...`)
		const page = await messenger.messages.list(folderId)
		let messages = page.messages || []

		console.log(`Found ${messages.length} messages in folder.`)

		if (limit && messages.length > limit) {
			messages = messages.slice(0, limit)
		}

		const senders = new Set()
		const identities = account.identities || []
		const myEmails = identities.map(id => id.email.toLowerCase())

		for (const msg of messages) {
			if (msg.author) {
				// Robust author parsing
				let email = ''
				const match = msg.author.match(/<([^>]+)>/)

				if (match && match[1]) {
					email = match[1]
				} else if (msg.author.includes('@')) {
					email = msg.author
				}

				email = email.trim().toLowerCase()

				// Basic validity check and exclude self
				if (email.length > 3 && email.includes('@') && !myEmails.includes(email)) {
					senders.add(email)
				}
			}
		}

		const result = Array.from(senders)
		console.log(`Scan complete. Found ${result.length} unique senders.`)
		return result
	} catch (e) {
		console.error("Scan failed", e)
		throw new Error("Failed to scan folder: " + e.message)
	}
}

// Create all missing folders
const createMissingFolders = async (accountId, folderPaths, port) => {
	const results = { created: [], failed: [] }
	let stopRequested = false

	folderPaths.sort((a, b) => {
		const depthA = a.split('/').length
		const depthB = b.split('/').length
		if (depthA !== depthB) return depthA - depthB
		return a.length - b.length
	})

	const disconnectHandler = () => { stopRequested = true }
	port.onDisconnect.addListener(disconnectHandler)

	for (let i = 0; i < folderPaths.length; i++) {
		if (stopRequested) break
		const path = folderPaths[i]

		if (port && !stopRequested) {
			port.postMessage({ type: 'progress', current: i + 1, total: folderPaths.length, path })
		}

		try {
			await createFolder(accountId, path)
			results.created.push(path)
			if (port && !stopRequested) port.postMessage({ type: 'folderComplete', path })
		} catch (e) {
			results.failed.push({ path, error: e.message })
			if (port && !stopRequested) port.postMessage({ type: 'folderFailed', path, error: e.message })
		}
	}

	port.onDisconnect.removeListener(disconnectHandler)
	return results
}

// Listeners
messenger.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'analyze') {
		analyzeMissingFolders(message.filterContent, message.accountId, message.mergeCase)
			.then(sendResponse)
			.catch(err => sendResponse({ error: err.message }))
		return true
	} else if (message.action === 'scanMessages') {
		scanForSenders(message.folderId, message.limit)
			.then(sendResponse)
			.catch(err => sendResponse({ error: err.message }))
		return true
	}
})

messenger.runtime.onConnect.addListener((port) => {
	if (port.name === 'create-folders') {
		port.onMessage.addListener(async (message) => {
			if (message.action === 'create') {
				try {
					const results = await createMissingFolders(message.accountId, message.folders, port)
					port.postMessage({ type: 'complete', results })
				} catch (err) {
					port.postMessage({ type: 'error', error: err.message })
				}
			}
		})
	}
})

messenger.browserAction.onClicked.addListener(async () => {
	const url = messenger.runtime.getURL("folderMng.html")
	const tabs = await messenger.tabs.query({ url })
	if (tabs && tabs.length > 0) {
		const tab = tabs[0]
		await messenger.windows.update(tab.windowId, { focused: true })
		await messenger.tabs.update(tab.id, { active: true })
	} else {
		await messenger.tabs.create({ url: "folderMng.html" })
	}
})

console.log('Filter Folder Creator: Background script loaded')