/**
 * DOM Utility Functions
 * Pure functions for DOM manipulation and querying
 */

/**
 * Get element by ID
 * @param {string} id - Element ID
 * @returns {HTMLElement|null}
 */
export const getElementById = (id) => document.getElementById(id)

/**
 * Query selector wrapper
 * @param {string} selector - CSS selector
 * @param {HTMLElement|Document} context - Context element (default: document)
 * @returns {HTMLElement|null}
 */
export const query = (selector, context = document) => context.querySelector(selector)

/**
 * Query all selector wrapper
 * @param {string} selector - CSS selector
 * @param {HTMLElement|Document} context - Context element (default: document)
 * @returns {NodeList}
 */
export const queryAll = (selector, context = document) => context.querySelectorAll(selector)

/**
 * Set status message in a container
 * @param {string} elementId - Container element ID
 * @param {string} message - Status message
 * @param {string} statusType - Status type (info|success|error|warning|progress)
 * @returns {void}
 */
export const setStatus = (elementId, message, statusType = 'info') => {
	const element = getElementById(elementId)
	if (element) {
		element.innerHTML = `<div class="status ${statusType}">${message}</div>`
	}
}

/**
 * Update stat display value
 * @param {string} elementId - Stat element ID
 * @param {string|number} value - Value to display
 * @returns {void}
 */
export const updateStat = (elementId, value) => {
	const element = getElementById(elementId)
	if (element) {
		element.textContent = String(value)
	}
}

/**
 * Set text content for element
 * @param {string} elementId - Element ID
 * @param {string} text - Text content
 * @returns {void}
 */
export const setText = (elementId, text) => {
	const element = getElementById(elementId)
	if (element) {
		element.textContent = text
	}
}

/**
 * Set HTML content for element
 * @param {string} elementId - Element ID
 * @param {string} html - HTML content
 * @returns {void}
 */
export const setHTML = (elementId, html) => {
	const element = getElementById(elementId)
	if (element) {
		element.innerHTML = html
	}
}

/**
 * Toggle class on element
 * @param {string} elementId - Element ID
 * @param {string} className - Class name to toggle
 * @param {boolean} force - Force add/remove (optional)
 * @returns {void}
 */
export const toggleClass = (elementId, className, force) => {
	const element = getElementById(elementId)
	if (element) {
		element.classList.toggle(className, force)
	}
}

/**
 * Add class to element
 * @param {string} elementId - Element ID
 * @param {string} className - Class name to add
 * @returns {void}
 */
export const addClass = (elementId, className) => {
	const element = getElementById(elementId)
	if (element) {
		element.classList.add(className)
	}
}

/**
 * Remove class from element
 * @param {string} elementId - Element ID
 * @param {string} className - Class name to remove
 * @returns {void}
 */
export const removeClass = (elementId, className) => {
	const element = getElementById(elementId)
	if (element) {
		element.classList.remove(className)
	}
}

/**
 * Set element disabled state
 * @param {string} elementId - Element ID
 * @param {boolean} disabled - Disabled state
 * @returns {void}
 */
export const setDisabled = (elementId, disabled) => {
	const element = getElementById(elementId)
	if (element) {
		element.disabled = disabled
	}
}

/**
 * Get element value
 * @param {string} elementId - Element ID
 * @returns {string|null}
 */
export const getValue = (elementId) => {
	const element = getElementById(elementId)
	return element ? element.value : null
}

/**
 * Set element value
 * @param {string} elementId - Element ID
 * @param {string} value - Value to set
 * @returns {void}
 */
export const setValue = (elementId, value) => {
	const element = getElementById(elementId)
	if (element) {
		element.value = value
	}
}

/**
 * Get checkbox checked state
 * @param {string} elementId - Checkbox element ID
 * @returns {boolean}
 */
export const isChecked = (elementId) => {
	const element = getElementById(elementId)
	return element ? element.checked : false
}

/**
 * Set checkbox checked state
 * @param {string} elementId - Checkbox element ID
 * @param {boolean} checked - Checked state
 * @returns {void}
 */
export const setChecked = (elementId, checked) => {
	const element = getElementById(elementId)
	if (element) {
		element.checked = checked
	}
}

/**
 * Create element with attributes
 * @param {string} tagName - HTML tag name
 * @param {Object} attributes - Attributes object
 * @param {string|HTMLElement|HTMLElement[]} children - Child content
 * @returns {HTMLElement}
 */
export const createElement = (tagName, attributes = {}, children = null) => {
	const element = document.createElement(tagName)
	
	Object.entries(attributes).forEach(([key, value]) => {
		if (key === 'className') {
			element.className = value
		} else if (key === 'textContent') {
			element.textContent = value
		} else if (key === 'innerHTML') {
			element.innerHTML = value
		} else {
			element.setAttribute(key, value)
		}
	})
	
	if (children) {
		if (typeof children === 'string') {
			element.textContent = children
		} else if (Array.isArray(children)) {
			children.forEach(child => {
				if (child instanceof HTMLElement) {
					element.appendChild(child)
				}
			})
		} else if (children instanceof HTMLElement) {
			element.appendChild(children)
		}
	}
	
	return element
}

/**
 * Clear element children
 * @param {string|HTMLElement} elementOrId - Element or element ID
 * @returns {void}
 */
export const clearChildren = (elementOrId) => {
	const element = typeof elementOrId === 'string' 
		? getElementById(elementOrId)
		: elementOrId
	
	if (element) {
		element.innerHTML = ''
	}
}

/**
 * Scroll element into view
 * @param {string} elementId - Element ID
 * @param {Object} options - Scroll options
 * @returns {void}
 */
export const scrollIntoView = (elementId, options = { behavior: 'smooth' }) => {
	const element = getElementById(elementId)
	if (element) {
		element.scrollIntoView(options)
	}
}