/**
 * Background Service
 */
import { RuleEngine } from './modules/RuleEngine.js'
import { MailClient } from './modules/MailClient.js'

// Tab 1: Analyze
async function analyze(data) {
	// 1. Get existing folders
	const { folders } = await MailClient.scanAccount(data.accountId)
	const existingSet = new Set(folders.map(f => f.cleanPath))
	const existingLower = new Set(folders.map(f => f.cleanPath.toLowerCase()))

	// 2. Parse required folders from rules
	const rules = RuleEngine.parse(data.filterContent)
	const requiredPaths = [...new Set(rules.map(r => r.path))] // Unique

	// 3. Diff
	const missing = requiredPaths.filter(p => {
		if (existingSet.has(p)) return false
		if (data.mergeCase && existingLower.has(p.toLowerCase())) return false
		return true
	})

	return {
		accountId: data.accountId,
		totalRules: rules.length,
		totalLeafs: requiredPaths.length,
		missing
	}
}

// Tab 2: Discovery
async function scanMessages(data) {
	const folder = await messenger.folders.get(String(data.folderId))
	const account = await messenger.accounts.get(folder.accountId)
	return MailClient.getSenders(data.folderId, data.limit, account.identities)
}

// Creation Loop
async function createFolders(data, port) {
	const { accountId, paths } = data
	const results = { created: [], failed: [] }
	
	// Sort by depth to ensure parents exist
	paths.sort((a, b) => a.split('/').length - b.split('/').length)

	// Refresh folder cache
	const { folders } = await MailClient.scanAccount(accountId)
	const folderMap = new Map(folders.map(f => [f.cleanPath.toLowerCase(), f]))
	const account = await messenger.accounts.get(accountId)
	const inbox = account.folders.find(f => f.type === 'inbox') || account.folders[0]

	for (let i = 0; i < paths.length; i++) {
		const path = paths[i]
		port.postMessage({ type: 'progress', current: i + 1, total: paths.length, path })
		
		try {
			const parts = path.split('/')
			// Walk path segments
			for (let j = 0; j < parts.length; j++) {
				const currentPath = parts.slice(0, j + 1).join('/')
				const normalized = currentPath.toLowerCase()
				
				if (folderMap.has(normalized)) continue

				// Determine parent
				let parentId = inbox.id
				if (j > 0) {
					const parentPath = parts.slice(0, j).join('/').toLowerCase()
					if (!folderMap.has(parentPath)) throw new Error(`Missing parent: ${parentPath}`)
					parentId = folderMap.get(parentPath).id
				}

				// Create
				const created = await MailClient.createFolder(parentId, parts[j])
				
				// Update Local Cache
				const createdPath = created.path.replace(/^\/+/, '')
				folderMap.set(createdPath.toLowerCase(), { ...created, cleanPath: createdPath, id: String(created.id) })
			}
			results.created.push(path)
			port.postMessage({ type: 'folderComplete', path })

		} catch (e) {
			if (!e.message.includes('already exists')) {
				results.failed.push({ path, error: e.message })
			} else {
				results.created.push(path)
			}
		}
	}
	return results
}

// Message Router
messenger.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	const route = {
		'analyze': analyze,
		'scanMessages': scanMessages
	}[msg.action]

	if (route) {
		route(msg).then(sendResponse).catch(e => sendResponse({ error: e.message }))
		return true
	}
})

// Port Router
messenger.runtime.onConnect.addListener(port => {
	if (port.name === 'create-folders') {
		port.onMessage.addListener(async msg => {
			try {
				const res = await createFolders(msg, port)
				port.postMessage({ type: 'complete', results: res })
			} catch (e) {
				port.postMessage({ type: 'error', error: e.message })
			}
		})
	}
})

// UI Launcher
messenger.action.onClicked.addListener(async () => {
	const url = messenger.runtime.getURL("ui.html")
	const tabs = await messenger.tabs.query({ url })
	if (tabs.length) {
		await messenger.windows.update(tabs[0].windowId, { focused: true })
		await messenger.tabs.update(tabs[0].id, { active: true })
	} else {
		await messenger.tabs.create({ url })
	}
})