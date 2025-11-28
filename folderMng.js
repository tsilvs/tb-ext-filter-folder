const $ = id => document.getElementById(id)

// --- Shared State ---
let accountFoldersCache = [] // Flat list of {id, name, path}
let parsedRulesCache = []    // Array of objects from msgFilterRules.dat
let currentDiscovered = []   // Array of {email, path, selected}

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
	const extName = messenger.i18n.getMessage('extensionName');
	document.title = extName;

	document.querySelectorAll('[data-i18n]').forEach(elem => {
		elem.textContent = messenger.i18n.getMessage(elem.dataset.i18n)
	})
	document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
		elem.placeholder = messenger.i18n.getMessage(elem.dataset.i18nPlaceholder)
	})
	
	initTabs();
	loadAccounts();
})

// --- Tab Management ---
const initTabs = () => {
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			// Remove active class from all
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
			
			// Activate clicked
			btn.classList.add('active')
			$(btn.dataset.tab).classList.add('active')
		})
	})
}

// --- Utils ---

const updateStat = (id, value) => {
	const elem = $(id)
	if (elem) elem.textContent = value ?? '—'
}

const showStatus = (areaId, message, type) => {
	const statusArea = $(areaId)
	if (!statusArea) return
	
	const div = document.createElement('div')
	div.className = `status ${type}`
	div.textContent = message
	
	// If progress, add stop button logic if needed (simplified here)
	statusArea.innerHTML = ''
	statusArea.appendChild(div)
}

// --- Algorithms ---

// 1. Email to Path: user@sub.domain.tld -> tld/domain/sub/user
const emailToPath = (email) => {
	const clean = email.toLowerCase().trim()
	const parts = clean.split('@')
	if (parts.length !== 2) return null
	
	const [user, domain] = parts
	const domainParts = domain.split('.').reverse()
	
	// Filter empty parts
	const pathParts = [...domainParts, user].filter(p => p.length > 0)
	return pathParts.join('/')
}

// 2. Parse Rules to simple object: { email, targetPath }
// This is a simplified parser for Strategy 1
const extractRuleMappings = (content) => {
	const mappings = []
	const blocks = content.split('name=')
	
	blocks.forEach(block => {
		const enabled = block.includes('enabled="yes"')
		// Extract email from condition: condition="AND (from,contains,bob@foo.com)"
		// Regex looks for: (from,contains, [email] )
		const condMatch = block.match(/\(from,contains,([^)]+)\)/)
		
		// Extract action: actionValue="imap://user@host/Path/To/Folder"
		const actionMatch = block.match(/actionValue="([^"]+)"/)
		
		if (condMatch && actionMatch) {
			const email = condMatch[1].trim()
			const uri = actionMatch[1]
			
			// Parse URI to path
			let path = ''
			let pathMatch = uri.match(/imap:\/\/[^/]+@[^/]+\/(.+)/)
			if (!pathMatch) pathMatch = uri.match(/imap:\/\/[^/]+\/(.+)/)
			
			if (pathMatch) {
				path = decodeURIComponent(pathMatch[1])
				mappings.push({ email, path, enabled })
			}
		}
	})
	return mappings
}

// 3. Infer Root (Strategy 1)
const inferRootFromRules = (rulesContent) => {
	const mappings = extractRuleMappings(rulesContent)
	if (mappings.length === 0) return null
	
	// We look for a pattern where Path ends with EmailToPath
	// Path = ROOT + EmailToPath
	// Therefore ROOT = Path - EmailToPath
	
	const counts = new Map() // Root -> Count
	
	mappings.forEach(m => {
		const expectedSuffix = emailToPath(m.email) // e.g. com/google/bob
		if (!expectedSuffix) return
		
		// Case insensitive check
		const p = m.path.toLowerCase()
		const s = expectedSuffix.toLowerCase()
		
		if (p.endsWith(s)) {
			// Extract root. 
			// Full: Archives/com/google/bob
			// Suffix: com/google/bob
			// Root: Archives/
			
			// Use original case from path
			const rootLength = m.path.length - s.length
			// If root exists, it should end in / usually, unless empty
			let root = m.path.substring(0, rootLength)
			
			// Normalize: Remove trailing slash if strictly root
			if (root.endsWith('/')) root = root.slice(0, -1)
			
			counts.set(root, (counts.get(root) || 0) + 1)
		}
	})
	
	// Return most frequent root
	let bestRoot = null
	let max = 0
	counts.forEach((count, root) => {
		if (count > max) {
			max = count
			bestRoot = root
		}
	})
	
	return bestRoot
}

// 4. Generate New Rules text
const extractBaseUri = (content) => {
	// Try to find the IMAP prefix from existing rules
	// e.g. "imap://user%40gmail.com@imap.gmail.com"
	const match = content.match(/actionValue="(imap:\/\/[^/]+)\//)
	if (match) return match[1]
	
	// Fallback if no moves exist yet
	return "imap://REPLACE_ME"
}

const generateRuleBlock = (baseUri, email, folderPath) => {
	// Encode path for URI (Thunderbird uses mostly standard URI encoding)
	// We ensure the folder path is encoded (e.g. spaces to %20)
	const encodedPath = folderPath.split('/').map(encodeURIComponent).join('/')
	const fullUri = `${baseUri}/${encodedPath}`
	
	return `name="From ${email}"
enabled="yes"
type="17"
action="Move to folder"
actionValue="${fullUri}"
condition="AND (from,contains,${email})"`
}

// --- Data Loading ---

// Recursively build flat list for dropdowns
const buildFlatFolderList = async (folder, list = [], depth = 0) => {
	if (!folder || !folder.id) return list
	
	list.push({
		id: folder.id,
		name: folder.name,
		path: folder.path,
		depth
	})
	
	try {
		const subFolders = await messenger.folders.getSubFolders(String(folder.id))
		for (const sub of subFolders) {
			await buildFlatFolderList(sub, list, depth + 1)
		}
	} catch (e) { /* ignore */ }
	
	return list
}

const loadAccounts = async () => {
	const accounts = await messenger.accounts.list()
	const imapAccounts = accounts.filter(a => a.type === 'imap')
	const select = $('account')
	
	select.innerHTML = ''
	if (imapAccounts.length === 0) {
		const opt = document.createElement('option')
		opt.textContent = messenger.i18n.getMessage('noAccounts')
		select.appendChild(opt)
		return
	}

	for (const acc of imapAccounts) {
		const opt = document.createElement('option')
		opt.value = acc.id
		opt.textContent = acc.name
		select.appendChild(opt)
	}

	// Load folders for first account
	if (imapAccounts.length > 0) {
		await loadAccountStructure(imapAccounts[0].id)
	}
}

const loadAccountStructure = async (accountId) => {
	const account = await messenger.accounts.get(accountId)
	const scanSelect = $('scanSource')
	scanSelect.innerHTML = '<option>Loading...</option>'
	
	accountFoldersCache = []
	
	if (account.folders) {
		for (const root of account.folders) {
			await buildFlatFolderList(root, accountFoldersCache)
		}
	}
	
	// Populate Scan Source Dropdown
	scanSelect.innerHTML = ''
	accountFoldersCache.forEach(f => {
		const opt = document.createElement('option')
		opt.value = f.id
		opt.textContent = '—'.repeat(f.depth) + ' ' + f.name
		// Default to Inbox
		if (f.name === 'Inbox' || f.type === 'inbox') opt.selected = true
		scanSelect.appendChild(opt)
	})
	
	// Update existing stats for Tab 1
	loadExistingFolderCount(accountId)
}

const loadExistingFolderCount = async (accountId) => {
	// Counts all nodes in the cache
	if (accountFoldersCache.length === 0) {
		// If cache empty, we might need to count recursively
		// But loadAccountStructure populates it.
		// If using recursive counter purely:
		const account = await messenger.accounts.get(accountId)
		let count = 0
		if (account.folders) {
			for (const f of account.folders) {
				count += await countFoldersRecursively(f)
			}
		}
		updateStat('existingFolders', count)
	} else {
		updateStat('existingFolders', accountFoldersCache.length)
	}
}

const countFoldersRecursively = async (folder) => {
	if (!folder || !folder.id) return 0
	let count = 1
	try {
		const subs = await messenger.folders.getSubFolders(String(folder.id))
		for (const sub of subs) {
			count += await countFoldersRecursively(sub)
		}
	} catch (e) { console.warn(e) }
	return count
}


// --- Tab 1 Logic (Existing Filter Analysis) ---

const countImapActions = (content) => {
	const matches = content.match(/actionValue="imap:/g)
	return matches ? matches.length : 0
}

$('account').addEventListener('change', (e) => loadAccountStructure(e.target.value))

$('fileInput').addEventListener('change', async (e) => {
	const file = e.target.files[0]
	if (!file) return
	const text = await file.text()
	$('pasteInput').value = text
	
	const count = countImapActions(text)
	$('ruleCountDisplay').textContent = messenger.i18n.getMessage('loadedFile', [String(count)])
	updateStat('filterRules', count)
	
	checkAnalyzeEnabled()
})

$('pasteInput').addEventListener('input', (e) => {
	const text = e.target.value
	const count = countImapActions(text)
	updateStat('filterRules', count)
	$('ruleCountDisplay').textContent = `${count} rules`
	checkAnalyzeEnabled()
})

const checkAnalyzeEnabled = () => {
	const hasAccount = $('account').value
	const hasContent = $('pasteInput').value.trim().length > 0
	$('analyze').disabled = !(hasAccount && hasContent)
}

$('mainForm').addEventListener('submit', async (e) => {
	e.preventDefault()
	const btn = $('analyze')
	const results = $('results')
	const content = $('pasteInput').value.trim()
	const accountId = $('account').value
	const mergeCase = $('mergeCase').checked

	results.innerHTML = ''
	if (!content || !accountId) return

	btn.disabled = true
	showStatus('status-folders', messenger.i18n.getMessage('analyzing'), 'progress')

	try {
		const response = await messenger.runtime.sendMessage({
			action: 'analyze',
			filterContent: content,
			accountId,
			mergeCase
		})
		
		btn.disabled = false
		showStatus('status-folders', messenger.i18n.getMessage('analysisComplete', [String(response.missing.length)]), 'success')
		
		if (response.warnings) renderWarnings(response.warnings, results)
		results.appendChild(createResultsUI(response))
		
	} catch (err) {
		btn.disabled = false
		showStatus('status-folders', err.message, 'error')
	}
})

// --- Tab 2 Logic (Rule Discovery) ---

$('inferRootBtn').addEventListener('click', () => {
	const content = $('pasteInput').value
	if (!content) {
		showStatus('status-discovery', messenger.i18n.getMessage('uploadOrPaste'), 'error')
		return
	}
	
	const root = inferRootFromRules(content)
	if (root) {
		$('targetRoot').value = root
		showStatus('status-discovery', messenger.i18n.getMessage('rootInferred', [root]), 'success')
	} else {
		showStatus('status-discovery', messenger.i18n.getMessage('rootNotFound'), 'warning')
	}
})

$('discoveryForm').addEventListener('submit', async (e) => {
	e.preventDefault()
	const sourceId = $('scanSource').value
	const targetRoot = $('targetRoot').value.trim()
	const rulesContent = $('pasteInput').value
	
	if (!sourceId || !rulesContent) {
		showStatus('status-discovery', messenger.i18n.getMessage('uploadOrPaste'), 'error')
		return
	}
	
	const btn = $('startDiscovery')
	btn.disabled = true
	const statusId = 'status-discovery'
	showStatus(statusId, messenger.i18n.getMessage('scanningMessages', ['500']), 'progress')
	
	// Reset UI
	$('discoveryResults').classList.add('hidden')
	$('generatedRulesArea').classList.add('hidden')
	$('generatedRulesOutput').value = ''
	
	try {
		// 1. Get Messages
		const senders = await messenger.runtime.sendMessage({
			action: 'scanMessages',
			folderId: sourceId,
			limit: 500
		})
		
		// 2. Filter against existing rules
		const existingRules = extractRuleMappings(rulesContent)
		const knownEmails = new Set(existingRules.map(r => r.email.toLowerCase()))
		
		// 3. Generate proposals
		currentDiscovered = []
		senders.forEach(email => {
			if (!knownEmails.has(email.toLowerCase())) {
				const suffix = emailToPath(email)
				if (suffix) {
					// Clean root: ensure no double slashes, but keep one sep
					let root = targetRoot.replace(/\/+$/, '')
					const fullPath = root ? `${root}/${suffix}` : suffix
					
					currentDiscovered.push({
						email,
						path: fullPath,
						selected: false // Track state here
					})
				}
			}
		})
		
		if (currentDiscovered.length === 0) {
			showStatus(statusId, messenger.i18n.getMessage('noNewSenders'), 'info')
		} else {
			renderDiscoveryResults(currentDiscovered)
			showStatus(statusId, messenger.i18n.getMessage('scanComplete', [String(currentDiscovered.length)]), 'success')
		}
		
	} catch (err) {
		console.error(err)
		showStatus(statusId, err.message, 'error')
	} finally {
		btn.disabled = false
	}
})

const renderDiscoveryResults = (items) => {
	const container = $('discoveryResults')
	const list = $('discoveryListItems')
	list.innerHTML = ''
	
	container.classList.remove('hidden')
	
	items.forEach((item, idx) => {
		const div = document.createElement('div')
		div.className = 'discovery-item'
		
		// Check if folder exists in cache?
		const exists = accountFoldersCache.some(f => f.path.replace(/^\//,'').toLowerCase() === item.path.toLowerCase())
		
		if (exists) div.classList.add('exists')
		
		div.innerHTML = `
			<div class="email">${item.email}</div>
			<div class="path">${item.path}</div>
		`
		
		// Store index ref
		div.dataset.index = idx
		
		div.onclick = () => {
			div.classList.toggle('selected')
			currentDiscovered[idx].selected = div.classList.contains('selected')
			updateCreateButton()
		}
		
		list.appendChild(div)
	})
	
	updateCreateButton()
}

const updateCreateButton = () => {
	const selectedCount = currentDiscovered.filter(i => i.selected).length
	const btn = $('createDiscoveredFolders')
	btn.disabled = selectedCount === 0
	btn.textContent = messenger.i18n.getMessage('createFoldersAndRules', [String(selectedCount)])
}

$('createDiscoveredFolders').addEventListener('click', async () => {
	const selectedItems = currentDiscovered.filter(i => i.selected)
	const accountId = $('account').value
	const existingContent = $('pasteInput').value
	
	if (selectedItems.length === 0) return
	
	// 1. Create Folders
	const paths = selectedItems.map(i => i.path)
	
	// We handle status inside this func, but we need to manage the text generation after
	await handleCreateFoldersFromPaths(accountId, paths, $('createDiscoveredFolders'))
	
	// 2. Generate Rules
	const baseUri = extractBaseUri(existingContent)
	const newRules = selectedItems.map(item => {
		return generateRuleBlock(baseUri, item.email, item.path)
	}).join('\n')
	
	// 3. Display
	const area = $('generatedRulesArea')
	const output = $('generatedRulesOutput')
	output.value = newRules
	area.classList.remove('hidden')
	area.scrollIntoView({ behavior: 'smooth' })
})


// --- Reused UI Helpers ---

const renderWarnings = (warnings, container) => {
	const div = document.createElement('div')
	div.className = 'status warning'
	const title = document.createElement('div')
	title.style.fontWeight = 'bold'
	title.textContent = messenger.i18n.getMessage('warningsHeader')
	div.appendChild(title)
	const ul = document.createElement('ul')
	ul.style.margin = '8px 0 0 20px'
	warnings.forEach(w => {
		const li = document.createElement('li')
		li.textContent = w
		ul.appendChild(li)
	})
	div.appendChild(ul)
	container.appendChild(div)
}

const createResultsUI = (analysis) => {
	const article = document.createElement('article')
	const h2 = document.createElement('h2')
	h2.textContent = analysis.accountName
	article.appendChild(h2)

	// Reuse existing UI creation logic
	const stats = document.createElement('section')
	stats.className = 'stats'
	stats.appendChild(createStatBox(messenger.i18n.getMessage('uniqueLeafs'), analysis.totalLeafs))
	stats.appendChild(createStatBox(messenger.i18n.getMessage('missing'), analysis.missing.length))
	article.appendChild(stats)

	if (analysis.missing.length === 0) {
		const msg = document.createElement('aside')
		msg.className = 'status success'
		msg.textContent = messenger.i18n.getMessage('allFoldersExist')
		article.appendChild(msg)
		return article
	}

	const folderList = document.createElement('section')
	folderList.className = 'folder-list'
	
	window.folderStatusMap = new Map()

	analysis.missing.forEach(path => {
		const item = document.createElement('div')
		item.className = 'folder-item pending'
		item.dataset.path = path
		
		const icon = document.createElement('span')
		icon.className = 'folder-icon pending'
		icon.textContent = '○'
		
		const pathText = document.createElement('span')
		pathText.className = 'folder-path'
		pathText.textContent = path

		item.appendChild(icon)
		item.appendChild(pathText)
		folderList.appendChild(item)
		window.folderStatusMap.set(path, item)
	})

	article.appendChild(folderList)

	const createBtn = document.createElement('button')
	createBtn.textContent = messenger.i18n.getMessage('createFolders', [analysis.missing.length])
	createBtn.onclick = () => handleCreateFolders(analysis, createBtn)
	article.appendChild(createBtn)

	return article
}

const createStatBox = (label, value) => {
	const stat = document.createElement('aside')
	stat.className = 'stat'
	const labelDiv = document.createElement('div')
	labelDiv.className = 'stat-label'
	labelDiv.textContent = label
	const valueOutput = document.createElement('output')
	valueOutput.className = 'stat-value'
	valueOutput.textContent = String(value)
	stat.appendChild(labelDiv)
	stat.appendChild(valueOutput)
	return stat
}

const handleCreateFolders = (analysis, createBtn) => {
	handleCreateFoldersFromPaths(analysis.accountId, analysis.missing, createBtn)
}

// Generalized Handler
const handleCreateFoldersFromPaths = (accountId, paths, btn = null) => {
	return new Promise((resolve) => {
		// If btn provided, manage state, else manage manually
		if (btn) btn.disabled = true
		
		// Determine which status area to use based on active tab
		const activeTab = document.querySelector('.tab-content.active').id
		const statusId = activeTab === 'tab-discovery' ? 'status-discovery' : 'status-folders'
		
		showStatus(statusId, messenger.i18n.getMessage('creating'), 'progress')
	
		const port = messenger.runtime.connect({ name: 'create-folders' })
		
		port.onMessage.addListener((msg) => {
			if (msg.type === 'progress') {
				showStatus(statusId, messenger.i18n.getMessage('creatingProgress', [String(msg.current), String(msg.total), msg.path]), 'progress')
			} else if (msg.type === 'folderComplete') {
				// Update UI maps if they exist
				if (window.folderStatusMap && window.folderStatusMap.has(msg.path)) {
					const item = window.folderStatusMap.get(msg.path)
					item.className = 'folder-item complete'
				}
			} else if (msg.type === 'complete') {
				showStatus(statusId, messenger.i18n.getMessage('doneStatus', [String(msg.results.created.length), String(msg.results.failed.length)]), 'success')
				if (btn) {
					btn.textContent = messenger.i18n.getMessage('done')
					btn.disabled = false
				}
				port.disconnect()
				resolve(msg.results)
			} else if (msg.type === 'error') {
				showStatus(statusId, msg.error, 'error')
				port.disconnect()
				resolve(null)
			}
		})
	
		port.postMessage({
			action: 'create',
			accountId: accountId,
			folders: paths
		})
	})
}