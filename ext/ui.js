/**
 * UI.js - Main Frontend Logic
 */
import { RuleEngine } from './modules/RuleEngine.js'
import { MailClient } from './modules/MailClient.js'
import * as storage from './utils/storage.js'
import { analyzePathIssues, generateWarnings } from './utils/pathSanitizer.js'

// Namespace compatibility
const browserApi = (typeof browser !== 'undefined') ? browser : messenger;

// --- State & DOM ---
const $ = id => document.getElementById(id)
const state = {
	folders: [],              // Current account folder list
	missing: [],              // Analyzed missing paths
	discovered: [],           // Scanned emails {email, path, selected}
	sort: { col: 'email', dir: 1 },
	currentAccount: null,     // Current account object with identities
	accountBaseUri: null,     // imap://user@host from current account
	analysis: null,
	config: {                 // Loaded from Storage
		scanLimit: 500,
		mergeCase: true,
		defaultRoot: '',
		folderRoot: '',
		// Filter Type Defaults
		filters: [],
		accountPreferences: {}
	}
}

// --- Helpers ---
const setStatus = (id, msg, type = 'info') => {
	const el = $(id)
	if (el) el.innerHTML = `<div class="status ${type}">${msg}</div>`
}

const normalizeErrorMessage = (error) => {
	if (!error) return 'Unexpected error'
	if (typeof error === 'string') return error
	if (error.message) return error.message
	try {
		return JSON.stringify(error)
	} catch (e) {
		return String(error)
	}
}

const sendRuntimeMessage = async (message, statusId) => {
	try {
		const response = await browserApi.runtime.sendMessage(message)
		if (!response) {
			throw new Error('No response from background script')
		}
		if (!response.ok) {
			throw new Error(response.error || 'Background error')
		}
		return response.data
	} catch (error) {
		const messageText = normalizeErrorMessage(error)
		if (statusId) {
			setStatus(statusId, messageText, 'error')
		}
		throw error
	}
}

const updateStat = (id, val) => {
	const el = $(id)
	if (el) el.textContent = val
}

const getUniqueRuleEmails = () => {
	const rules = RuleEngine.parse($('pasteInput')?.value || '')
	return new Set(rules.flatMap(rule => rule.emails))
}

const pathSuffixToEmail = (suffix) => {
	const parts = (suffix || '').split('/').filter(Boolean)
	if (parts.length < 2) return null
	const user = parts[parts.length - 1]
	const domainParts = parts.slice(0, -1).reverse()
	if (!user || domainParts.length === 0) return null
	return `${user}@${domainParts.join('.')}`.toLowerCase()
}

const buildEmailToRulePathMap = (rules) => {
	const map = new Map()
	rules.forEach(rule => {
		rule.emails.forEach(email => {
			const normalized = email.toLowerCase()
			if (!map.has(normalized)) {
				map.set(normalized, rule.path)
			}
		})
	})
	return map
}

const analyzeRulesAndFolders = (rootPath, folderEmailMap) => {
	const rules = RuleEngine.parse($('pasteInput')?.value || '')
	const ruleEmailMap = buildEmailToRulePathMap(rules)

	const missingRules = []
	const mismatchedRules = []
	const expectedMissing = []

	folderEmailMap.forEach((actualPath, email) => {
		const expectedSuffix = RuleEngine.emailToPath(email)
		const expectedPath = rootPath ? `${rootPath}/${expectedSuffix}` : expectedSuffix
		const rulePath = ruleEmailMap.get(email)

		if (!rulePath) {
			if (actualPath === expectedPath) {
				missingRules.push({ email, expectedPath })
			} else {
				mismatchedRules.push({ email, actualPath, expectedPath })
			}
		} else if (rulePath !== expectedPath) {
			mismatchedRules.push({ email, rulePath, expectedPath })
		}
	})

	// Rules that point into the target tree but no folder/email exists there
	const expectedPathSet = new Set(folderEmailMap.values())
	ruleEmailMap.forEach((path, email) => {
		const inRoot = rootPath ? (path === rootPath || path.startsWith(`${rootPath}/`)) : true
		if (inRoot && !expectedPathSet.has(path)) {
			expectedMissing.push({ email, rulePath: path })
		}
	})

	return { missingRules, mismatchedRules, expectedMissing }
}

const listItems = (items, formatFn) => {
	return items.map(item => formatFn(item)).join('\n')
}

const renderAnalysisList = (id, items, formatFn) => {
	const container = $(id)
	if (!container) return
	container.innerHTML = ''
	items.forEach(item => {
		const div = document.createElement('div')
		div.className = 'folder-item pending'
		div.textContent = formatFn(item)
		container.appendChild(div)
	})
}

const setCounter = (id, value) => {
	const el = $(id)
	if (el) el.textContent = String(value)
}

const getFilterTypeMask = () => RuleEngine.calculateType(state.config.filters)

const normalizeRoot = (value) => (value || '').trim().replace(/\/+$/, '')

const getCurrentRoot = () => {
	const rootSelect = $('targetRoot')
	if (!rootSelect) return ''
	return normalizeRoot(rootSelect.value || '')
}

const getSelectedFolderOption = (selectEl) => {
	if (!selectEl) return null
	return selectEl.options[selectEl.selectedIndex] || null
}

const getSelectedFolderMeta = (selectEl) => {
	const option = getSelectedFolderOption(selectEl)
	if (!option) return null
	return {
		id: option.value,
		cleanPath: option.dataset.cleanPath || ''
	}
}

const resolveFolderSelection = (folders, preference) => {
	if (!preference) return null
	const { id, cleanPath } = preference
	let match = id ? folders.find(folder => String(folder.id) === String(id)) : null
	if (!match && cleanPath) {
		match = folders.find(folder => folder.cleanPath.toLowerCase() === cleanPath.toLowerCase())
	}
	return match || null
}

const validateTargetRoot = (folders, rootValue) => {
	const normalized = normalizeRoot(rootValue)
	if (!normalized) return { value: '', valid: true }
	const match = folders.find(folder => folder.cleanPath.toLowerCase() === normalized.toLowerCase())
	return match ? { value: match.cleanPath, valid: true } : { value: '', valid: false }
}

const saveAccountPreferences = async () => {
	const accountId = $('account')?.value
	if (!accountId) return

	const source = getSelectedFolderMeta($('scanSource'))
	const target = getSelectedFolderMeta($('targetRoot'))
	if (!source && !target) return

	const accountPreferences = { ...(state.config.accountPreferences || {}) }
	accountPreferences[String(accountId)] = {
		source,
		target
	}
	state.config.accountPreferences = accountPreferences

	try {
		await storage.set({ accountPreferences })
	} catch (error) {
		console.error('Failed to save account preferences', error)
	}
}

const collectPathWarnings = (paths) => {
	const existingPaths = state.folders.map(folder => folder.cleanPath)
	return paths.flatMap((path) => {
		const issues = analyzePathIssues(path, existingPaths)
		return generateWarnings(issues, path)
	})
}

// Account/Rules Validation
function validateAccountRulesMatch() {
	const pasteInput = $('pasteInput')
	if (!pasteInput || !pasteInput.value || !state.accountBaseUri) return null
	
	const rulesBaseUri = RuleEngine.extractBaseUri(pasteInput.value)
	
	// If rules have placeholder or no URI, no mismatch
	if (!rulesBaseUri || rulesBaseUri === "imap://REPLACE_ME") return null
	
	// Compare base URIs (case-insensitive)
	const match = state.accountBaseUri.toLowerCase() === rulesBaseUri.toLowerCase()
	
	return match ? null : {
		accountUri: state.accountBaseUri,
		rulesUri: rulesBaseUri
	}
}

// --- Logic ---
async function loadConfig() {
	try {
		const saved = await storage.get({
			scanLimit: 500,
			mergeCase: true,
			defaultRoot: '',
			folderRoot: '',
			filters: [],
			accountPreferences: {}
		})
		state.config = saved
		
		// Apply to UI
		if($('mergeCase')) $('mergeCase').checked = state.config.mergeCase
		
		// Update scan button text to reflect limit
		const btnScan = $('btnScan')
		if(btnScan) btnScan.textContent = browserApi.i18n.getMessage('scanAndDiscoverLimit', [state.config.scanLimit])

	} catch (e) {
		console.error("Failed to load config", e)
	}
}

async function loadAccount(id) {
	updateStat('statTotal', 'Loading...')
	updateStat('statLeafs', 'Loading...')

	// Get account data and folder structure
	const data = await MailClient.scanAccount(id)
	state.folders = data.folders || []
	
	// Store account object and construct base URI
	try {
		state.currentAccount = await browserApi.accounts.get(id)
		if (state.currentAccount.identities && state.currentAccount.identities.length > 0) {
			const email = state.currentAccount.identities[0].email
			state.accountBaseUri = `imap://${email}`
		} else {
			state.accountBaseUri = "imap://REPLACE_ME"
		}
	} catch (e) {
		console.error("Failed to get account details", e)
		state.accountBaseUri = "imap://REPLACE_ME"
	}

	const rootPath = getCurrentRoot()
	const stats = MailClient.computeFolderStats(state.folders, rootPath)
	updateStat('statTotal', stats.total)
	updateStat('statLeafs', stats.leafs)

	const sourceSelect = $('scanSource')
	if (sourceSelect) {
		sourceSelect.innerHTML = ''
		state.folders.forEach(f => {
			const label = `${'—'.repeat(f.depth)} ${f.cleanPath || f.name}`
			const opt = new Option(label, String(f.id))
			opt.dataset.cleanPath = f.cleanPath
			if (f.name === 'Inbox') opt.selected = true
			sourceSelect.add(opt)
		})
	}

	const rootSelect = $('targetRoot')
	if (rootSelect) {
		rootSelect.innerHTML = ''
		rootSelect.add(new Option('Account Root', ''))
		state.folders.forEach(f => {
			const label = `${'—'.repeat(f.depth)} ${f.cleanPath || f.name}`
			const opt = new Option(label, f.cleanPath)
			opt.dataset.cleanPath = f.cleanPath
			rootSelect.add(opt)
		})
	}

	const accountPrefs = state.config.accountPreferences || {}
	const prefs = accountPrefs[String(id)] || null
	if (prefs) {
		const resolvedSource = resolveFolderSelection(state.folders, prefs.source)
		if (resolvedSource && sourceSelect) {
			sourceSelect.value = String(resolvedSource.id)
		}
		const resolvedTarget = resolveFolderSelection(state.folders, prefs.target)
		if (resolvedTarget && rootSelect) {
			rootSelect.value = resolvedTarget.cleanPath
		} else if (state.config.defaultRoot && rootSelect) {
			rootSelect.value = state.config.defaultRoot
		}
	} else if (state.config.defaultRoot && rootSelect) {
		rootSelect.value = state.config.defaultRoot
	}

	refreshFolderStats()
}

const refreshFolderStats = () => {
	const stats = MailClient.computeFolderStats(state.folders, getCurrentRoot())
	updateStat('statTotal', stats.total)
	updateStat('statLeafs', stats.leafs)
	const panel = $('leafDebugPanel')
	if (panel && panel.open) {
		renderLeafDebug(stats)
	}
	const mismatchEl = $('leafEmailMismatch')
	if (mismatchEl) {
		const ruleEmails = getUniqueRuleEmails()
		const mismatch = ruleEmails.size !== stats.leafs
		if (mismatch && ruleEmails.size > 0) {
			mismatchEl.textContent = `Leafs (${stats.leafs}) do not match unique rule emails (${ruleEmails.size}).`
			mismatchEl.style.display = 'block'
		} else {
			mismatchEl.textContent = ''
			mismatchEl.style.display = 'none'
		}
	}
}

const renderLeafDebug = (stats) => {
	const panel = $('leafDebugPanel')
	const report = $('leafDebugReport')
	if (!panel || !report) return

	if (!stats) {
		report.textContent = 'Leaf debug data is not available yet.'
		panel.classList.remove('hidden')
		return
	}

	const lines = []
	lines.push(`Current Root: ${getCurrentRoot() || '(account root)'}`)
	lines.push(`Total Folders (scoped): ${stats.total}`)
	lines.push(`Leaf Count: ${stats.leafs}`)
	lines.push(`Leaf Paths:`)
	lines.push('')
	stats.leafPaths.forEach(path => {
		lines.push(`- ${path}`)
	})

		report.textContent = lines.join('\n')
		panel.classList.remove('hidden')
}

const inferRootFromFolders = () => {
	const { leafPaths } = MailClient.computeFolderStats(state.folders)
	if (!leafPaths || leafPaths.length === 0) return ''

	let best = { path: '', count: 0, depth: -1 }
	state.folders.forEach(folder => {
		if (folder.depth < 1) return
		const prefix = `${folder.cleanPath}/`
		const count = leafPaths.filter(path => path.startsWith(prefix)).length
		if (count > best.count || (count === best.count && folder.depth > best.depth)) {
			best = { path: folder.cleanPath, count, depth: folder.depth }
		}
	})

	return best.count > 0 ? best.path : ''
}

function updateRuleStats(text) {
	const rules = RuleEngine.parse(text)
	updateStat('statRules', rules.length)
	const disp = $('ruleCountDisplay')
	if (disp) disp.textContent = `${rules.length} rules`

	const btn = $('btnAnalyze')
	if (btn) btn.disabled = !($('account').value && text)
}

function renderDiscovery() {
	const list = $('discoveryList')
	list.innerHTML = ''

	state.discovered.sort((a, b) => {
		const va = a[state.sort.col] || '', vb = b[state.sort.col] || ''
		return va.localeCompare(vb) * state.sort.dir
	})

	state.discovered.forEach((item, i) => {
		const row = document.createElement('div')
		row.className = `discovery-item ${item.selected ? 'selected' : ''}`
		row.innerHTML = `
			<input type="checkbox" ${item.selected ? 'checked' : ''}>
			<div class="email">${item.email}</div>
			<div class="path">${item.path}</div>`

		const toggle = () => {
			item.selected = !item.selected
			renderDiscovery() 
		}

		row.querySelector('input').onclick = e => { e.stopPropagation(); toggle() }
		row.onclick = toggle
		list.appendChild(row)
	})

	const selected = state.discovered.filter(i => i.selected)
	const btnCreate = $('btnCreateDiscovered')
	const btnGen = $('btnGenRules')

	if (btnCreate) {
		btnCreate.disabled = selected.length === 0
		btnCreate.textContent = browserApi.i18n.getMessage('btnCreateFoldersOnly', [selected.length])
	}
	if (btnGen) btnGen.disabled = selected.length === 0

	const selectAll = $('selectAllDiscovery')
	if (selectAll) selectAll.checked = state.discovered.length > 0 && state.discovered.every(i => i.selected)

	$('discoveryResults').classList.remove('hidden')
}

// --- Actions ---
async function runCreate(paths, statusId, btn) {
	btn.disabled = true
	setStatus(statusId, browserApi.i18n.getMessage('creating'), 'progress')

	const port = browserApi.runtime.connect({ name: 'create-folders' })
	const accountId = $('account').value

	return new Promise(resolve => {
		port.onMessage.addListener(msg => {
			if (msg.type === 'progress') {
				setStatus(statusId, `${msg.current}/${msg.total}: ${msg.path}`, 'progress')
			} else if (msg.type === 'complete') {
				setStatus(statusId, browserApi.i18n.getMessage('doneStatus', [msg.results.created.length, msg.results.failed.length]), 'success')
				port.disconnect()
				btn.disabled = false
				resolve()
			} else if (msg.type === 'error') {
				setStatus(statusId, msg.error, 'error')
				btn.disabled = false
			}
		})
		port.postMessage({ action: 'create', accountId, paths, preferredRoot: state.config.folderRoot })
	})
}

// --- Events ---
document.addEventListener('DOMContentLoaded', async () => {
	// I18N
	document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = browserApi.i18n.getMessage(el.dataset.i18n))

	// Load stored config
	await loadConfig()

	// Storage Listener for Real-time updates from the Modal/Options Page
	browserApi.storage.onChanged.addListener((changes, area) => {
		if (area === 'sync') {
			Object.keys(changes).forEach(key => {
				state.config[key] = changes[key].newValue;
			});
			
			// Reflect in UI immediately
			if($('mergeCase')) $('mergeCase').checked = state.config.mergeCase
			if($('btnScan')) $('btnScan').textContent = browserApi.i18n.getMessage('scanAndDiscoverLimit', [state.config.scanLimit])
		const rootSelect = $('targetRoot')
		if (rootSelect && !rootSelect.value && state.config.defaultRoot) {
			rootSelect.value = state.config.defaultRoot
		}
		}
	})

	// Modal Logic
	const modal = $('settingsModal')
	const btnSettings = $('btnSettings')
	const btnCloseSettings = $('btnCloseSettings')

	if (btnSettings && modal) {
		btnSettings.onclick = () => {
			modal.classList.add('active')
			// Force reload iframe to ensure latest settings if changed externally
			const iframe = modal.querySelector('iframe')
			if(iframe) iframe.src = iframe.src
		}
		btnCloseSettings.onclick = () => modal.classList.remove('active')
		modal.onclick = (e) => { if(e.target === modal) modal.classList.remove('active') }
	}

	// Accounts
	let accounts = []
	try {
		accounts = (await browserApi.accounts.list()).filter(a => a.type === 'imap')
	} catch (e) {
		console.error("Failed to list accounts", e)
	}

	const accSel = $('account')
	accSel.innerHTML = ''
	accounts.forEach(a => accSel.add(new Option(a.name, a.id)))

	if (accounts.length) {
		loadAccount(accounts[0].id).catch(console.error)
	}

	const pasteInput = $('pasteInput')
	if (pasteInput && pasteInput.value) {
		updateRuleStats(pasteInput.value)
	}

	accSel.onchange = () => loadAccount(accSel.value).catch(console.error)

	$('fileInput').onchange = async e => {
		const text = await e.target.files[0].text()
		if (pasteInput) pasteInput.value = text
		updateRuleStats(text)
	}

	if (pasteInput) pasteInput.oninput = e => updateRuleStats(e.target.value)
	if ($('targetRoot')) {
		$('targetRoot').onchange = () => {
			const validated = validateTargetRoot(state.folders, getCurrentRoot())
			if (!validated.valid) {
				setStatus('statusFolders', 'Target root was invalid and was reset to Account Root.', 'warning')
				$('targetRoot').value = ''
			}
			refreshFolderStats()
			saveAccountPreferences()
		}
	}
	if ($('scanSource')) {
		$('scanSource').onchange = () => {
			saveAccountPreferences()
		}
	}
	if ($('targetRootSearch') && $('targetRoot')) {
		$('targetRootSearch').oninput = e => {
			const query = e.target.value.toLowerCase()
			const rootSelect = $('targetRoot')
			Array.from(rootSelect.options).forEach(option => {
				if (option.value === '') return
				option.hidden = !option.textContent.toLowerCase().includes(query)
			})
		}
	}
	if ($('scanSourceSearch') && $('scanSource')) {
		$('scanSourceSearch').oninput = e => {
			const query = e.target.value.toLowerCase()
			const sourceSelect = $('scanSource')
			Array.from(sourceSelect.options).forEach(option => {
				option.hidden = !option.textContent.toLowerCase().includes(query)
			})
		}
	}
	
	// Sort Button for Input
	$('btnSortInput').onclick = () => {
		const val = pasteInput.value
		if(!val) return
		const sorted = RuleEngine.sortRawRules(val)
		pasteInput.value = sorted
		// Visual feedback
		const btn = $('btnSortInput')
		const originalText = btn.textContent
		btn.textContent = '✓ ' + btn.textContent
		setTimeout(() => btn.textContent = originalText, 1000)
	}

	// Apply Defaults Button
	$('btnApplyDefaults').onclick = () => {
		const val = pasteInput.value
		if(!val) return
		
		const typeMask = getFilterTypeMask()
		const updated = RuleEngine.updateFilterTypes(val)(typeMask)
		
		if (updated !== val) {
			pasteInput.value = updated
			const btn = $('btnApplyDefaults')
			const originalText = btn.textContent
			btn.textContent = '✓ Applied'
			setTimeout(() => btn.textContent = originalText, 1000)
		} else {
			// No changes needed or empty
		}
	}


	// Analyze
	const formAnalyze = $('formAnalyze')
	if (formAnalyze) formAnalyze.onsubmit = async e => {
		e.preventDefault()
		const btn = $('btnAnalyze')
		btn.disabled = true
		setStatus('statusFolders', browserApi.i18n.getMessage('analyzing'), 'progress')

		// Use state.config OR the checkbox (which is synced via listener, but checking DOM is safer for immediate user override)
		const currentMerge = $('mergeCase').checked

		let res
		try {
			res = await sendRuntimeMessage({
				action: 'analyze',
				accountId: $('account').value,
				filterContent: $('pasteInput').value,
				mergeCase: currentMerge,
				rootPath: getCurrentRoot()
			}, 'statusFolders')
		} catch (error) {
			btn.disabled = false
			return
		}

		state.missing = res.missing
		const currentRoot = getCurrentRoot()
		const scopedMissing = currentRoot
			? res.missing.filter(path => path === currentRoot || path.startsWith(`${currentRoot}/`))
			: res.missing
		const stats = MailClient.computeFolderStats(state.folders, currentRoot)
		updateStat('resLeafs', stats.leafs)
		updateStat('resMissing', scopedMissing.length)

		const leafEmailMap = new Map()
		const emptyFolders = []
		for (const leafPath of stats.leafPaths) {
			const folder = state.folders.find(item => item.cleanPath === leafPath)
			if (!folder) continue
			try {
				const response = await sendRuntimeMessage({
					action: 'scanFolderSenders',
					folderId: String(folder.id),
					limit: 25
				}, 'statusFolders')
				const senders = response.senders || []
				if (senders.length === 0) {
					emptyFolders.push(leafPath)
					continue
				}
				senders.forEach(email => {
					if (!leafEmailMap.has(email)) {
						leafEmailMap.set(email, leafPath)
					}
				})
			} catch (scanError) {
				emptyFolders.push(leafPath)
			}
		}

		const sourceSelection = getSelectedFolderMeta($('scanSource'))
		const sourceFolder = sourceSelection
			? state.folders.find(folder => String(folder.id) === String(sourceSelection.id))
			: null
		let inboxEmails = []
		if (sourceFolder) {
			try {
				const response = await sendRuntimeMessage({
					action: 'scanFolderSenders',
					folderId: String(sourceFolder.id),
					limit: state.config.scanLimit
				}, 'statusFolders')
				inboxEmails = response.senders || []
			} catch (scanError) {
				inboxEmails = []
			}
		}

		const ruleEmails = new Set(RuleEngine.parse($('pasteInput')?.value || '').flatMap(rule => rule.emails))
		const missingInboxRules = inboxEmails.filter(email => !ruleEmails.has(email))

		const analysis = analyzeRulesAndFolders(currentRoot, leafEmailMap)
		const report = $('analysisReportContent')
		const reportPanel = $('analysisReport')
		if (report && reportPanel) {
			const lines = []
			lines.push(`Missing rules for valid folders: ${analysis.missingRules.length}`)
			analysis.missingRules.forEach(item => {
				lines.push(`- ${item.email} -> ${item.expectedPath}`)
			})
			lines.push('')
			lines.push(`Folders that don't match expected rule path: ${analysis.mismatchedRules.length}`)
			analysis.mismatchedRules.forEach(item => {
				lines.push(`- ${item.email} actual: ${item.actualPath || item.rulePath} expected: ${item.expectedPath}`)
			})
			lines.push('')
			lines.push(`Rules pointing to missing folders: ${analysis.expectedMissing.length}`)
			analysis.expectedMissing.forEach(item => {
				lines.push(`- ${item.email} -> ${item.rulePath}`)
			})
			lines.push('')
			lines.push(`Empty leaf folders (no senders found): ${emptyFolders.length}`)
			emptyFolders.forEach(path => lines.push(`- ${path}`))
			report.textContent = lines.join('\n')
			reportPanel.classList.remove('hidden')
		}

		setCounter('countMissingInbox', missingInboxRules.length)
		setCounter('countMissingLeafRules', analysis.missingRules.length)
		setCounter('countMismatchedFolders', analysis.mismatchedRules.length)
		setCounter('countRulesMissingFolders', analysis.expectedMissing.length)
		setCounter('countEmptyLeafFolders', emptyFolders.length)

		if ($('missingInboxDetails')) $('missingInboxDetails').classList.toggle('hidden', missingInboxRules.length === 0)
		renderAnalysisList('listMissingInbox', missingInboxRules, email => email)

		if ($('missingLeafDetails')) $('missingLeafDetails').classList.toggle('hidden', analysis.missingRules.length === 0)
		renderAnalysisList('listMissingLeafRules', analysis.missingRules, item => `${item.email} -> ${item.expectedPath}`)

		if ($('mismatchedDetails')) $('mismatchedDetails').classList.toggle('hidden', analysis.mismatchedRules.length === 0)
		renderAnalysisList('listMismatchedFolders', analysis.mismatchedRules, item => `${item.email} actual: ${item.actualPath || item.rulePath} expected: ${item.expectedPath}`)

		if ($('rulesMissingDetails')) $('rulesMissingDetails').classList.toggle('hidden', analysis.expectedMissing.length === 0)
		renderAnalysisList('listRulesMissingFolders', analysis.expectedMissing, item => `${item.email} -> ${item.rulePath}`)

		if ($('emptyFoldersDetails')) $('emptyFoldersDetails').classList.toggle('hidden', emptyFolders.length === 0)
		renderAnalysisList('listEmptyLeafFolders', emptyFolders, path => path)

		const btnGenMissingInbox = $('btnGenMissingInbox')
		if (btnGenMissingInbox) btnGenMissingInbox.disabled = missingInboxRules.length === 0
		const btnGenMissingLeaf = $('btnGenMissingLeaf')
		if (btnGenMissingLeaf) btnGenMissingLeaf.disabled = analysis.missingRules.length === 0
		const btnGenMismatched = $('btnGenMismatched')
		if (btnGenMismatched) btnGenMismatched.disabled = analysis.mismatchedRules.length === 0
		const btnCreateRuleFolders = $('btnCreateRuleFolders')
		if (btnCreateRuleFolders) btnCreateRuleFolders.disabled = analysis.expectedMissing.length === 0
		const btnDeleteEmptyFolders = $('btnDeleteEmptyFolders')
		if (btnDeleteEmptyFolders) btnDeleteEmptyFolders.disabled = emptyFolders.length === 0

		state.analysis = {
			missingInboxRules,
			missingLeafRules: analysis.missingRules,
			mismatchedFolders: analysis.mismatchedRules,
			rulesMissingFolders: analysis.expectedMissing,
			emptyLeafFolders: emptyFolders
		}

		const list = $('missingList')
		list.innerHTML = ''
		list.classList.toggle('empty-state', res.missing.length === 0)

		if (scopedMissing.length === 0) {
			list.textContent = browserApi.i18n.getMessage('allFoldersExist')
			$('btnCreateMissing').disabled = true
		} else {
			scopedMissing.forEach(p => {
				const div = document.createElement('div')
				div.className = 'folder-item pending'
				div.textContent = p
				list.appendChild(div)
			})
			$('btnCreateMissing').disabled = false
			$('btnCreateMissing').textContent = browserApi.i18n.getMessage('createFolders', [scopedMissing.length])
		}
		setStatus('statusFolders', 'Done', 'success')
		btn.disabled = false
	}

	const btnCreateMissing = $('btnCreateMissing')
	if (btnCreateMissing) btnCreateMissing.onclick = () => {
		const warnings = collectPathWarnings(state.missing)
		if (warnings.length > 0 && !window.confirm(warnings.join('\n') + '\n\nContinue anyway?')) return
		if (!state.missing || state.missing.length === 0) {
			setStatus('statusFolders', 'No folders to create.', 'info')
			return
		}
		runCreate(state.missing, 'statusFolders', btnCreateMissing)
	}

	const btnGenMissingInbox = $('btnGenMissingInbox')
	if (btnGenMissingInbox) btnGenMissingInbox.onclick = async () => {
		if (!state.analysis) return
		btnGenMissingInbox.disabled = true
		const root = getCurrentRoot()
		const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
		const rules = state.analysis.missingInboxRules.map(email => {
			const suffix = RuleEngine.emailToPath(email)
			const path = root ? `${root}/${suffix}` : suffix
			return genBlock(email, path, getFilterTypeMask())
		})
		const out = $('analysisRulesOut')
		if (out) out.value = rules.join('\n')
		$('analysisRulesDetails')?.classList.remove('hidden')
		await $('btnAnalyze')?.click()
		btnGenMissingInbox.disabled = false
	}

	const btnGenMissingLeaf = $('btnGenMissingLeaf')
	if (btnGenMissingLeaf) btnGenMissingLeaf.onclick = async () => {
		if (!state.analysis) return
		btnGenMissingLeaf.disabled = true
		const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
		const rules = state.analysis.missingLeafRules.map(item => {
			return genBlock(item.email, item.expectedPath, getFilterTypeMask())
		})
		const out = $('analysisRulesOut')
		if (out) out.value = rules.join('\n')
		$('analysisRulesDetails')?.classList.remove('hidden')
		await $('btnAnalyze')?.click()
		btnGenMissingLeaf.disabled = false
	}

	const btnGenMismatched = $('btnGenMismatched')
	if (btnGenMismatched) btnGenMismatched.onclick = async () => {
		if (!state.analysis) return
		btnGenMismatched.disabled = true
		const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
		const rules = state.analysis.mismatchedFolders.map(item => {
			return genBlock(item.email, item.expectedPath, getFilterTypeMask())
		})
		const out = $('analysisRulesOut')
		if (out) out.value = rules.join('\n')
		$('analysisRulesDetails')?.classList.remove('hidden')
		await $('btnAnalyze')?.click()
		btnGenMismatched.disabled = false
	}

	const btnCreateRuleFolders = $('btnCreateRuleFolders')
	if (btnCreateRuleFolders) btnCreateRuleFolders.onclick = async () => {
		if (!state.analysis) return
		btnCreateRuleFolders.disabled = true
		const paths = state.analysis.rulesMissingFolders.map(item => item.rulePath)
		await runCreate(paths, 'statusFolders', btnCreateRuleFolders)
		await $('btnAnalyze')?.click()
		btnCreateRuleFolders.disabled = false
	}

	const btnDeleteEmptyFolders = $('btnDeleteEmptyFolders')
	if (btnDeleteEmptyFolders) btnDeleteEmptyFolders.onclick = async () => {
		setStatus('statusFolders', 'Delete empty folders not supported by API.', 'warning')
	}

	const btnLeafDebug = $('btnLeafDebug')
	if (btnLeafDebug) btnLeafDebug.onclick = () => {
		const panel = $('leafDebugPanel')
		if (!panel) return
		panel.classList.remove('hidden')
		const isOpening = !panel.open
		panel.open = isOpening
	}

	const leafDebugPanel = $('leafDebugPanel')
	if (leafDebugPanel) {
		leafDebugPanel.addEventListener('toggle', () => {
			if (leafDebugPanel.open) {
				const stats = MailClient.computeFolderStats(state.folders, getCurrentRoot())
				renderLeafDebug(stats)
			}
		})
	}

	// Discovery
	$('btnInfer').onclick = () => {
		const root = inferRootFromFolders()
		if (root) {
			$('targetRoot').value = root
			refreshFolderStats()
			setStatus('statusDiscovery', browserApi.i18n.getMessage('rootInferred', [root]), 'success')
			saveAccountPreferences()
		} else {
			setStatus('statusDiscovery', browserApi.i18n.getMessage('rootNotFound'), 'warning')
		}
	}

	$('formDiscovery').onsubmit = async e => {
		e.preventDefault()
		setStatus('statusDiscovery', 'Scanning...', 'progress')
		let emails
		try {
			const sourceSelection = getSelectedFolderMeta($('scanSource'))
			const rootFolder = sourceSelection
				? state.folders.find(folder => String(folder.id) === String(sourceSelection.id))
				: (state.folders.find(folder => folder.name === 'Inbox') || state.folders[0])
			if (!rootFolder) {
				setStatus('statusDiscovery', 'No source folder selected.', 'warning')
				return
			}
			emails = await sendRuntimeMessage({
				action: 'scanMessages',
				folderId: String(rootFolder.id),
				limit: state.config.scanLimit // Use Config
			}, 'statusDiscovery')
		} catch (error) {
			return
		}

		const existingEmails = new Set(RuleEngine.parse($('pasteInput').value).flatMap(r => r.emails))
		const root = getCurrentRoot()

		state.discovered = emails
			.filter(e => !existingEmails.has(e))
			.map(email => {
				const suffix = RuleEngine.emailToPath(email)
				return suffix ? {
					email,
					path: root ? `${root}/${suffix}` : suffix,
					selected: true
				} : null
			})
			.filter(Boolean)

		renderDiscovery()
		setStatus('statusDiscovery', `Found ${state.discovered.length}`, 'success')
		$('genRulesArea').classList.remove('hidden')
	}

	const selectAll = $('selectAllDiscovery')
	if (selectAll) selectAll.onchange = e => {
		state.discovered.forEach(i => i.selected = e.target.checked)
		renderDiscovery()
	}

	document.querySelectorAll('.sortable').forEach(el => el.onclick = () => {
		const col = el.dataset.sort
		if (state.sort.col === col) state.sort.dir *= -1
		else { state.sort.col = col; state.sort.dir = 1 }
		renderDiscovery()
	})

	const btnCreateDiscovered = $('btnCreateDiscovered')
	if (btnCreateDiscovered) btnCreateDiscovered.onclick = () => {
		const paths = state.discovered.filter(i => i.selected).map(i => i.path)
		const warnings = collectPathWarnings(paths)
		if (warnings.length > 0 && !window.confirm(warnings.join('\n') + '\n\nContinue anyway?')) return
		if (paths.length === 0) {
			setStatus('statusDiscovery', 'No folders selected to create.', 'info')
			return
		}
		runCreate(paths, 'statusDiscovery', btnCreateDiscovered)
	}

	const btnGenRules = $('btnGenRules')
	if (btnGenRules) btnGenRules.onclick = () => {
		const selected = state.discovered.filter(i => i.selected)
		
		// Check for account/rules mismatch
		const mismatch = validateAccountRulesMatch()
		const warningEl = $('accountMismatchWarning')
		const overrideCheckbox = $('chkOverrideAccount')
		
		if (mismatch) {
			// Show warning
			$('mismatchAccountUri').textContent = mismatch.accountUri
			$('mismatchRulesUri').textContent = mismatch.rulesUri
			warningEl.style.display = 'block'
			
			// Enable override checkbox
			overrideCheckbox.disabled = false
			overrideCheckbox.title = "Check to use selected account URI instead of pasted rules URI"
			
			// Default to override checked for better UX
			if (!overrideCheckbox.hasAttribute('data-user-set')) {
				overrideCheckbox.checked = true
			}
		} else {
			// Hide warning
			warningEl.style.display = 'none'
			overrideCheckbox.disabled = true
			overrideCheckbox.title = "Enable when account mismatch is detected"
		}
		
		// Determine which base URI to use
		let base
		if (mismatch && overrideCheckbox.checked) {
			// User wants to override with selected account
			base = state.accountBaseUri || "imap://REPLACE_ME"
		} else {
			// Use rules base URI if available, otherwise account
			const rulesBase = RuleEngine.extractBaseUri($('pasteInput').value)
			base = (rulesBase && rulesBase !== "imap://REPLACE_ME") ? rulesBase : (state.accountBaseUri || "imap://REPLACE_ME")
		}
		
		// Use configured filter mask
		const typeMask = getFilterTypeMask()
		const genBlock = RuleEngine.generateBlock(base)
		$('genRulesOut').value = selected.map(i => genBlock(i.email, i.path, typeMask)).join('\n')
		$('genRulesArea').scrollIntoView({ behavior: 'smooth' })
	}
	
	// Track user interaction with override checkbox
	const overrideCheckbox = $('chkOverrideAccount')
	if (overrideCheckbox) {
		overrideCheckbox.onchange = () => {
			overrideCheckbox.setAttribute('data-user-set', 'true')
			// Re-trigger rule generation to update with new setting
			if ($('btnGenRules')) $('btnGenRules').click()
		}
	}

	const btnDownload = $('btnDownload')
	if (btnDownload) btnDownload.onclick = async () => {
		let combined = ($('pasteInput').value || '') + '\n' + ($('genRulesOut').value || '')
		
		// Sort combined content if requested
		if ($('chkSortDownload').checked) {
			combined = RuleEngine.sortRawRules(combined)
		}

		const url = URL.createObjectURL(new Blob([combined], { type: 'text/plain' }))
		await browserApi.downloads.download({ url, filename: 'msgFilterRules.dat', saveAs: true })
	}
})
