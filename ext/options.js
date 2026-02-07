/**
 * Options Page
 * Handles user preferences and settings
 */
import { DEFAULT_CONFIG, DEFAULT_FILTER_CONFIG, UI_TIMEOUTS } from './config/constants.js'
import { createElement, getElementById, setChecked, setValue } from './utils/dom.js'
import * as storage from './utils/storage.js'

// Use 'browser' namespace which is standard for WebExtensions
const browserApi = (typeof browser !== 'undefined') ? browser : messenger;

// ============================================================================
// DOM References
// ============================================================================

const getForm = () => getElementById('optionsForm')
const getToast = () => getElementById('toast')

// ============================================================================
// Configuration Operations
// ============================================================================

/**
 * Apply saved configuration to UI
 * @param {Object} config - Saved configuration
 */
const applyConfigToUI = (config) => {
	setChecked('mergeCase', config.mergeCase)
	setValue('scanLimit', config.scanLimit)
	setValue('defaultRoot', config.defaultRoot)

	const folderRootSelect = getElementById('folderRoot')
	const customFolderRoot = getElementById('customFolderRoot')
	if (folderRootSelect && customFolderRoot) {
		const selected = config.folderRoot || ''
		if (selected && selected !== 'Inbox') {
			folderRootSelect.value = 'custom'
			customFolderRoot.value = selected
			customFolderRoot.style.display = 'block'
		} else {
			folderRootSelect.value = selected
			customFolderRoot.value = ''
			customFolderRoot.style.display = 'none'
		}
	}

	const filters = Array.isArray(config.filters) ? config.filters : DEFAULT_FILTER_CONFIG
	filters.forEach(filter => {
		setChecked(filter.label, !!filter.enabled)
	})
}

const renderFilterTriggers = (filters = DEFAULT_FILTER_CONFIG) => {
	const container = getElementById('filterTriggerList')
	if (!container) return
	container.innerHTML = ''

	const labelMap = {
		optPreJunk: 'Getting New Mail (Before Junk)',
		optManual: 'Manually Run',
		optPostJunk: 'Getting New Mail (After Junk)',
		optSending: 'After Sending',
		optArchive: 'Archiving',
		optPeriodic: 'Periodically (10m)'
	}

	filters.forEach(filter => {
		const group = createElement('div', { className: 'checkbox-group' })
		const checkbox = createElement('input', {
			type: 'checkbox',
			id: filter.label
		})
		const label = createElement('label', {
			for: filter.label,
			className: 'inline',
			textContent: labelMap[filter.label] || filter.id
		})
		group.appendChild(checkbox)
		group.appendChild(label)
		container.appendChild(group)
	})
}

/**
 * Restore saved options from storage
 */
async function restoreOptions() {
	try {
		const result = await storage.get(DEFAULT_CONFIG)
		renderFilterTriggers(result.filters)
		applyConfigToUI(result)
	} catch (e) {
		console.error('Failed to restore options:', e)
	}
}

/**
 * Collect preferences from UI
 * @returns {Object} Preferences object
 */
const collectPreferences = () => {
	const folderRootSelect = getElementById('folderRoot')
	const customFolderRoot = getElementById('customFolderRoot')

	const folderRootValue = folderRootSelect?.value === 'custom'
		? (customFolderRoot?.value || '').trim()
		: (folderRootSelect?.value || '').trim()

	return {
		mergeCase: getElementById('mergeCase').checked,
		scanLimit: parseInt(getElementById('scanLimit').value, 10),
		defaultRoot: getElementById('defaultRoot').value.trim(),
		folderRoot: folderRootValue,
		filters: DEFAULT_FILTER_CONFIG.map(filter => ({
			...filter,
			enabled: getElementById(filter.label)?.checked || false
		}))
	}
}

/**
 * Show toast notification
 * @param {HTMLElement} toast - Toast element
 * @param {string} message - Message to display
 * @param {number} duration - Display duration in ms
 */
const showToast = (toast, message, duration = UI_TIMEOUTS.TOAST_DURATION) => {
	toast.textContent = message
	toast.classList.add('show')
	
	setTimeout(() => {
		toast.classList.remove('show')
	}, duration)
}

/**
 * Save options to storage
 * @param {Event} e - Form submit event
 */
async function saveOptions(e) {
	e.preventDefault()
	
	const prefs = collectPreferences()
	const toast = getToast()

	try {
		await storage.set(prefs)
		showToast(toast, 'Settings Saved')
	} catch (e) {
		console.error(e)
		showToast(toast, 'Error saving settings')
	}
}

// ============================================================================
// Event Listeners
// ============================================================================

/**
 * Initialize options page
 */
const initializeOptions = () => {
	const folderRootSelect = getElementById('folderRoot')
	const customFolderRoot = getElementById('customFolderRoot')
	if (folderRootSelect && customFolderRoot) {
		folderRootSelect.addEventListener('change', () => {
			const isCustom = folderRootSelect.value === 'custom'
			customFolderRoot.style.display = isCustom ? 'block' : 'none'
		})
	}

	restoreOptions()
	
	const form = getForm()
	if (form) {
		form.addEventListener('submit', saveOptions)
	}
}

document.addEventListener('DOMContentLoaded', initializeOptions)
