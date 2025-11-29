// Use 'browser' namespace which is standard for WebExtensions
const browserApi = (typeof browser !== 'undefined') ? browser : messenger;

// Default Preferences
const defaults = {
	mergeCase: true,
	scanLimit: 500,
	defaultRoot: '',
	// Filter Triggers (Default: Manual + New Mail = 17)
	filterManual: true,
	filterNewMail: true,
	filterSending: false,
	filterArchive: false,
	filterPeriodic: false
};

// DOM Elements
const form = document.getElementById('optionsForm');
const status = document.getElementById('toast');

// Restore Options
async function restoreOptions() {
	try {
		const result = await browserApi.storage.sync.get(defaults);
		
		document.getElementById('mergeCase').checked = result.mergeCase;
		document.getElementById('scanLimit').value = result.scanLimit;
		document.getElementById('defaultRoot').value = result.defaultRoot;
		
		// Filter Triggers
		document.getElementById('optManual').checked = result.filterManual;
		document.getElementById('optNewMail').checked = result.filterNewMail;
		document.getElementById('optSending').checked = result.filterSending;
		document.getElementById('optArchive').checked = result.filterArchive;
		document.getElementById('optPeriodic').checked = result.filterPeriodic;

	} catch (e) {
		console.error("Failed to restore options:", e);
	}
}

// Save Options
async function saveOptions(e) {
	e.preventDefault();
	
	const prefs = {
		mergeCase: document.getElementById('mergeCase').checked,
		scanLimit: parseInt(document.getElementById('scanLimit').value, 10),
		defaultRoot: document.getElementById('defaultRoot').value.trim(),
		
		filterManual: document.getElementById('optManual').checked,
		filterNewMail: document.getElementById('optNewMail').checked,
		filterSending: document.getElementById('optSending').checked,
		filterArchive: document.getElementById('optArchive').checked,
		filterPeriodic: document.getElementById('optPeriodic').checked
	};

	try {
		await browserApi.storage.sync.set(prefs);
		
		// Show Feedback
		status.textContent = "Settings Saved";
		status.classList.add('show');
		setTimeout(() => {
			status.classList.remove('show');
		}, 2000);
	} catch (e) {
		console.error(e);
		status.textContent = "Error saving settings";
		status.classList.add('show');
	}
}

document.addEventListener('DOMContentLoaded', restoreOptions);
form.addEventListener('submit', saveOptions);