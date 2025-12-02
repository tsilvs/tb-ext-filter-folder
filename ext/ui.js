/**
 * UI.js - Main Frontend Logic
 */
import { RuleEngine } from './modules/RuleEngine.js'
import { MailClient } from './modules/MailClient.js'

// Namespace compatibility
const browserApi = (typeof browser !== 'undefined') ? browser : messenger;

// --- State & DOM ---
const $ = id => document.getElementById(id)
const state = {
	folders: [],       // Current account folder list
	missing: [],       // Analyzed missing paths
	discovered: [],    // Scanned emails {email, path, selected}
	sort: { col: 'email', dir: 1 },
	currentAccount: null, // Current account object with identities
	accountBaseUri: null, // imap://user@host from current account
	config: {          // Loaded from Storage
		scanLimit: 500,
		mergeCase: true,
		defaultRoot: '',
		// Filter Type Defaults
		filterManual: true,
		filterNewMail: true,
		filterSending: false,
		filterArchive: false,
		filterPeriodic: false
	}
}

// --- Helpers ---
const setStatus = (id, msg, type = 'info') => {
	const el = $(id)
	if (el) el.innerHTML = `<div class="status ${type}">${msg}</div>`
}

const updateStat = (id, val) => {
	const el = $(id)
	if (el) el.textContent = val
}

const getFilterTypeMask = () => {
	return RuleEngine.calculateType({
		manual: state.config.filterManual,
		newMail: state.config.filterNewMail,
		afterSending: state.config.filterSending,
		archiving: state.config.filterArchive,
		periodic: state.config.filterPeriodic
	});
};

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
		const saved = await browserApi.storage.sync.get({
			scanLimit: 500,
			mergeCase: true,
			defaultRoot: '',
			filterManual: true,
			filterNewMail: true,
			filterSending: false,
			filterArchive: false,
			filterPeriodic: false
		})
		state.config = saved
		
		// Apply to UI
		if($('mergeCase')) $('mergeCase').checked = state.config.mergeCase
		if($('targetRoot') && !$('targetRoot').value) $('targetRoot').value = state.config.defaultRoot
		
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

	updateStat('statTotal', data.total)
	updateStat('statLeafs', data.leafs)

	const sel = $('scanSource')
	if (sel) {
		sel.innerHTML = ''
		state.folders.forEach(f => {
			const opt = new Option('—'.repeat(f.depth) + ' ' + f.name, f.id)
			if (f.name === 'Inbox') opt.selected = true
			sel.add(opt)
		})
	}
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
		port.postMessage({ action: 'create', accountId, paths })
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
		const updated = RuleEngine.updateFilterTypes(val, typeMask)
		
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

		const res = await browserApi.runtime.sendMessage({
			action: 'analyze',
			accountId: $('account').value,
			filterContent: $('pasteInput').value,
			mergeCase: currentMerge
		})

		state.missing = res.missing
		updateStat('resLeafs', res.totalLeafs)
		updateStat('resMissing', res.missing.length)

		const list = $('missingList')
		list.innerHTML = ''
		list.classList.toggle('empty-state', res.missing.length === 0)

		if (res.missing.length === 0) {
			list.textContent = browserApi.i18n.getMessage('allFoldersExist')
			$('btnCreateMissing').disabled = true
		} else {
			res.missing.forEach(p => {
				const div = document.createElement('div')
				div.className = 'folder-item pending'
				div.textContent = p
				list.appendChild(div)
			})
			$('btnCreateMissing').disabled = false
			$('btnCreateMissing').textContent = browserApi.i18n.getMessage('createFolders', [res.missing.length])
		}
		setStatus('statusFolders', 'Done', 'success')
		btn.disabled = false
	}

	const btnCreateMissing = $('btnCreateMissing')
	if (btnCreateMissing) btnCreateMissing.onclick = () => runCreate(state.missing, 'statusFolders', btnCreateMissing)

	// Discovery
	$('btnInfer').onclick = () => {
		const rules = RuleEngine.parse($('pasteInput').value)
		const root = RuleEngine.inferRoot(rules)
		if (root) {
			$('targetRoot').value = root
			setStatus('statusDiscovery', browserApi.i18n.getMessage('rootInferred', [root]), 'success')
		} else {
			setStatus('statusDiscovery', browserApi.i18n.getMessage('rootNotFound'), 'warning')
		}
	}

	$('formDiscovery').onsubmit = async e => {
		e.preventDefault()
		setStatus('statusDiscovery', 'Scanning...', 'progress')
		const emails = await browserApi.runtime.sendMessage({
			action: 'scanMessages',
			folderId: $('scanSource').value,
			limit: state.config.scanLimit // Use Config
		})

		const existingEmails = new Set(RuleEngine.parse($('pasteInput').value).flatMap(r => r.emails))
		const root = $('targetRoot').value.replace(/\/$/, '')

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
		$('genRulesOut').value = selected.map(i => RuleEngine.generateBlock(base, i.email, i.path, typeMask)).join('\n')
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