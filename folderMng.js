const $ = id => document.getElementById(id)

// Apply native i18n & Set Title
document.addEventListener('DOMContentLoaded', () => {
	const extName = messenger.i18n.getMessage('extensionName');
	document.title = extName;

	document.querySelectorAll('[data-i18n]').forEach(elem => {
		elem.textContent = messenger.i18n.getMessage(elem.dataset.i18n)
	})
	document.querySelectorAll('[data-i18n-placeholder]').forEach(elem => {
		elem.placeholder = messenger.i18n.getMessage(elem.dataset.i18nPlaceholder)
	})
	
	// Tooltip for checkbox
	$('mergeCase').title = messenger.i18n.getMessage('mergeCaseTooltip');
})

// Update stat displays
const updateStat = (id, value) => {
	const elem = $(id)
	if (elem) elem.textContent = value ?? '—'
}

// Global state for live counters
let currentState = {
	existing: 0,
	missing: 0,
	leafs: 0
};

// Helper to count folders recursively without relying on deprecated .subFolders property
const countFoldersRecursively = async (folder) => {
	let count = 1; // Count self
	try {
		const subFolders = await messenger.folders.getSubFolders(folder.id)
		for (const sub of subFolders) {
			count += await countFoldersRecursively(sub);
		}
	} catch (e) {
		// Ignore folder access errors or leaf nodes
	}
	return count;
}

// Load existing folder count
const loadExistingFolderCount = async () => {
	const accountId = $('account').value
	if (!accountId) return

	try {
		const account = await messenger.accounts.get(accountId)
		if (!account) return

		let count = 0
		
		if (account.folders) {
			for (const rootFolder of account.folders) {
				count += await countFoldersRecursively(rootFolder);
			}
		}

		currentState.existing = count;
		updateStat('existingFolders', count)
	} catch (e) {
		console.error('Failed to count folders:', e)
	}
}

// Load IMAP accounts
const loadAccounts = async () => {
	const accounts = await messenger.accounts.list()
	const imapAccounts = accounts.filter(a => a.type === 'imap')

	const select = $('account')
	select.innerHTML = ''

	if (imapAccounts.length === 0) {
		const opt = document.createElement('option')
		opt.value = ''
		opt.textContent = messenger.i18n.getMessage('noAccounts')
		select.appendChild(opt)
		return
	}

	imapAccounts.forEach(acc => {
		const opt = document.createElement('option')
		opt.value = acc.id
		opt.textContent = acc.name
		select.appendChild(opt)
	})

	await loadExistingFolderCount()
	checkAnalyzeEnabled()
}

// Check if analyze button should be enabled
const checkAnalyzeEnabled = () => {
	const hasAccount = $('account').value
	const hasContent = $('pasteInput').value.trim().length > 0
	$('analyze').disabled = !(hasAccount && hasContent)
}

// Count IMAP action rules
const countImapActions = (content) => {
	const matches = content.match(/actionValue="imap:/g)
	return matches ? matches.length : 0
}

// Show status in fixed area
const showStatus = (message, type) => {
	const statusArea = $('status')
	const div = document.createElement('aside')
	div.className = `status ${type}`

	if (type === 'progress') {
		const text = document.createElement('span')
		text.textContent = message
		const stopBtn = document.createElement('button')
		stopBtn.textContent = messenger.i18n.getMessage('stop')
		stopBtn.className = 'danger'
		stopBtn.onclick = () => {
			if (window.currentPort) {
				window.currentPort.disconnect()
				window.currentPort = null
				showStatus(messenger.i18n.getMessage('stoppedByUser'), 'error')
			}
		}
		div.appendChild(text)
		div.appendChild(stopBtn)
	} else {
		div.textContent = message
	}

	statusArea.innerHTML = ''
	statusArea.appendChild(div)
}

// Render warnings block
const renderWarnings = (warnings, container) => {
	const div = document.createElement('div')
	div.className = 'status warning'
	
	const title = document.createElement('div')
	title.style.fontWeight = 'bold'
	title.textContent = messenger.i18n.getMessage('warningsHeader')
	div.appendChild(title)

	const ul = document.createElement('ul')
	ul.style.margin = '8px 0 0 20px'
	ul.style.padding = '0'
	
	warnings.forEach(w => {
		const li = document.createElement('li')
		li.textContent = w
		ul.appendChild(li)
	})
	div.appendChild(ul)
	
	container.appendChild(div)
}

// Create results UI
const createResultsUI = (analysis) => {
	const article = document.createElement('article')

	const h2 = document.createElement('h2')
	h2.textContent = analysis.accountName
	article.appendChild(h2)

	// Update global state
	currentState.missing = analysis.missing.length;
	currentState.leafs = analysis.totalLeafs;

	const stats = document.createElement('section')
	stats.className = 'stats'
	stats.appendChild(createStatBox(messenger.i18n.getMessage('uniqueLeafs'), analysis.totalLeafs, 'leafStat'))
	stats.appendChild(createStatBox(messenger.i18n.getMessage('missing'), analysis.missing.length, 'missingStat'))
	article.appendChild(stats)

	if (analysis.missing.length === 0) {
		const msg = document.createElement('aside')
		msg.className = 'status success'
		msg.textContent = messenger.i18n.getMessage('allFoldersExist')
		article.appendChild(msg)
		return article
	}

	// Warning about case sensitivity duplication if disabled
	if (!$('mergeCase').checked) {
		const warn = document.createElement('div');
		warn.className = 'status info';
		warn.style.fontSize = '0.9em';
		warn.textContent = messenger.i18n.getMessage('caseSensitiveWarning');
		article.appendChild(warn);
	}

	const folderList = document.createElement('section')
	folderList.className = 'folder-list'
	folderList.id = 'folderList'
	folderList.setAttribute('role', 'list')

	window.folderStatusMap = new Map()

	analysis.missing.forEach(path => {
		const item = document.createElement('div')
		item.className = 'folder-item pending'
		item.dataset.path = path
		item.setAttribute('role', 'listitem')

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

// Create stat box
const createStatBox = (label, value, id = null) => {
	const stat = document.createElement('aside')
	stat.className = 'stat'

	const labelDiv = document.createElement('div')
	labelDiv.className = 'stat-label'
	labelDiv.textContent = label

	const valueOutput = document.createElement('output')
	valueOutput.className = 'stat-value'
	valueOutput.textContent = String(value)
	if (id) valueOutput.id = id;

	stat.appendChild(labelDiv)
	stat.appendChild(valueOutput)
	return stat
}

// Handle folder creation
const handleCreateFolders = (analysis, createBtn) => {
	createBtn.disabled = true
	createBtn.textContent = messenger.i18n.getMessage('creating')
	showStatus(messenger.i18n.getMessage('creatingProgress', ['0', String(analysis.missing.length), '...']), 'progress')

	const port = messenger.runtime.connect({ name: 'create-folders' })
	window.currentPort = port

	port.onMessage.addListener((msg) => {
		if (msg.type === 'progress') {
			showStatus(
				messenger.i18n.getMessage('creatingProgress', [String(msg.current), String(msg.total), msg.path]),
				'progress'
			)
		} else if (msg.type === 'folderComplete') {
			const item = window.folderStatusMap.get(msg.path)
			if (item) {
				item.className = 'folder-item complete'
				const icon = item.querySelector('.folder-icon')
				icon.textContent = '✓'
				icon.className = 'folder-icon complete'
			}
			
			// Live update counters
			currentState.existing++;
			currentState.missing = Math.max(0, currentState.missing - 1);
			
			updateStat('existingFolders', currentState.existing);
			updateStat('missingStat', currentState.missing);

		} else if (msg.type === 'folderFailed') {
			const item = window.folderStatusMap.get(msg.path)
			if (item) {
				item.className = 'folder-item failed'
				const icon = item.querySelector('.folder-icon')
				icon.textContent = '✗'
				icon.className = 'folder-icon failed'
				icon.title = msg.error
			}
		} else if (msg.type === 'complete') {
			window.currentPort = null
			const res = msg.results
			showStatus(
				messenger.i18n.getMessage('doneStatus', [String(res.created.length), String(res.failed.length)]),
				res.failed.length > 0 ? 'error' : 'success'
			)
			createBtn.textContent = messenger.i18n.getMessage('done')
			createBtn.disabled = false
			
			// Final sync check
			loadExistingFolderCount()
			port.disconnect()
		} else if (msg.type === 'error') {
			window.currentPort = null
			showStatus(`Error: ${msg.error}`, 'error')
			createBtn.textContent = messenger.i18n.getMessage('retry')
			createBtn.disabled = false
			port.disconnect()
		}
	})

	port.onDisconnect.addListener(() => {
		if (window.currentPort === port) {
			window.currentPort = null
			createBtn.textContent = messenger.i18n.getMessage('retry')
			createBtn.disabled = false
		}
	})

	port.postMessage({
		action: 'create',
		accountId: analysis.accountId,
		folders: analysis.missing
	})
}

// Handle file upload
$('fileInput').addEventListener('change', async (e) => {
	const file = e.target.files[0]
	if (!file) return

	showStatus(messenger.i18n.getMessage('readingFile'), 'progress')
	const text = await file.text()
	$('pasteInput').value = text

	const ruleCount = countImapActions(text)
	updateStat('filterRules', ruleCount)
	showStatus(messenger.i18n.getMessage('loadedFile', [file.name, String(ruleCount)]), 'success')
	checkAnalyzeEnabled()
})

// Monitor textarea changes
$('pasteInput').addEventListener('input', () => {
	const text = $('pasteInput').value.trim()
	if (text) {
		const ruleCount = countImapActions(text)
		updateStat('filterRules', ruleCount)
	} else {
		updateStat('filterRules', null)
	}
	checkAnalyzeEnabled()
})

// Monitor account selection
$('account').addEventListener('change', () => {
	loadExistingFolderCount()
	checkAnalyzeEnabled()
})

// Analyze form submission
$('mainForm').addEventListener('submit', async (e) => {
	e.preventDefault()

	const btn = $('analyze')
	const results = $('results')
	const content = $('pasteInput').value.trim()
	const accountId = $('account').value
	const mergeCase = $('mergeCase').checked

	results.innerHTML = ''

	if (!content) {
		showStatus(messenger.i18n.getMessage('uploadOrPaste'), 'error')
		return
	}

	if (!accountId) {
		showStatus(messenger.i18n.getMessage('selectAccount'), 'error')
		return
	}

	btn.disabled = true
	btn.textContent = messenger.i18n.getMessage('analyzing')
	showStatus(messenger.i18n.getMessage('analyzing'), 'progress')

	try {
		const response = await messenger.runtime.sendMessage({
			action: 'analyze',
			filterContent: content,
			accountId,
			mergeCase
		})

		btn.disabled = false
		btn.textContent = messenger.i18n.getMessage('analyzeMissing')

		if (response.error) {
			showStatus(`Error: ${response.error}`, 'error')
			return
		}

		showStatus(
			messenger.i18n.getMessage('analysisComplete', [String(response.missing.length)]),
			response.missing.length > 0 ? 'info' : 'success'
		)

		if (response.warnings && response.warnings.length > 0) {
			renderWarnings(response.warnings, results)
		}

		results.appendChild(createResultsUI(response))
	} catch (err) {
		btn.disabled = false
		btn.textContent = messenger.i18n.getMessage('analyzeMissing')
		showStatus(`Error: ${err.message}`, 'error')
	}
})

// Initialize
loadAccounts()