/**
 * Options Page
 * Handles user preferences and settings
 */
import { DEFAULT_CONFIG, UI_TIMEOUTS, STORAGE_AREAS } from './config/constants.js'
import { getElementById, setChecked, setValue } from './utils/dom.js'

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
	
	// Filter Triggers
	setChecked('optManual', config.filterManual)
	setChecked('optNewMail', config.filterNewMail)
	setChecked('optSending', config.filterSending)
	setChecked('optArchive', config.filterArchive)
	setChecked('optPeriodic', config.filterPeriodic)
}

/**
 * Restore saved options from storage
 */
async function restoreOptions() {
	try {
		const result = await browserApi.storage.sync.get(DEFAULT_CONFIG)
		applyConfigToUI(result)
	} catch (e) {
		console.error('Failed to restore options:', e)
	}
}

/**
 * Collect preferences from UI
 * @returns {Object} Preferences object
 */
const collectPreferences = () => ({
	mergeCase: getElementById('mergeCase').checked,
	scanLimit: parseInt(getElementById('scanLimit').value, 10),
	defaultRoot: getElementById('defaultRoot').value.trim(),
	
	filterManual: getElementById('optManual').checked,
	filterNewMail: getElementById('optNewMail').checked,
	filterSending: getElementById('optSending').checked,
	filterArchive: getElementById('optArchive').checked,
	filterPeriodic: getElementById('optPeriodic').checked
})

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
		await browserApi.storage.sync.set(prefs)
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
	restoreOptions()
	
	const form = getForm()
	if (form) {
		form.addEventListener('submit', saveOptions)
	}
}

document.addEventListener('DOMContentLoaded', initializeOptions)