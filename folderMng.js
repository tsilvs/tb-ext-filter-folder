const $ = id => document.getElementById(id)

// --- Shared State ---
let accountFoldersCache = [] // Flat list of {id, name, path}
let parsedRulesCache = []    // Array of object from msgFilterRules.dat
let currentDiscovered = []   // Array of {email, path, selected}
let lastAnalysisResult = null // Store analysis for the static button

// Sorting State
let sortState = {
	column: 'email', // 'email' or 'path'
	direction: 'asc' // 'asc' or 'desc'
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

	statusArea.innerHTML = ''
	statusArea.appendChild(div)
}

// --- UI Helpers ---

const renderWarnings = (warnings, container) => {
	container.innerHTML = ''
	if (!warnings || warnings.length === 0) return
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

const handleCreateFoldersFromPaths = (accountId, paths, btn = null) => {
	return new Promise((resolve) => {
		if (btn) btn.disabled = true

		const activeTabEl = document.querySelector('.tab-content.active')
		const activeTab = activeTabEl ? activeTabEl.id : 'tab-folders'
		const statusId = activeTab === 'tab-discovery' ? 'status-discovery' : 'status-folders'

		showStatus(statusId, messenger.i18n.getMessage('creating'), 'progress')

		const port = messenger.runtime.connect({ name: 'create-folders' })

		port.onMessage.addListener((msg) => {
			if (msg.type === 'progress') {
				showStatus(statusId, messenger.i18n.getMessage('creatingProgress', [String(msg.current), String(msg.total), msg.path]), 'progress')
			} else if (msg.type === 'folderComplete') {
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

const handleCreateFolders = (analysis, createBtn) => {
	handleCreateFoldersFromPaths(analysis.accountId, analysis.missing, createBtn)
}

const generateRulesText = () => {
	const selectedItems = currentDiscovered.filter(i => i.selected)
	const existingContent = $('pasteInput').value
	const output = $('generatedRulesOutput')

	if (output) {
		if (selectedItems.length === 0) {
			output.value = ''
		} else {
			const baseUri = extractBaseUri(existingContent)
			const newRules = selectedItems.map(item => {
				return generateRuleBlock(baseUri, item.email, item.path)
			}).join('\n')
			output.value = newRules
		}
	}
}

const updateCreateButton = () => {
	const selectedCount = currentDiscovered.filter(i => i.selected).length
	const btnFolders = $('btnCreateFolders')
	const btnRules = $('btnGenerateRules')

	if (btnFolders) {
		btnFolders.disabled = selectedCount === 0
		btnFolders.textContent = messenger.i18n.getMessage('btnCreateFoldersOnly', [String(selectedCount)])
	}

	if (btnRules) {
		btnRules.disabled = selectedCount === 0
	}

	// Auto-update text value, but do not toggle visibility here
	generateRulesText()
}

const sortDiscoveryItems = () => {
	const { column, direction } = sortState

	currentDiscovered.sort((a, b) => {
		const valA = (a[column] || '').toLowerCase()
		const valB = (b[column] || '').toLowerCase()

		if (valA < valB) return direction === 'asc' ? -1 : 1
		if (valA > valB) return direction === 'asc' ? 1 : -1
		return 0
	})
}

const updateSortHeaders = () => {
	document.querySelectorAll('.list-header .sortable').forEach(header => {
		const col = header.dataset.sort
		header.classList.remove('sorted-asc', 'sorted-desc')
		if (col === sortState.column) {
			header.classList.add(`sorted-${sortState.direction}`)
		}
	})
}

const renderDiscoveryResults = (items) => {
	const container = $('discoveryResults')
	const list = $('discoveryListItems')
	if (!container || !list) return

	// Apply Sort
	sortDiscoveryItems()
	updateSortHeaders()

	list.innerHTML = ''
	container.classList.remove('hidden')

	items.forEach((item, idx) => {
		const div = document.createElement('div')
		div.className = 'discovery-item'

		const exists = accountFoldersCache.some(f => f.path.replace(/^\//, '').toLowerCase() === item.path.toLowerCase())

		if (exists) div.classList.add('exists')
		if (item.selected) div.classList.add('selected')

		div.innerHTML = `
			<input type="checkbox" class="select-row" ${item.selected ? 'checked' : ''}>
			<div class="email">${item.email}</div>
			<div class="path">${item.path}</div>
		`

		// Use closure to capture current item data, relying on idx might be unsafe if array mutates elsewhere
		// but since we rebuild the whole list on render, idx matches currentDiscovered (which is sorted)
		div.dataset.index = idx

		div.onclick = (e) => {
			if (e.target.type !== 'checkbox') {
				const cb = div.querySelector('input[type="checkbox"]')
				if (cb) {
					cb.checked = !cb.checked
					// Trigger change logic manually since programmatic click doesn't always fire change
				}
			}

			const cb = div.querySelector('input[type="checkbox"]')
			const isChecked = cb ? cb.checked : false

			if (isChecked) div.classList.add('selected')
			else div.classList.remove('selected')

			currentDiscovered[idx].selected = isChecked
			updateCreateButton()

			const allChecked = currentDiscovered.length > 0 && currentDiscovered.every(i => i.selected)
			const selectAll = $('selectAllDiscovery')
			if (selectAll) selectAll.checked = allChecked
		}

		list.appendChild(div)
	})

	updateCreateButton()
}

// --- Algorithms ---

const emailToPath = (email) => {
	const clean = email.toLowerCase().trim()
	const parts = clean.split('@')
	if (parts.length !== 2) return null

	const [user, domain] = parts
	const domainParts = domain.split('.').reverse()
	const pathParts = [...domainParts, user].filter(p => p.length > 0)
	return pathParts.join('/')
}

const extractRuleMappings = (content) => {
	const mappings = []
	if (!content) return mappings

	const blocks = content.split('name=')

	blocks.forEach(block => {
		const enabled = block.includes('enabled="yes"')
		const condMatch = block.match(/\(from\s*,\s*(?:contains|is)\s*,\s*([^)]+)\)/i)
		const actionMatch = block.match(/actionValue="([^"]+)"/)

		if (condMatch && actionMatch) {
			const email = condMatch[1].trim()
			const uri = actionMatch[1]

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

const inferRootFromRules = (rulesContent) => {
	const mappings = extractRuleMappings(rulesContent)
	if (mappings.length === 0) return null

	const counts = new Map()
	mappings.forEach(m => {
		const expectedSuffix = emailToPath(m.email)
		if (!expectedSuffix) return

		const p = m.path.toLowerCase()
		const s = expectedSuffix.toLowerCase()

		if (p.endsWith(s)) {
			const rootLength = m.path.length - s.length
			let root = m.path.substring(0, rootLength)
			if (root.endsWith('/')) root = root.slice(0, -1)
			counts.set(root, (counts.get(root) || 0) + 1)
		}
	})

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

const extractBaseUri = (content) => {
	const match = content && content.match(/actionValue="(imap:\/\/[^/]+)\//)
	if (match) return match[1]
	return "imap://REPLACE_ME"
}

const generateRuleBlock = (baseUri, email, folderPath) => {
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

const buildFlatFolderList = async (folder, list = [], depth = 0) => {
	if (!folder || !folder.id) return list

	list.push({
		id: String(folder.id),
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

const getFolderStatsRecursively = async (folder) => {
	if (!folder || !folder.id) return { total: 0, leafs: 0 }

	let total = 1
	let leafs = 0

	try {
		const subs = await messenger.folders.getSubFolders(String(folder.id))
		if (subs.length === 0) {
			leafs = 1
		} else {
			for (const sub of subs) {
				const subStats = await getFolderStatsRecursively(sub)
				total += subStats.total
				leafs += subStats.leafs
			}
		}
	} catch (e) {
		// If we can't get subfolders, assume it's a leaf or inaccessible
		// console.warn(e)
		leafs = 1
	}

	return { total, leafs }
}

const loadAccountStructure = async (accountId) => {
	const account = await messenger.accounts.get(accountId)
	const scanSelect = $('scanSource')
	if (!scanSelect) return
	scanSelect.innerHTML = '<option>Loading...</option>'

	accountFoldersCache = []

	if (account.folders) {
		for (const root of account.folders) {
			await buildFlatFolderList(root, accountFoldersCache)
		}
	}

	scanSelect.innerHTML = ''
	accountFoldersCache.forEach(f => {
		const opt = document.createElement('option')
		opt.value = f.id
		opt.textContent = '—'.repeat(f.depth) + ' ' + f.name
		if (f.name === 'Inbox' || f.type === 'inbox') opt.selected = true
		scanSelect.appendChild(opt)
	})

	// Load stats in background so UI doesn't freeze
	loadExistingFolderCount(accountId).catch(console.error)
}

const loadExistingFolderCount = async (accountId) => {
	try {
		const account = await messenger.accounts.get(accountId)
		let total = 0
		let leafs = 0

		if (account.folders) {
			for (const f of account.folders) {
				const stats = await getFolderStatsRecursively(f)
				total += stats.total
				leafs += stats.leafs
			}
		}

		let text = `${total} (${leafs} leafs)`
		try {
			const localized = messenger.i18n.getMessage('statsFormat', [String(total), String(leafs)])
			if (localized) text = localized
		} catch (e) {
			console.warn('Failed to format stats string', e)
		}

		updateStat('existingFolders', text)
	} catch (e) {
		console.error('Error loading existing folder counts:', e)
		updateStat('existingFolders', 'Error')
	}
}

const loadAccounts = async () => {
	const accounts = await messenger.accounts.list()
	const imapAccounts = accounts.filter(a => a.type === 'imap')
	const select = $('account')
	if (!select) return

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

	if (imapAccounts.length > 0) {
		await loadAccountStructure(imapAccounts[0].id)
	}
}

const initTabs = () => {
	document.querySelectorAll('.tab-btn').forEach(btn => {
		btn.addEventListener('click', () => {
			document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
			document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))
			btn.classList.add('active')
			const target = $(btn.dataset.tab)
			if (target) target.classList.add('active')
		})
	})
}

// --- Initialization & Listeners ---

const initEventListeners = () => {
	const safeAdd = (id, event, handler) => {
		const el = $(id)
		if (el) el.addEventListener(event, handler)
	}

	safeAdd('account', 'change', (e) => loadAccountStructure(e.target.value))

	safeAdd('fileInput', 'change', async (e) => {
		const file = e.target.files[0]
		if (!file) return
		const text = await file.text()
		const pasteInput = $('pasteInput')
		if (pasteInput) pasteInput.value = text

		const count = countImapActions(text)
		const countDisplay = $('ruleCountDisplay')
		if (countDisplay) countDisplay.textContent = messenger.i18n.getMessage('loadedFile', [String(count)])
		updateStat('filterRules', count)

		checkAnalyzeEnabled()
		generateRulesText() // Regenerate text if discovery was pending
	})

	safeAdd('pasteInput', 'input', (e) => {
		const text = e.target.value
		const count = countImapActions(text)
		updateStat('filterRules', count)
		const countDisplay = $('ruleCountDisplay')
		if (countDisplay) countDisplay.textContent = `${count} rules`
		checkAnalyzeEnabled()
		generateRulesText()
	})

	// Submit handler for Missing Folders (Tab 1)
	safeAdd('mainForm', 'submit', async (e) => {
		e.preventDefault()
		const btn = $('analyze')
		const pasteInput = $('pasteInput')
		const accountEl = $('account')
		const mergeCaseEl = $('mergeCase')

		if (!pasteInput || !accountEl) return

		const content = pasteInput.value.trim()
		const accountId = accountEl.value
		const mergeCase = mergeCaseEl ? mergeCaseEl.checked : true

		if (!content || !accountId) return

		if (btn) btn.disabled = true
		showStatus('status-folders', messenger.i18n.getMessage('analyzing'), 'progress')

		try {
			const response = await messenger.runtime.sendMessage({
				action: 'analyze',
				filterContent: content,
				accountId,
				mergeCase
			})

			if (btn) btn.disabled = false
			showStatus('status-folders', messenger.i18n.getMessage('analysisComplete', [String(response.missing.length)]), 'success')

			// Store result for the create button
			lastAnalysisResult = response

			// Update Static UI
			$('resAccountName').textContent = response.accountName
			$('resTotalLeafs').textContent = response.totalLeafs
			$('resMissingCount').textContent = response.missing.length

			const listContainer = $('missingFoldersList')
			const warningContainer = $('analysisWarnings')
			const createBtn = $('btnCreateMissingFolders')

			listContainer.innerHTML = ''
			window.folderStatusMap = new Map()

			if (response.warnings) renderWarnings(response.warnings, warningContainer)

			if (response.missing.length === 0) {
				listContainer.innerHTML = `<div class="status success">${messenger.i18n.getMessage('allFoldersExist')}</div>`
				listContainer.classList.add('empty-state')

				createBtn.disabled = true
				createBtn.title = messenger.i18n.getMessage('noMissingFolders')
				createBtn.textContent = messenger.i18n.getMessage('createMissingFoldersBtn')
			} else {
				listContainer.classList.remove('empty-state')

				response.missing.forEach(path => {
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
					listContainer.appendChild(item)
					window.folderStatusMap.set(path, item)
				})

				createBtn.disabled = false
				createBtn.title = '' // Enable click
				createBtn.textContent = messenger.i18n.getMessage('createFolders', [response.missing.length])
			}

		} catch (err) {
			if (btn) btn.disabled = false
			showStatus('status-folders', err.message, 'error')
		}
	})

	safeAdd('btnCreateMissingFolders', 'click', () => {
		if (lastAnalysisResult && lastAnalysisResult.missing.length > 0) {
			handleCreateFolders(lastAnalysisResult, $('btnCreateMissingFolders'))
		}
	})

	safeAdd('inferRootBtn', 'click', () => {
		const pasteInput = $('pasteInput')
		if (!pasteInput || !pasteInput.value) {
			showStatus('status-discovery', messenger.i18n.getMessage('uploadOrPaste'), 'error')
			return
		}

		const root = inferRootFromRules(pasteInput.value)
		if (root) {
			const targetRoot = $('targetRoot')
			if (targetRoot) targetRoot.value = root
			showStatus('status-discovery', messenger.i18n.getMessage('rootInferred', [root]), 'success')
		} else {
			showStatus('status-discovery', messenger.i18n.getMessage('rootNotFound'), 'warning')
		}
	})

	safeAdd('discoveryForm', 'submit', async (e) => {
		e.preventDefault()
		const sourceId = $('scanSource').value
		const targetRoot = $('targetRoot').value.trim()
		const rulesContent = $('pasteInput').value

		if (!sourceId || !rulesContent) {
			showStatus('status-discovery', messenger.i18n.getMessage('uploadOrPaste'), 'error')
			return
		}

		const btn = $('startDiscovery')
		if (btn) btn.disabled = true
		const statusId = 'status-discovery'
		showStatus(statusId, messenger.i18n.getMessage('scanningMessages', ['500']), 'progress')

		$('discoveryResults').classList.add('hidden')
		$('generatedRulesArea').classList.add('hidden')
		$('generatedRulesOutput').value = ''
		const selectAll = $('selectAllDiscovery')
		if (selectAll) selectAll.checked = true

		try {
			const senders = await messenger.runtime.sendMessage({
				action: 'scanMessages',
				folderId: sourceId,
				limit: 500
			})

			const existingRules = extractRuleMappings(rulesContent)
			const knownEmails = new Set(existingRules.map(r => r.email.toLowerCase()))

			currentDiscovered = []
			senders.forEach(email => {
				if (!knownEmails.has(email.toLowerCase())) {
					const suffix = emailToPath(email)
					if (suffix) {
						let root = targetRoot.replace(/\/+$/, '')
						const fullPath = root ? `${root}/${suffix}` : suffix

						currentDiscovered.push({
							email,
							path: fullPath,
							selected: true
						})
					}
				}
			})

			if (currentDiscovered.length === 0) {
				showStatus(statusId, messenger.i18n.getMessage('noNewSenders'), 'info')
			} else {
				// Default Sort
				sortState.column = 'email'
				sortState.direction = 'asc'
				renderDiscoveryResults(currentDiscovered)
				showStatus(statusId, messenger.i18n.getMessage('scanComplete', [String(currentDiscovered.length)]), 'success')

				// Auto-show generated rules area
				const area = $('generatedRulesArea')
				if (area) area.classList.remove('hidden')
			}

		} catch (err) {
			console.error(err)
			showStatus(statusId, err.message, 'error')
		} finally {
			if (btn) btn.disabled = false
		}
	})

	// Table Sorting Headers
	document.querySelectorAll('.list-header .sortable').forEach(header => {
		header.addEventListener('click', () => {
			const col = header.dataset.sort
			if (sortState.column === col) {
				sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc'
			} else {
				sortState.column = col
				sortState.direction = 'asc'
			}
			renderDiscoveryResults(currentDiscovered)
		})
	})

	safeAdd('selectAllDiscovery', 'change', (e) => {
		const checked = e.target.checked
		currentDiscovered.forEach(item => item.selected = checked)
		// Re-render to update UI check boxes state
		renderDiscoveryResults(currentDiscovered)
	})

	safeAdd('btnCreateFolders', 'click', async () => {
		const selectedItems = currentDiscovered.filter(i => i.selected)
		const accountId = $('account').value
		if (selectedItems.length === 0) return
		const paths = selectedItems.map(i => i.path)
		await handleCreateFoldersFromPaths(accountId, paths, $('btnCreateFolders'))
	})

	safeAdd('btnGenerateRules', 'click', () => {
		const area = $('generatedRulesArea')
		if (area) {
			area.classList.remove('hidden')
			area.scrollIntoView({ behavior: 'smooth' })
		}
		generateRulesText()
	})

	safeAdd('btnDownloadRules', 'click', async () => {
		const existingContent = $('pasteInput').value || ''
		const newRules = $('generatedRulesOutput').value || ''
		const combined = existingContent + '\n' + newRules

		const blob = new Blob([combined], { type: 'text/plain' })
		const url = URL.createObjectURL(blob)

		try {
			await messenger.downloads.download({
				url: url,
				filename: 'msgFilterRules.dat',
				saveAs: true
			})
		} catch (error) {
			console.error('Download failed:', error)
			showStatus('status-discovery', 'Download failed: ' + error.message, 'error')
		} finally {
			setTimeout(() => URL.revokeObjectURL(url), 10000)
		}
	})
}

const countImapActions = (content) => {
	const matches = content.match(/actionValue="imap:/g)
	return matches ? matches.length : 0
}

const checkAnalyzeEnabled = () => {
	const accountEl = $('account')
	const pasteInput = $('pasteInput')
	const btn = $('analyze')
	if (accountEl && pasteInput && btn) {
		const hasAccount = accountEl.value
		const hasContent = pasteInput.value.trim().length > 0
		btn.disabled = !(hasAccount && hasContent)
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const extName = messenger.i18n.getMessage('extensionName')
	document.title = extName

	document.querySelectorAll('[data-i18n]').forEach(elem => {
		elem.textContent = messenger.i18n.getMessage(elem.dataset.i18n)
	})
	document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
		elem.placeholder = messenger.i18n.getMessage(elem.dataset.i18nPlaceholder)
	})

	initTabs()
	initEventListeners()
	loadAccounts()
})