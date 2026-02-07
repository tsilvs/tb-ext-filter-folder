/**
 * UI.js - Main Frontend Logic
 */
import { RuleEngine } from './modules/RuleEngine.js'
import { MailClient } from './modules/MailClient.js'
import * as storage from './utils/storage.js'
import { analyzePathIssues, generateWarnings } from './utils/pathSanitizer.js'
import { createStore } from './utils/store.js'

// Namespace compatibility
const browserApi = (typeof browser !== 'undefined') ? browser : messenger;

// --- State & DOM ---
const $ = id => document.getElementById(id)
const initialState = {
	folders: [],              // Current account folder list
	missing: [],              // Analyzed missing paths
	discovered: [],           // Scanned emails {email, path, selected}
	sort: { col: 'email', dir: 1 },
	currentAccount: null,     // Current account object with identities
	accountBaseUri: null,     // imap://user@host from current account
	analysis: null,
	analysisMeta: null,
	processing: {
		folders: false,
		discovery: false
	},
	rulesSnapshot: '',
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
const store = createStore(initialState)
const state = store.getState()

store.subscribe((next, prev, meta) => {
	if (next.processing !== prev.processing) {
		renderProcessing(next.processing)
	}
	if (next.config !== prev.config) {
		renderConfig(next.config)
	}
	if (next.rulesSnapshot !== prev.rulesSnapshot) {
		renderRulesSnapshot(next.rulesSnapshot)
	}
	if (next.folders !== prev.folders) {
		refreshFolderStats(next.folders)
	}
	if (next.discovered !== prev.discovered || next.sort !== prev.sort) {
		renderDiscovery()
	}
	if (next.missing !== prev.missing) {
		renderMissingList()
	}
	if (next.analysis !== prev.analysis) {
		renderAnalysis()
	}
	if (next.analysisMeta !== prev.analysisMeta) {
		renderInboxDebug()
		renderDeleteEmptyReport()
		renderLeafRulesMissing()
	}
})

// --- Helpers ---
const setStatus = (id, msg, type = 'info') => {
	const el = $(id)
	if (el) el.innerHTML = `<div class="status ${type}">${msg}</div>`
}

const setProcessing = (isProcessing, scope = 'folders') => {
	store.setState(prev => ({
		processing: {
			...prev.processing,
			[scope]: isProcessing
		}
	}), { type: 'processing', scope })
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

function renderProcessing(processing) {
	const isFolders = !!processing.folders
	const isDiscovery = !!processing.discovery

	const analysisSection = $('analysisResults')
	if (analysisSection) {
		analysisSection.classList.toggle('is-processing', isFolders)
	}
	const discoverySection = $('contentDiscovery')
	if (discoverySection) {
		discoverySection.classList.toggle('is-processing', isDiscovery)
	}
	const btnAnalyze = $('btnAnalyze')
	if (btnAnalyze) btnAnalyze.disabled = isFolders || isDiscovery
	const btnScan = $('btnScan')
	if (btnScan) btnScan.disabled = isFolders || isDiscovery
}

function renderConfig(config) {
	if ($('mergeCase')) $('mergeCase').checked = config.mergeCase

	const btnScan = $('btnScan')
	if (btnScan) btnScan.textContent = browserApi.i18n.getMessage('scanAndDiscoverLimit', [config.scanLimit])

	const rootSelect = $('targetRoot')
	if (rootSelect && !rootSelect.value && config.defaultRoot) {
		rootSelect.value = config.defaultRoot
	}
}

const updateRulesDirtyState = () => {
	const currentRules = $('currentRules')
	const isDirty = currentRules && currentRules.value !== state.rulesSnapshot
	if (currentRules) {
		currentRules.classList.toggle('is-dirty', !!isDirty)
	}
}

const dedupeRawRules = (content) => {
	const marker = 'name="'
	const firstIdx = content.indexOf(marker)
	if (firstIdx === -1) return content
	const header = content.substring(0, firstIdx)
	const rulesContent = content.substring(firstIdx)
	const blocks = rulesContent.split(/(?=name=")/g).map(block => block.trim()).filter(Boolean)
	const seen = new Set()
	const unique = []
	blocks.forEach(block => {
		const key = block.replace(/\r\n/g, '\n').trim()
		if (seen.has(key)) return
		seen.add(key)
		unique.push(block)
	})
	return `${header}${unique.join('\n')}`
}

const dedupeRawRulesByPath = (content) => {
	const marker = 'name="'
	const firstIdx = content.indexOf(marker)
	if (firstIdx === -1) return content
	const header = content.substring(0, firstIdx)
	const rulesContent = content.substring(firstIdx)
	const blocks = rulesContent.split(/(?=name=")/g).map(block => block.trim()).filter(Boolean)
	const seen = new Set()
	const unique = []
	blocks.forEach(block => {
		const path = RuleEngine.extractPathFromBlock(block)
		const emails = RuleEngine.extractEmailsFromBlock(block)
			.map(email => email.toLowerCase())
			.sort()
		const key = path
			? `${path.toLowerCase()}|${emails.join(',')}`
			: block.replace(/\r\n/g, '\n').trim()
		if (seen.has(key)) return
		seen.add(key)
		unique.push(block)
	})
	return `${header}${unique.join('\n')}`
}

const appendGeneratedRules = (generated) => {
	if (!generated || !generated.trim()) return
	const currentRules = $('currentRules')
	if (!currentRules) return
	const combined = `${currentRules.value || ''}\n${generated}`
	const deduped = dedupeRawRules(combined)
	const dedupedByPath = dedupeRawRulesByPath(deduped)
	const sorted = RuleEngine.sortRawRules(dedupedByPath)
	currentRules.value = sorted
	syncRuleState(currentRules.value)
}

	const withButtonBusy = async (button, action) => {
		if (!button) return action()
		const originalText = button.textContent
		const busyText = button.dataset.busyText || 'Working...'
		const block = button.closest('#analysisResults')
		const siblings = block ? Array.from(block.querySelectorAll('aside.stat button')) : [button]
		siblings.forEach(btn => {
			btn.dataset.prevDisabled = btn.disabled ? 'true' : 'false'
			btn.disabled = true
		})
		button.textContent = busyText
		button.classList.add('is-busy')
		try {
			return await action()
		} finally {
			button.textContent = originalText
			button.classList.remove('is-busy')
			siblings.forEach(btn => {
				btn.disabled = btn.dataset.prevDisabled === 'true'
				delete btn.dataset.prevDisabled
			})
		}
	}

function renderRulesSnapshot(nextSnapshot) {
	const currentRules = $('currentRules')
	if (!currentRules) return
	if (currentRules.value !== nextSnapshot) {
		currentRules.value = nextSnapshot
	}
	updateRulesDirtyState()
}

const getUniqueRuleEmails = () => {
	const rules = RuleEngine.parse($('currentRules')?.value || '')
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
	const rules = RuleEngine.parse($('currentRules')?.value || '')
	const ruleEmailMap = buildEmailToRulePathMap(rules)

	const missingRules = []
	const mismatchedRules = []

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

	return { missingRules, mismatchedRules }
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

function renderAnalysis() {
	const analysis = state.analysis
	if (!analysis) {
		setCounter('countMissingInbox', 0)
		setCounter('countMissingLeafRules', 0)
		setCounter('countMismatchedFolders', 0)
		setCounter('countEmptyLeafFolders', 0)
		setCounter('countInvalidRules', 0)
		$('analysisReportContent') && ($('analysisReportContent').textContent = '')
		$('analysisReport')?.classList.add('hidden')
		$('missingInboxDetails')?.classList.add('hidden')
		$('missingLeafDetails')?.classList.add('hidden')
		$('mismatchedDetails')?.classList.add('hidden')
		$('emptyFoldersDetails')?.classList.add('hidden')
		$('invalidRulesDetails')?.classList.add('hidden')
		$('inboxDebugPanel')?.classList.add('hidden')
		$('deleteEmptyDetails')?.classList.add('hidden')
		$('leafRulesMissingDetails')?.classList.add('hidden')
		if ($('btnGenMissingInbox')) $('btnGenMissingInbox').disabled = true
		if ($('btnGenMissingLeaf')) $('btnGenMissingLeaf').disabled = true
		if ($('btnGenMismatched')) $('btnGenMismatched').disabled = true
		if ($('btnDeleteEmptyFolders')) $('btnDeleteEmptyFolders').disabled = true
		if ($('btnDeleteInvalidRules')) $('btnDeleteInvalidRules').disabled = true
		return
	}

		const {
			missingInboxRules,
			missingLeafRules,
			mismatchedFolders,
			emptyLeafFolders,
			invalidRules
		} = analysis

	const report = $('analysisReportContent')
	const reportPanel = $('analysisReport')
	if (report && reportPanel) {
		const lines = []
		lines.push(`Missing rules for valid folders: ${missingLeafRules.length}`)
		missingLeafRules.forEach(item => {
			lines.push(`- ${item.email} -> ${item.expectedPath}`)
		})
		lines.push('')
		lines.push(`Folders that don't match expected rule path: ${mismatchedFolders.length}`)
		mismatchedFolders.forEach(item => {
			lines.push(`- ${item.email} actual: ${item.actualPath || item.rulePath} expected: ${item.expectedPath}`)
		})
		lines.push('')
		lines.push('')
		lines.push(`Empty leaf folders (no senders found): ${emptyLeafFolders.length}`)
		emptyLeafFolders.forEach(path => lines.push(`- ${path}`))
		report.textContent = lines.join('\n')
		reportPanel.classList.remove('hidden')
	}

	setCounter('countMissingInbox', missingInboxRules.length)
	setCounter('countMissingLeafRules', missingLeafRules.length)
	setCounter('countMismatchedFolders', mismatchedFolders.length)
	setCounter('countEmptyLeafFolders', emptyLeafFolders.length)
	setCounter('countInvalidRules', invalidRules.length)

	if ($('missingInboxDetails')) $('missingInboxDetails').classList.toggle('hidden', missingInboxRules.length === 0)
	renderAnalysisList('listMissingInbox', missingInboxRules, email => email)

	if ($('missingLeafDetails')) $('missingLeafDetails').classList.toggle('hidden', missingLeafRules.length === 0)
	renderAnalysisList('listMissingLeafRules', missingLeafRules, item => `${item.email} -> ${item.expectedPath}`)

	if ($('mismatchedDetails')) $('mismatchedDetails').classList.toggle('hidden', mismatchedFolders.length === 0)
	renderAnalysisList('listMismatchedFolders', mismatchedFolders, item => `${item.email} actual: ${item.actualPath || item.rulePath} expected: ${item.expectedPath}`)


	if ($('emptyFoldersDetails')) $('emptyFoldersDetails').classList.toggle('hidden', emptyLeafFolders.length === 0)
	renderAnalysisList('listEmptyLeafFolders', emptyLeafFolders, path => path)

	if ($('invalidRulesDetails')) $('invalidRulesDetails').classList.toggle('hidden', invalidRules.length === 0)
	renderAnalysisList('listInvalidRules', invalidRules, item => `${item.email} -> ${item.rulePath} (expected ${item.expectedPath})`)

	if ($('btnGenMissingInbox')) $('btnGenMissingInbox').disabled = missingInboxRules.length === 0
	if ($('btnGenMissingLeaf')) $('btnGenMissingLeaf').disabled = missingLeafRules.length === 0
	if ($('btnGenMismatched')) $('btnGenMismatched').disabled = mismatchedFolders.length === 0
	if ($('btnDeleteEmptyFolders')) $('btnDeleteEmptyFolders').disabled = emptyLeafFolders.length === 0
	if ($('btnDeleteInvalidRules')) $('btnDeleteInvalidRules').disabled = invalidRules.length === 0
}

function renderLeafRulesMissing() {
	const container = $('leafRulesMissingDetails')
	const list = $('listLeafRulesMissing')
	if (!container || !list) return
	const missing = state.analysisMeta?.leafRulesMissing || []
	container.classList.toggle('hidden', missing.length === 0)
	list.innerHTML = ''
	missing.forEach(path => {
		const div = document.createElement('div')
		div.className = 'folder-item pending'
		div.textContent = path
		list.appendChild(div)
	})
}

function renderInboxDebug() {
	const panel = $('inboxDebugPanel')
	const report = $('inboxDebugReport')
	if (!panel || !report) return

	const meta = state.analysisMeta?.inbox
	if (!meta) {
		report.textContent = 'Inbox debug data is not available yet.'
		panel.classList.add('hidden')
		return
	}

	const lines = []
	lines.push(`Current Root: ${meta.rootPath || '(account root)'}`)
	lines.push(`Source Folder: ${meta.sourceFolder?.name || 'Unknown'} (${meta.sourceFolder?.path || 'n/a'})`)
	lines.push(`Scan Limit: ${meta.scanLimit}`)
	lines.push(`Rule Emails: ${meta.ruleEmailCount}`)
	lines.push(`Inbox Senders: ${meta.totalSenders} (${meta.uniqueSenders} unique, ${meta.duplicateSenders} duplicates)`)
	lines.push(`Missing Rules (Inbox): ${meta.missingCount} (${meta.missingUniqueCount} unique)`) 
	lines.push(`Matched Rules (Inbox): ${meta.matchedCount}`)
	lines.push(`Mismatched Paths (Inbox): ${meta.mismatchedCount}`)
	lines.push(`Invalid Emails (Inbox): ${meta.invalidEmailCount}`)
	lines.push('')
	lines.push(`Missing Inbox Emails (unique, showing ${Math.min(meta.missingEmails.length, 200)} of ${meta.missingEmails.length}):`)
	meta.missingEmails.slice(0, 200).forEach(email => lines.push(`- ${email}`))
	lines.push('')
	lines.push(`Mismatched Inbox Rules (showing ${Math.min(meta.mismatchedRules.length, 200)} of ${meta.mismatchedRules.length}):`)
	meta.mismatchedRules.slice(0, 200).forEach(item => lines.push(`- ${item.email}: rule=${item.rulePath} expected=${item.expectedPath}`))
	lines.push('')
	lines.push(`Invalid Inbox Emails (showing ${Math.min(meta.invalidEmails.length, 200)} of ${meta.invalidEmails.length}):`)
	meta.invalidEmails.slice(0, 200).forEach(email => lines.push(`- ${email}`))
	lines.push('')
	lines.push(`Inbox Emails (unique, showing ${Math.min(meta.inboxEmails.length, 200)} of ${meta.inboxEmails.length}):`)
	meta.inboxEmails.slice(0, 200).forEach(email => lines.push(`- ${email}`))

	report.textContent = lines.join('\n')
	panel.classList.remove('hidden')
}

function renderDeleteEmptyReport() {
	const panel = $('deleteEmptyDetails')
	const report = $('deleteEmptyReport')
	if (!panel || !report) return

	const meta = state.analysisMeta?.deleteEmpty
	if (!meta) {
		report.textContent = ''
		panel.classList.add('hidden')
		return
	}

	const lines = []
	lines.push(`Deleted: ${meta.deleted}`)
	lines.push(`Failed: ${meta.failed}`)
	lines.push('')
	lines.push(`Failures (showing ${Math.min(meta.failures.length, 200)} of ${meta.failures.length}):`)
	meta.failures.slice(0, 200).forEach(item => {
		lines.push(`- ${item.path}: ${item.error}`)
	})

	report.textContent = lines.join('\n')
	panel.classList.remove('hidden')
}

function renderMissingList() {
	const missing = state.missing || []
	const currentRoot = getCurrentRoot()
	const scopedMissing = currentRoot
		? missing.filter(path => path === currentRoot || path.startsWith(`${currentRoot}/`))
		: missing
	const stats = MailClient.computeFolderStats(state.folders, currentRoot)
	updateStat('resLeafs', stats.leafs)
	updateStat('resMissing', scopedMissing.length)

	const list = $('missingList')
	if (!list) return
	list.innerHTML = ''
	list.classList.toggle('empty-state', missing.length === 0)

	if (scopedMissing.length === 0) {
		list.textContent = browserApi.i18n.getMessage('allFoldersExist')
		$('btnCreateMissing').disabled = true
		$('btnCreateMissingInline').disabled = true
		$('missingFoldersDetails')?.classList.add('hidden')
	} else {
		scopedMissing.forEach(p => {
			const div = document.createElement('div')
			div.className = 'folder-item pending'
			div.textContent = p
			list.appendChild(div)
		})
		$('btnCreateMissing').disabled = false
		$('btnCreateMissing').textContent = browserApi.i18n.getMessage('createFolders', [scopedMissing.length])
		const inlineBtn = $('btnCreateMissingInline')
		if (inlineBtn) {
			inlineBtn.disabled = false
			inlineBtn.textContent = browserApi.i18n.getMessage('createFolders', [scopedMissing.length])
		}
		$('missingFoldersDetails')?.classList.remove('hidden')
	}
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
	store.setState(prev => ({
		config: {
			...prev.config,
			accountPreferences
		}
	}), { type: 'config:account-preferences' })

	try {
		await storage.set({ accountPreferences })
	} catch (error) {
		console.error('Failed to save account preferences', error)
	}
}

const collectPathWarnings = (paths, options = {}) => {
	const existingPaths = state.folders.map(folder => folder.cleanPath)
	return paths.flatMap((path) => {
		const issues = analyzePathIssues(path, existingPaths, options)
		return generateWarnings(issues, path)
	})
}

const showWarningsDialog = (warnings) => new Promise(resolve => {
	const dialog = $('warningsDialog')
	const list = $('warningsList')
	const btnConfirm = $('warningsConfirm')
	const btnCancel = $('warningsCancel')
	if (!dialog || !list || !btnConfirm || !btnCancel) {
		resolve(true)
		return
	}
	list.textContent = warnings.join('\n')
	const close = (result) => {
		dialog.close()
		btnConfirm.removeEventListener('click', onConfirm)
		btnCancel.removeEventListener('click', onCancel)
		dialog.removeEventListener('click', onBackdrop)
		resolve(result)
	}
	const onConfirm = () => close(true)
	const onCancel = () => close(false)
	const onBackdrop = (e) => {
		if (e.target && e.target.dataset && e.target.dataset.close) {
			close(false)
		}
	}
	btnConfirm.addEventListener('click', onConfirm)
	btnCancel.addEventListener('click', onCancel)
	dialog.addEventListener('click', onBackdrop)
	dialog.showModal()
})

// Account/Rules Validation
function validateAccountRulesMatch() {
	const currentRules = $('currentRules')
	if (!currentRules || !currentRules.value || !state.accountBaseUri) return null
	
	const rulesBaseUri = RuleEngine.extractBaseUri(currentRules.value)
	
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
		store.setState({ config: saved }, { type: 'config:load' })

	} catch (e) {
		console.error("Failed to load config", e)
	}
}

async function loadAccount(id) {
	updateStat('statTotal', 'Loading...')
	updateStat('statLeafs', 'Loading...')

	// Get account data and folder structure
	const data = await MailClient.scanAccount(id)
	store.setState({ folders: data.folders || [] }, { type: 'folders:load' })
	
	// Store account object and construct base URI
	try {
		const currentAccount = await browserApi.accounts.get(id)
		const accountBaseUri = (currentAccount.identities && currentAccount.identities.length > 0)
			? `imap://${currentAccount.identities[0].email}`
			: "imap://REPLACE_ME"
		store.setState({ currentAccount, accountBaseUri }, { type: 'account:load' })
	} catch (e) {
		console.error("Failed to get account details", e)
		store.setState({ accountBaseUri: "imap://REPLACE_ME" }, { type: 'account:error' })
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

const refreshFolderStats = (folders = state.folders) => {
	const stats = MailClient.computeFolderStats(folders, getCurrentRoot())
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

const syncRuleState = (text) => {
	updateRuleStats(text)
	updateRulesDirtyState()
}

function renderDiscovery() {
	const list = $('discoveryList')
	list.innerHTML = ''

	const sorted = [...state.discovered].sort((a, b) => {
		const va = a[state.sort.col] || '', vb = b[state.sort.col] || ''
		return va.localeCompare(vb) * state.sort.dir
	})

	sorted.forEach((item) => {
		const row = document.createElement('div')
		row.className = `discovery-item ${item.selected ? 'selected' : ''}`
		row.innerHTML = `
			<input type="checkbox" ${item.selected ? 'checked' : ''}>
			<div class="email">${item.email}</div>
			<div class="path">${item.path}</div>`

		const toggle = () => {
			store.setState(prev => ({
				discovered: prev.discovered.map(entry => (
					entry.email === item.email && entry.path === item.path
						? { ...entry, selected: !entry.selected }
						: entry
				))
			}), { type: 'discovery:toggle', email: item.email })
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

async function runDelete(paths, statusId, btn) {
	btn.disabled = true
	setStatus(statusId, 'Deleting folders...', 'progress')

	const port = browserApi.runtime.connect({ name: 'delete-folders' })
	const accountId = $('account').value

	return new Promise(resolve => {
		port.onMessage.addListener(msg => {
			if (msg.type === 'progress') {
				setStatus(statusId, `${msg.current}/${msg.total}: ${msg.path}`, 'progress')
			} else if (msg.type === 'complete') {
				setStatus(statusId, `Deleted ${msg.results.deleted.length}, failed ${msg.results.failed.length}`, 'success')
				port.disconnect()
				btn.disabled = false
				resolve(msg.results)
			} else if (msg.type === 'error') {
				setStatus(statusId, msg.error, 'error')
				btn.disabled = false
			}
		})
		port.postMessage({ action: 'delete', accountId, paths })
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
			store.setState(prev => {
				const nextConfig = { ...prev.config }
				Object.keys(changes).forEach(key => {
					nextConfig[key] = changes[key].newValue
				})
				return { config: nextConfig }
			}, { type: 'config:update' })
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

	const currentRules = $('currentRules')
	if (currentRules && currentRules.value) {
		updateRuleStats(currentRules.value)
	}

	accSel.onchange = () => loadAccount(accSel.value).catch(console.error)

	$('fileInput').onchange = async e => {
		const text = await e.target.files[0].text()
		if (currentRules) currentRules.value = text
		store.setState({ rulesSnapshot: text }, { type: 'rules:load' })
		syncRuleState(text)
		if ($('btnAnalyze') && $('account').value) {
			$('btnAnalyze').click()
		}
	}

	if (currentRules) currentRules.oninput = e => {
		syncRuleState(e.target.value)
	}
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
		const val = currentRules.value
		if(!val) return
		const sorted = RuleEngine.sortRawRules(val)
		currentRules.value = sorted
		syncRuleState(sorted)
		// Visual feedback
		const btn = $('btnSortInput')
		const originalText = btn.textContent
		btn.textContent = '✓ ' + btn.textContent
		setTimeout(() => btn.textContent = originalText, 1000)
	}

	// Apply Defaults Button
	$('btnApplyDefaults').onclick = () => {
		const val = currentRules.value
		if(!val) return
		
		const typeMask = getFilterTypeMask()
		const updated = RuleEngine.updateFilterTypes(val)(typeMask)
		
		if (updated !== val) {
			currentRules.value = updated
			syncRuleState(updated)
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
		setProcessing(true, 'folders')
		setStatus('statusFolders', browserApi.i18n.getMessage('analyzing'), 'progress')

		// Use state.config OR the checkbox (which is synced via listener, but checking DOM is safer for immediate user override)
		const currentMerge = $('mergeCase').checked

		let res
		try {
			res = await sendRuntimeMessage({
				action: 'analyze',
				accountId: $('account').value,
				filterContent: $('currentRules').value,
				mergeCase: currentMerge,
				rootPath: getCurrentRoot()
			}, 'statusFolders')
		} catch (error) {
			btn.disabled = false
			setProcessing(false, 'folders')
			return
		}

		store.setState({ missing: res.missing }, { type: 'analysis:missing' })
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

		const parsedRules = RuleEngine.parse($('currentRules')?.value || '')
		const ruleEmails = new Set(parsedRules.flatMap(rule => rule.emails))
		const ruleEmailMap = buildEmailToRulePathMap(parsedRules)
		const rulePaths = RuleEngine.getUniquePaths(parsedRules)
		const rootPrefix = currentRoot ? `${currentRoot}/` : ''
		const scopedRulePaths = currentRoot
			? rulePaths.filter(path => path === currentRoot || path.startsWith(rootPrefix))
			: rulePaths
		const rulePathSet = new Set(scopedRulePaths.map(path => (currentMerge ? path.toLowerCase() : path)))
		const leafRulesMissing = stats.leafPaths.filter(path => !rulePathSet.has(currentMerge ? path.toLowerCase() : path))
		const missingInboxRules = inboxEmails.filter(email => !ruleEmails.has(email))
		const uniqueInboxEmails = Array.from(new Set(inboxEmails))
		const uniqueMissingInbox = Array.from(new Set(missingInboxRules))
		const mismatchedRules = []
		const invalidEmails = []
		let matchedCount = 0
		uniqueInboxEmails.forEach(email => {
			const expectedSuffix = RuleEngine.emailToPath(email)
			if (!expectedSuffix) {
				invalidEmails.push(email)
				return
			}
			const expectedPath = currentRoot ? `${currentRoot}/${expectedSuffix}` : expectedSuffix
			const rulePath = ruleEmailMap.get(email)
			if (!rulePath) return
			if (rulePath !== expectedPath) {
				mismatchedRules.push({ email, rulePath, expectedPath })
			} else {
				matchedCount += 1
			}
		})
		const sourceMeta = sourceFolder
			? { id: sourceFolder.id, name: sourceFolder.name, path: sourceFolder.cleanPath || sourceFolder.path || '' }
			: null

		const analysis = analyzeRulesAndFolders(currentRoot, leafEmailMap)
		const invalidRules = analysis.mismatchedRules.filter(item => item.rulePath)
		store.setState(prev => ({
			analysis: {
				missingInboxRules,
				missingLeafRules: analysis.missingRules,
				mismatchedFolders: analysis.mismatchedRules,
				emptyLeafFolders: emptyFolders,
				invalidRules
			},
			analysisMeta: {
				...(prev.analysisMeta || {}),
				inbox: {
					rootPath: currentRoot,
					sourceFolder: sourceMeta,
					scanLimit: state.config.scanLimit,
					ruleEmailCount: ruleEmails.size,
					totalSenders: inboxEmails.length,
					uniqueSenders: uniqueInboxEmails.length,
					duplicateSenders: inboxEmails.length - uniqueInboxEmails.length,
					missingCount: missingInboxRules.length,
					missingUniqueCount: uniqueMissingInbox.length,
					matchedCount,
					mismatchedCount: mismatchedRules.length,
					invalidEmailCount: invalidEmails.length,
					missingEmails: uniqueMissingInbox,
					mismatchedRules,
					invalidEmails,
					inboxEmails: uniqueInboxEmails
				},
				leafRulesMissing
			}
		}), { type: 'analysis:results' })
		setStatus('statusFolders', 'Done', 'success')
		btn.disabled = false
		setProcessing(false, 'folders')
	}

	const btnCreateMissing = $('btnCreateMissing')
	if (btnCreateMissing) btnCreateMissing.onclick = async () => {
		await withButtonBusy(btnCreateMissing, async () => {
			const warnings = collectPathWarnings(state.missing, { checkEncoding: false })
			if (warnings.length > 0 && !(await showWarningsDialog(warnings))) return
			if (!state.missing || state.missing.length === 0) {
				setStatus('statusCreateMissing', 'No folders to create.', 'info')
				return
			}
			await runCreate(state.missing, 'statusCreateMissing', btnCreateMissing)
			await $('btnAnalyze')?.click()
		})
	}

	const btnCreateMissingInline = $('btnCreateMissingInline')
	if (btnCreateMissingInline) btnCreateMissingInline.onclick = async () => {
		await withButtonBusy(btnCreateMissingInline, async () => {
			const warnings = collectPathWarnings(state.missing, { checkEncoding: false })
			if (warnings.length > 0 && !(await showWarningsDialog(warnings))) return
			if (!state.missing || state.missing.length === 0) {
				setStatus('statusCreateMissing', 'No folders to create.', 'info')
				return
			}
			await runCreate(state.missing, 'statusCreateMissing', btnCreateMissingInline)
			await $('btnAnalyze')?.click()
		})
	}

	const btnGenMissingInbox = $('btnGenMissingInbox')
	if (btnGenMissingInbox) btnGenMissingInbox.onclick = async () => {
		if (!state.analysis) return
		setProcessing(true, 'folders')
		await withButtonBusy(btnGenMissingInbox, async () => {
			const root = getCurrentRoot()
			const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
			const rules = state.analysis.missingInboxRules.map(email => {
				const suffix = RuleEngine.emailToPath(email)
				const path = root ? `${root}/${suffix}` : suffix
				return genBlock(email, path, getFilterTypeMask())
			})
			appendGeneratedRules(rules.join('\n'))
			await $('btnAnalyze')?.click()
		})
		setProcessing(false, 'folders')
	}

	const btnDownloadRules = $('btnDownloadRules')
	if (btnDownloadRules) btnDownloadRules.onclick = async () => {
		const content = $('currentRules')?.value || ''
		if (!content.trim()) {
			setStatus('statusFolders', 'No rules to download.', 'info')
			return
		}
		const sorted = RuleEngine.sortRawRules(content)
		const url = URL.createObjectURL(new Blob([sorted], { type: 'text/plain' }))
		await browserApi.downloads.download({ url, filename: 'msgFilterRules.dat', saveAs: true })
	}

	const btnGenMissingLeaf = $('btnGenMissingLeaf')
	if (btnGenMissingLeaf) btnGenMissingLeaf.onclick = async () => {
		if (!state.analysis) return
		setProcessing(true, 'folders')
		await withButtonBusy(btnGenMissingLeaf, async () => {
			const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
			const rules = state.analysis.missingLeafRules.map(item => {
				return genBlock(item.email, item.expectedPath, getFilterTypeMask())
			})
			appendGeneratedRules(rules.join('\n'))
			await $('btnAnalyze')?.click()
		})
		setProcessing(false, 'folders')
	}

	const btnGenMismatched = $('btnGenMismatched')
	if (btnGenMismatched) btnGenMismatched.onclick = async () => {
		if (!state.analysis) return
		setProcessing(true, 'folders')
		await withButtonBusy(btnGenMismatched, async () => {
			const genBlock = RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')
			const rules = state.analysis.mismatchedFolders.map(item => {
				return genBlock(item.email, item.expectedPath, getFilterTypeMask())
			})
			appendGeneratedRules(rules.join('\n'))
			await $('btnAnalyze')?.click()
		})
		setProcessing(false, 'folders')
	}

	// Rules-to-missing-folders removed

	const btnDeleteEmptyFolders = $('btnDeleteEmptyFolders')
	if (btnDeleteEmptyFolders) btnDeleteEmptyFolders.onclick = async () => {
		await withButtonBusy(btnDeleteEmptyFolders, async () => {
			const emptyLeafFolders = state.analysis?.emptyLeafFolders || []
			if (emptyLeafFolders.length === 0) {
				setStatus('statusDeleteEmpty', 'No empty folders to delete.', 'info')
				return
			}
			const warnings = collectPathWarnings(emptyLeafFolders, { checkEncoding: false })
			if (warnings.length > 0 && !(await showWarningsDialog(warnings))) return
			const results = await runDelete(emptyLeafFolders, 'statusDeleteEmpty', btnDeleteEmptyFolders)
			store.setState(prev => ({
				analysisMeta: {
					...(prev.analysisMeta || {}),
					deleteEmpty: {
						deleted: results?.deleted?.length || 0,
						failed: results?.failed?.length || 0,
						failures: results?.failed || []
					}
				}
			}), { type: 'analysis:delete-empty' })
			await $('btnAnalyze')?.click()
		})
	}

	const btnDeleteInvalidRules = $('btnDeleteInvalidRules')
	if (btnDeleteInvalidRules) btnDeleteInvalidRules.onclick = async () => {
		if (!state.analysis) return
		setProcessing(true, 'folders')
		await withButtonBusy(btnDeleteInvalidRules, async () => {
			const invalidEmails = new Set(state.analysis.invalidRules.map(item => item.email))
			const currentRules = $('currentRules')
			if (currentRules) {
				const filtered = RuleEngine.parse(currentRules.value)
					.filter(rule => rule.emails.every(email => !invalidEmails.has(email)))
					.map(rule => RuleEngine.generateBlock(state.accountBaseUri || 'imap://REPLACE_ME')(rule.emails[0], rule.path, getFilterTypeMask()))
				currentRules.value = filtered.join('\n')
				syncRuleState(currentRules.value)
			}
			await $('btnAnalyze')?.click()
		})
		setProcessing(false, 'folders')
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
		setProcessing(true, 'discovery')
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
			setProcessing(false, 'discovery')
			return
		}

		const existingEmails = new Set(RuleEngine.parse($('currentRules').value).flatMap(r => r.emails))
		const root = getCurrentRoot()

		store.setState({
			discovered: emails
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
		}, { type: 'discovery:results' })

		setStatus('statusDiscovery', `Found ${state.discovered.length}`, 'success')
		setProcessing(false, 'discovery')
	}

	const selectAll = $('selectAllDiscovery')
	if (selectAll) selectAll.onchange = e => {
		const selected = e.target.checked
		store.setState(prev => ({
			discovered: prev.discovered.map(item => ({ ...item, selected }))
		}), { type: 'discovery:select-all' })
	}

	document.querySelectorAll('.sortable').forEach(el => el.onclick = () => {
		const col = el.dataset.sort
		store.setState(prev => ({
			sort: prev.sort.col === col
				? { ...prev.sort, dir: prev.sort.dir * -1 }
				: { col, dir: 1 }
		}), { type: 'discovery:sort' })
	})

	const btnCreateDiscovered = $('btnCreateDiscovered')
	if (btnCreateDiscovered) btnCreateDiscovered.onclick = async () => {
		const paths = state.discovered.filter(i => i.selected).map(i => i.path)
		const warnings = collectPathWarnings(paths, { checkEncoding: false })
		if (warnings.length > 0 && !(await showWarningsDialog(warnings))) return
		if (paths.length === 0) {
			setStatus('statusDiscovery', 'No folders selected to create.', 'info')
			return
		}
		await withButtonBusy(btnCreateDiscovered, async () => {
			await runCreate(paths, 'statusDiscovery', btnCreateDiscovered)
		})
	}

	const btnGenRules = $('btnGenRules')
	if (btnGenRules) btnGenRules.onclick = () => {
		const selected = state.discovered.filter(i => i.selected)
		if (selected.length === 0) return
		const mismatch = validateAccountRulesMatch()
		const base = mismatch
			? (state.accountBaseUri || "imap://REPLACE_ME")
			: (() => {
				const rulesBase = RuleEngine.extractBaseUri($('currentRules').value)
				return (rulesBase && rulesBase !== "imap://REPLACE_ME") ? rulesBase : (state.accountBaseUri || "imap://REPLACE_ME")
			})()
		const typeMask = getFilterTypeMask()
		const genBlock = RuleEngine.generateBlock(base)
		const generated = selected.map(i => genBlock(i.email, i.path, typeMask)).join('\n')
		appendGeneratedRules(generated)
	}
})
