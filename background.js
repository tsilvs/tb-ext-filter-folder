// Parse msgFilterRules.dat format
const parseFilterRules = (content) => {
	const lines = content.split('\n')
	const folderPaths = new Set()

	console.log('Parsing filter rules, total lines:', lines.length)

	lines.forEach((line, idx) => {
		const trimmed = line.trim()

		// Try multiple patterns
		if (trimmed.includes('actionValue="imap:')) {
			const match = trimmed.match(/actionValue="([^"]+)"/)
			if (match) {
				const uri = match[1]
				
				// Try different URI formats
				let pathMatch = uri.match(/imap:\/\/[^/]+@[^/]+\/(.+)/)
				if (!pathMatch) {
					// Try without user@host
					pathMatch = uri.match(/imap:\/\/[^/]+\/(.+)/)
				}
				if (!pathMatch) {
					// Try mailbox:// format
					pathMatch = uri.match(/mailbox:\/\/[^/]+\/(.+)/)
				}

				if (pathMatch) {
					// IMPORTANT: Decode URI components properly to handle spaces/symbols
					const path = decodeURIComponent(pathMatch[1])
					folderPaths.add(path)
				}
			}
		}
	})

	console.log('Total unique folders parsed:', folderPaths.size)
	return Array.from(folderPaths)
}

// Count actionValue rules
const countActionRules = (content) => {
	const matches = content.match(/actionValue="imap:/g)
	return matches ? matches.length : 0
}

// Async recursive helper to get all folders from object tree using explicit API
const traverseFolderTree = async (folder, list = []) => {
	list.push(folder)
	try {
		// Explicitly use API with ID to avoid deprecated property access
		const subFolders = await messenger.folders.getSubFolders(folder.id)
		for (const sub of subFolders) {
			await traverseFolderTree(sub, list)
		}
	} catch (e) {
		// Ignore errors for folders that can't have children or transient issues
	}
	return list
}

// Helper to get all folders as a flat list using recursive traversal
const getAccountFolderList = async (account) => {
	const folderList = []
	if (account.folders) {
		for (const root of account.folders) {
			await traverseFolderTree(root, folderList)
		}
	}
	return folderList
}

// Create folder recursively with batch optimization
const createFolder = async (accountId, folderPath, progressCallback) => {
	const parts = folderPath.split('/')
	console.log(`Creating folder path: ${folderPath}`)

	const account = await messenger.accounts.get(accountId)
	const rootFolders = account.folders || []

	// Fetch complete folder tree to avoid duplication (async)
	const allFolders = await getAccountFolderList(account)

	const folderMap = new Map()
	
	// Map all existing folders by their "clean" path
	allFolders.forEach(f => {
		const clean = f.path.replace(/^\/+/, '')
		folderMap.set(clean.toLowerCase(), f)
	})

	// Create missing parts
	for (let i = 0; i < parts.length; i++) {
		const pathSoFar = parts.slice(0, i + 1).join('/')
		const normalized = pathSoFar.toLowerCase()

		if (folderMap.has(normalized)) {
			continue
		}

		let parent
		if (i === 0) {
			// Find inbox or first root
			parent = rootFolders.find(f => f.type === 'inbox') || rootFolders[0]
		} else {
			// Find parent by lower-case match
			const parentPath = parts.slice(0, i).join('/').toLowerCase()
			parent = folderMap.get(parentPath)
		}

		if (!parent) {
			throw new Error(`Parent folder not found for: ${pathSoFar}. Ensure parent is created first.`)
		}

		try {
			const created = await messenger.folders.create(parent, parts[i])
			
			// Update map
			const cleanCreated = created.path.replace(/^\/+/, '')
			folderMap.set(cleanCreated.toLowerCase(), created)
			folderMap.set(normalized, created)

			if (progressCallback) {
				await progressCallback({ type: 'created', path: pathSoFar })
			}
		} catch (e) {
			// Ignore error if folder already exists (race condition check)
			if (!e.message.includes('already exists')) {
				console.error(`Failed to create ${pathSoFar}:`, e)
				throw e
			}
		}
	}
}

// Analyze missing folders
const analyzeMissingFolders = async (filterContent, accountId, mergeCase) => {
	const account = await messenger.accounts.get(accountId)

	if (!account || account.type !== 'imap') {
		throw new Error('Invalid IMAP account')
	}

	const existingPaths = new Set()
	const existingPathsLower = new Set() // For case-insensitive deduplication
	const warnings = []

	console.log('Analyzing existing folders...')
	
	// Use robust async traversal
	const allFolders = await getAccountFolderList(account)
	
	for (const folder of allFolders) {
		const cleanPath = folder.path.replace(/^\/+/, '')
		existingPaths.add(cleanPath)
		existingPathsLower.add(cleanPath.toLowerCase())
	}

	const requiredFolders = parseFilterRules(filterContent)
	console.log('Required folders from filters:', requiredFolders.length)
	console.log('Existing folders found:', existingPaths.size)

	// Filter Missing
	const missing = requiredFolders.filter(path => {
		// 1. Strict Check
		if (existingPaths.has(path)) return false;

		// 2. Loose Check (Case Insensitive Deduplication)
		if (mergeCase) {
			if (existingPathsLower.has(path.toLowerCase())) {
				console.log(`Skipping ${path} because case-insensitive match found (Merge Active).`)
				return false;
			}
		}

		return true;
	})

	return {
		accountId: account.id,
		accountName: account.name,
		totalRules: countActionRules(filterContent),
		totalLeafs: requiredFolders.length,
		existing: existingPaths.size,
		missing,
		warnings
	}
}

// Create all missing folders with batch optimization
const createMissingFolders = async (accountId, folderPaths, port) => {
	const results = { created: [], failed: [] }
	let stopRequested = false

	// CRITICAL: Sort folders by depth
	folderPaths.sort((a, b) => {
		const depthA = a.split('/').length;
		const depthB = b.split('/').length;
		if (depthA !== depthB) return depthA - depthB;
		return a.length - b.length;
	});

	const disconnectHandler = () => { stopRequested = true }
	port.onDisconnect.addListener(disconnectHandler)

	for (let i = 0; i < folderPaths.length; i++) {
		if (stopRequested) break;

		const path = folderPaths[i];
		
		if (port && !stopRequested) {
			port.postMessage({
				type: 'progress',
				current: i + 1,
				total: folderPaths.length,
				path
			})
		}

		try {
			await createFolder(accountId, path, (update) => {
				// Optional: Report intermediate subfolder creation
			})
			
			results.created.push(path)

			if (port && !stopRequested) {
				port.postMessage({
					type: 'folderComplete',
					path
				})
			}
		} catch (e) {
			results.failed.push({ path, error: e.message })
			if (port && !stopRequested) {
				port.postMessage({
					type: 'folderFailed',
					path,
					error: e.message
				})
			}
		}
	}

	port.onDisconnect.removeListener(disconnectHandler)
	return results
}

// Message handler
messenger.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.action === 'analyze') {
		analyzeMissingFolders(message.filterContent, message.accountId, message.mergeCase)
			.then(sendResponse)
			.catch(err => sendResponse({ error: err.message }))
		return true
	}
})

// Port handler for streaming progress
messenger.runtime.onConnect.addListener((port) => {
	if (port.name === 'create-folders') {
		port.onMessage.addListener(async (message) => {
			if (message.action === 'create') {
				try {
					const results = await createMissingFolders(
						message.accountId,
						message.folders,
						port
					)
					port.postMessage({ type: 'complete', results })
				} catch (err) {
					port.postMessage({ type: 'error', error: err.message })
				}
			}
		})
	}
})

// Open UI tab when extension icon clicked
messenger.browserAction.onClicked.addListener(async () => {
	const url = messenger.runtime.getURL("folderMng.html")
	
	// Check if tab exists
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