/**
 * UI.js - Main Frontend Logic
 */
import { RuleEngine } from './modules/RuleEngine.js'
import { MailClient } from './modules/MailClient.js'

// --- State & DOM ---
const $ = id => document.getElementById(id)
const state = {
	folders: [],       // Current account folder list
	missing: [],       // Analyzed missing paths
	discovered: [],    // Scanned emails {email, path, selected}
	sort: { col: 'email', dir: 1 }
}

// --- Helpers ---
const setStatus = (id, msg, type = 'info') => {
	const el = $(id)
	el.innerHTML = `<div class="status ${type}">${msg}</div>`
}

const updateStat = (id, val) => $(id).textContent = val

// --- Logic ---
async function loadAccount(id) {
	state.folders = (await MailClient.scanAccount(id)).folders
	
	// Stats
	const stats = await MailClient.scanAccount(id) // Get fresh stats
	let statText = `${stats.total} (${stats.leafs})`
	try { statText = messenger.i18n.getMessage('statsFormat', [stats.total, stats.leafs]) } catch (e) {}
	updateStat('statExisting', statText)

	// Populate Scan Source Dropdown
	const sel = $('scanSource')
	sel.innerHTML = ''
	state.folders.forEach(f => {
		const opt = new Option('—'.repeat(f.depth) + ' ' + f.name, f.id)
		if (f.name === 'Inbox') opt.selected = true
		sel.add(opt)
	})
}

function updateRuleStats(text) {
	const rules = RuleEngine.parse(text)
	updateStat('statRules', rules.length)
	$('ruleCountDisplay').textContent = `${rules.length} rules`
	$('btnAnalyze').disabled = !($('account').value && text)
}

function renderDiscovery() {
	const list = $('discoveryList')
	list.innerHTML = ''
	
	// Sort
	state.discovered.sort((a, b) => {
		const va = a[state.sort.col] || '', vb = b[state.sort.col] || ''
		return va.localeCompare(vb) * state.sort.dir
	})

	// Render
	state.discovered.forEach((item, i) => {
		const row = document.createElement('div')
		row.className = `discovery-item ${item.selected ? 'selected' : ''}`
		row.innerHTML = `
			<input type="checkbox" ${item.selected ? 'checked' : ''}>
			<div class="email">${item.email}</div>
			<div class="path">${item.path}</div>`
		
		const toggle = () => {
			item.selected = !item.selected
			renderDiscovery() // Re-render to update classes/buttons
		}
		
		row.querySelector('input').onclick = e => { e.stopPropagation(); toggle() }
		row.onclick = toggle
		list.appendChild(row)
	})

	const selected = state.discovered.filter(i => i.selected)
	$('btnCreateDiscovered').disabled = $('btnGenRules').disabled = selected.length === 0
	$('btnCreateDiscovered').textContent = messenger.i18n.getMessage('btnCreateFoldersOnly', [selected.length])
	$('selectAllDiscovery').checked = state.discovered.length > 0 && state.discovered.every(i => i.selected)
	
	$('discoveryResults').classList.remove('hidden')
}

// --- Actions ---
async function runCreate(paths, statusId, btn) {
	btn.disabled = true
	setStatus(statusId, messenger.i18n.getMessage('creating'), 'progress')
	
	const port = messenger.runtime.connect({ name: 'create-folders' })
	const accountId = $('account').value
	
	return new Promise(resolve => {
		port.onMessage.addListener(msg => {
			if (msg.type === 'progress') {
				setStatus(statusId, `${msg.current}/${msg.total}: ${msg.path}`, 'progress')
			} else if (msg.type === 'complete') {
				setStatus(statusId, messenger.i18n.getMessage('doneStatus', [msg.results.created.length, msg.results.failed.length]), 'success')
				port.disconnect()
				btn.disabled = false
				resolve()
			} else if (msg.type === 'error') {
				setStatus(statusId, msg.error, 'error')
				btn.disabled = false
			}
		})
		port.postMessage({ action: 'create', accountId, folders: paths })
	})
}

// --- Events ---
document.addEventListener('DOMContentLoaded', async () => {
	// I18N
	document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = messenger.i18n.getMessage(el.dataset.i18n))
	
	// Accounts
	const accounts = (await messenger.accounts.list()).filter(a => a.type === 'imap')
	const accSel = $('account')
	accSel.innerHTML = ''
	accounts.forEach(a => accSel.add(new Option(a.name, a.id)))
	if (accounts.length) loadAccount(accounts[0].id)
	
	// Listeners
	accSel.onchange = () => loadAccount(accSel.value)
	
	$('fileInput').onchange = async e => {
		const text = await e.target.files[0].text()
		$('pasteInput').value = text
		updateRuleStats(text)
	}

	$('pasteInput').oninput = e => updateRuleStats(e.target.value)

	// Analyze
	$('formAnalyze').onsubmit = async e => {
		e.preventDefault()
		const btn = $('btnAnalyze')
		btn.disabled = true
		setStatus('statusFolders', messenger.i18n.getMessage('analyzing'), 'progress')

		const res = await messenger.runtime.sendMessage({
			action: 'analyze',
			accountId: $('account').value,
			filterContent: $('pasteInput').value,
			mergeCase: $('mergeCase').checked
		})

		state.missing = res.missing
		updateStat('resLeafs', res.totalLeafs)
		updateStat('resMissing', res.missing.length)
		
		const list = $('missingList')
		list.innerHTML = ''
		list.classList.toggle('empty-state', res.missing.length === 0)
		
		if (res.missing.length === 0) {
			list.textContent = messenger.i18n.getMessage('allFoldersExist')
			$('btnCreateMissing').disabled = true
		} else {
			res.missing.forEach(p => {
				const div = document.createElement('div')
				div.className = 'folder-item pending'
				div.textContent = p
				list.appendChild(div)
			})
			$('btnCreateMissing').disabled = false
			$('btnCreateMissing').textContent = messenger.i18n.getMessage('createFolders', [res.missing.length])
		}
		setStatus('statusFolders', 'Done', 'success')
		btn.disabled = false
	}

	$('btnCreateMissing').onclick = () => runCreate(state.missing, 'statusFolders', $('btnCreateMissing'))

	// Discovery
	$('btnInfer').onclick = () => {
		const rules = RuleEngine.parse($('pasteInput').value)
		const root = RuleEngine.inferRoot(rules)
		if (root) {
			$('targetRoot').value = root
			setStatus('statusDiscovery', messenger.i18n.getMessage('rootInferred', [root]), 'success')
		} else {
			setStatus('statusDiscovery', messenger.i18n.getMessage('rootNotFound'), 'warning')
		}
	}

	$('formDiscovery').onsubmit = async e => {
		e.preventDefault()
		setStatus('statusDiscovery', 'Scanning...', 'progress')
		const emails = await messenger.runtime.sendMessage({
			action: 'scanMessages',
			folderId: $('scanSource').value,
			limit: 500
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

	$('selectAllDiscovery').onchange = e => {
		state.discovered.forEach(i => i.selected = e.target.checked)
		renderDiscovery()
	}

	document.querySelectorAll('.sortable').forEach(el => el.onclick = () => {
		const col = el.dataset.sort
		if (state.sort.col === col) state.sort.dir *= -1
		else { state.sort.col = col; state.sort.dir = 1 }
		renderDiscovery()
	})

	$('btnCreateDiscovered').onclick = () => {
		const paths = state.discovered.filter(i => i.selected).map(i => i.path)
		runCreate(paths, 'statusDiscovery', $('btnCreateDiscovered'))
	}

	$('btnGenRules').onclick = () => {
		const selected = state.discovered.filter(i => i.selected)
		const base = RuleEngine.extractBaseUri($('pasteInput').value)
		$('genRulesOut').value = selected.map(i => RuleEngine.generateBlock(base, i.email, i.path)).join('\n')
		$('genRulesArea').scrollIntoView({ behavior: 'smooth' })
	}

	$('btnDownload').onclick = async () => {
		const combined = ($('pasteInput').value || '') + '\n' + ($('genRulesOut').value || '')
		const url = URL.createObjectURL(new Blob([combined], { type: 'text/plain' }))
		await messenger.downloads.download({ url, filename: 'msgFilterRules.dat', saveAs: true })
	}
})