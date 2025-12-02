/**
 * Functional Utilities
 * Practical helpers for common patterns - no overengineering
 */

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Try-catch wrapper returning [error, result] tuple
 * @param {Function} fn - Function to execute
 * @returns {Function} Wrapped function
 * @example
 * const [err, data] = tryCatch(() => JSON.parse(str))()
 */
export const tryCatch = (fn) => (...args) => {
	try {
		return [null, fn(...args)]
	} catch (error) {
		return [error, null]
	}
}

/**
 * Async try-catch wrapper returning [error, result] tuple
 * @param {Function} fn - Async function to execute
 * @returns {Function} Wrapped async function
 * @example
 * const [err, data] = await tryCatchAsync(fetchData)(url)
 */
export const tryCatchAsync = (fn) => async (...args) => {
	try {
		return [null, await fn(...args)]
	} catch (error) {
		return [error, null]
	}
}

// ============================================================================
// Performance
// ============================================================================

/**
 * Memoize a function (cache results by arguments)
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized function
 */
export const memoize = (fn) => {
	const cache = new Map()
	return (...args) => {
		const key = JSON.stringify(args)
		if (cache.has(key)) {
			return cache.get(key)
		}
		const result = fn(...args)
		cache.set(key, result)
		return result
	}
}

/**
 * Debounce a function (delay execution until calls stop)
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (fn, delay) => {
	let timeoutId
	return (...args) => {
		clearTimeout(timeoutId)
		timeoutId = setTimeout(() => fn(...args), delay)
	}
}

/**
 * Throttle a function (limit execution frequency)
 * @param {Function} fn - Function to throttle
 * @param {number} delay - Minimum delay between calls
 * @returns {Function} Throttled function
 */
export const throttle = (fn, delay) => {
	let lastCall = 0
	return (...args) => {
		const now = Date.now()
		if (now - lastCall >= delay) {
			lastCall = now
			return fn(...args)
		}
	}
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * No-op function
 */
export const noop = () => {}

/**
 * Identity function (returns argument)
 * @param {*} x - Value to return
 * @returns {*} Same value
 */
export const identity = x => x

/**
 * Always returns the same value
 * @param {*} value - Value to always return
 * @returns {Function} Function that returns value
 */
export const constant = (value) => () => value

/**
 * Negate a predicate
 * @param {Function} predicate - Predicate function
 * @returns {Function} Negated predicate
 */
export const not = (predicate) => (...args) => !predicate(...args)

/**
 * Execute side effect and return original value
 * Useful for debugging pipelines
 * @param {Function} fn - Side effect function
 * @returns {Function} Function that executes fn and returns input
 * @example
 * const result = pipe(
 *   getData,
 *   tap(console.log), // logs but doesn't change data
 *   transform
 * )(input)
 */
export const tap = (fn) => (x) => {
	fn(x)
	return x
}

/**
 * Compose functions right-to-left
 * Only include if actually used in codebase
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 * @example compose(f, g, h)(x) === f(g(h(x)))
 */
export const compose = (...fns) => (x) =>
	fns.reduceRight((acc, fn) => fn(acc), x)

/**
 * Pipe functions left-to-right (more readable than compose)
 * @param {...Function} fns - Functions to pipe
 * @returns {Function} Piped function
 * @example pipe(f, g, h)(x) === h(g(f(x)))
 */
export const pipe = (...fns) => (x) =>
	fns.reduce((acc, fn) => fn(acc), x)

/**
 * Return default value if input is null/undefined
 * @param {*} defaultValue - Default value
 * @param {*} value - Value to check
 * @returns {*} Value or default
 */
export const defaultTo = (defaultValue, value) =>
	value == null ? defaultValue : value

/**
 * Check if value is null or undefined
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export const isNil = (value) => value == null

/**
 * Check if value is not null or undefined
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export const isNotNil = (value) => value != null

/**
 * Safe property access with default
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-separated path
 * @param {*} defaultValue - Default if path doesn't exist
 * @returns {*} Value or default
 * @example
 * getPath(user, 'address.city', 'Unknown')
 */
export const getPath = (obj, path, defaultValue = undefined) => {
	const value = path.split('.').reduce((acc, key) => acc?.[key], obj)
	return value !== undefined ? value : defaultValue
}

/**
 * Once wrapper - execute function only once
 * @param {Function} fn - Function to execute once
 * @returns {Function} Wrapped function
 */
export const once = (fn) => {
	let called = false
	let result
	return (...args) => {
		if (!called) {
			called = true
			result = fn(...args)
		}
		return result
	}
}