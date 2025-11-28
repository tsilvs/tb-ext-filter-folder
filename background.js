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

// Get all existing folders recursively
const getAllFolders = async (folder, paths = new Set()) => {
	// Normalize path: remove leading slashes, keep case for display but useful for strict checks
	// We store strict path in Set for exact matching
	const cleanPath = folder.path.replace(/^\/+/, '')
	paths.add(cleanPath)

	if (folder.subFolders) {
		for (const sub of folder.subFolders) {
			await getAllFolders(sub, paths)
		}
	}
	return paths
}

// Create folder recursively with batch optimization
const createFolder = async (accountId, folderPath, progressCallback) => {
	const parts = folderPath.split('/')
	console.log(`Creating folder path: ${folderPath}`)

	const account = await messenger.accounts.get(accountId)
	const rootFolders = account.folders || []

	const folderMap = new Map()
	// Build map using Case Insensitive keys to avoid duplicate creation attempts on Windows/mixed systems
	const buildMap = (folder, parentPath = '') => {
		const fullPath = parentPath ? `${parentPath}/${folder.name}` : folder.name
		folderMap.set(fullPath.toLowerCase(), folder)
		if (folder.subFolders) {
			folder.subFolders.forEach(sub => buildMap(sub, fullPath))
		}
	}
	rootFolders.forEach(f => buildMap(f))

	// Create missing parts
	for (let i = 0; i < parts.length; i++) {
		const pathSoFar = parts.slice(0, i + 1).join('/')
		const normalized = pathSoFar.toLowerCase()

		if (folderMap.has(normalized)) {
			continue
		}

		let parent
		if (i === 0) {
			parent = rootFolders.find(f => f.type === 'inbox') || rootFolders[0]
		} else {
			// Find parent by lower-case match to be robust
			const parentPath = parts.slice(0, i).join('/').toLowerCase()
			parent = folderMap.get(parentPath)
		}

		if (!parent) {
			// Optimization: If the parent is missing in map, it might have just been created in this session
			// but folderMap wasn't updated. However, since we process depth-first (sorted), 
			// the parent *should* exist unless API failed.
			throw new Error(`Parent folder not found for: ${pathSoFar}. Ensure parent is created first.`)
		}

		try {
			const created = await messenger.folders.create(parent, parts[i])
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
	const accounts = await messenger.accounts.list()
	const account = accounts.find(a => a.id === accountId)

	if (!account || account.type !== 'imap') {
		throw new Error('Invalid IMAP account')
	}

	const rootFolders = account.folders || []
	const existingPaths = new Set()
	const existingPathsLower = new Set() // For case-insensitive deduplication

	console.log('Analyzing existing folders:')
	for (const folder of rootFolders) {
		await getAllFolders(folder, existingPaths)
	}
	// Populate lower case set
	existingPaths.forEach(p => existingPathsLower.add(p.toLowerCase()))

	const requiredFolders = parseFilterRules(filterContent)
	console.log('Required folders from filters:', requiredFolders.length)

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
		missing
	}
}

// Create all missing folders with batch optimization
const createMissingFolders = async (accountId, folderPaths, port) => {
	const results = { created: [], failed: [] }
	let stopRequested = false

	// CRITICAL: Sort folders by depth (number of slashes) and length.
	// This ensures we create "Parent" before "Parent/Child".
	// Otherwise, parallel processing fails.
	folderPaths.sort((a, b) => {
		const depthA = a.split('/').length;
		const depthB = b.split('/').length;
		if (depthA !== depthB) return depthA - depthB;
		return a.length - b.length;
	});

	const disconnectHandler = () => { stopRequested = true }
	port.onDisconnect.addListener(disconnectHandler)

	// Sequential processing is actually safer for folder trees to ensure parents exist,
	// but we can batch items of the same depth.
	// For simplicity and stability, we use a small concurrency limit.
	const BATCH_SIZE = 1 // Process 1 at a time to strictly guarantee parent existence without complex map rebuilds

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

console.log('Filter Folder Creator: Background script loaded')