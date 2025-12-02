/**
 * Functional Programming Utilities
 * Pure functional helpers for composition, currying, and data transformation
 */

/**
 * Identity function - returns its argument
 * @param {*} x - Any value
 * @returns {*} The same value
 */
export const identity = x => x

/**
 * Compose functions right-to-left
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 * @example compose(f, g, h)(x) === f(g(h(x)))
 */
export const compose = (...fns) => x =>
	fns.reduceRight((acc, fn) => fn(acc), x)

/**
 * Pipe functions left-to-right
 * @param {...Function} fns - Functions to pipe
 * @returns {Function} Piped function
 * @example pipe(f, g, h)(x) === h(g(f(x)))
 */
export const pipe = (...fns) => x =>
	fns.reduce((acc, fn) => fn(acc), x)

/**
 * Curry a function
 * @param {Function} fn - Function to curry
 * @param {number} arity - Number of arguments (default: fn.length)
 * @returns {Function} Curried function
 */
export const curry = (fn, arity = fn.length) => {
	return function curried(...args) {
		if (args.length >= arity) {
			return fn(...args)
		}
		return (...moreArgs) => curried(...args, ...moreArgs)
	}
}

/**
 * Partial application
 * @param {Function} fn - Function to partially apply
 * @param {...*} args - Arguments to pre-apply
 * @returns {Function} Partially applied function
 */
export const partial = (fn, ...args) =>
	(...moreArgs) => fn(...args, ...moreArgs)

/**
 * Map over array
 * @param {Function} fn - Mapping function
 * @param {Array} arr - Array to map
 * @returns {Array} Mapped array
 */
export const map = curry((fn, arr) => arr.map(fn))

/**
 * Filter array
 * @param {Function} predicate - Filtering predicate
 * @param {Array} arr - Array to filter
 * @returns {Array} Filtered array
 */
export const filter = curry((predicate, arr) => arr.filter(predicate))

/**
 * Reduce array
 * @param {Function} fn - Reducer function
 * @param {*} initial - Initial value
 * @param {Array} arr - Array to reduce
 * @returns {*} Reduced value
 */
export const reduce = curry((fn, initial, arr) => arr.reduce(fn, initial))

/**
 * Find element in array
 * @param {Function} predicate - Finding predicate
 * @param {Array} arr - Array to search
 * @returns {*} Found element or undefined
 */
export const find = curry((predicate, arr) => arr.find(predicate))

/**
 * Check if all elements match predicate
 * @param {Function} predicate - Testing predicate
 * @param {Array} arr - Array to test
 * @returns {boolean}
 */
export const every = curry((predicate, arr) => arr.every(predicate))

/**
 * Check if any element matches predicate
 * @param {Function} predicate - Testing predicate
 * @param {Array} arr - Array to test
 * @returns {boolean}
 */
export const some = curry((predicate, arr) => arr.some(predicate))

/**
 * Pick properties from object
 * @param {Array<string>} keys - Keys to pick
 * @param {Object} obj - Source object
 * @returns {Object} New object with picked keys
 */
export const pick = curry((keys, obj) =>
	keys.reduce((acc, key) => {
		if (obj.hasOwnProperty(key)) {
			acc[key] = obj[key]
		}
		return acc
	}, {})
)

/**
 * Omit properties from object
 * @param {Array<string>} keys - Keys to omit
 * @param {Object} obj - Source object
 * @returns {Object} New object without omitted keys
 */
export const omit = curry((keys, obj) => {
	const omitSet = new Set(keys)
	return Object.keys(obj).reduce((acc, key) => {
		if (!omitSet.has(key)) {
			acc[key] = obj[key]
		}
		return acc
	}, {})
})

/**
 * Get property from object
 * @param {string} key - Property key
 * @param {Object} obj - Source object
 * @returns {*} Property value
 */
export const prop = curry((key, obj) => obj?.[key])

/**
 * Get nested property path from object
 * @param {string} path - Dot-separated path (e.g., 'a.b.c')
 * @param {Object} obj - Source object
 * @returns {*} Property value
 */
export const path = curry((pathStr, obj) =>
	pathStr.split('.').reduce((acc, key) => acc?.[key], obj)
)

/**
 * Negate a predicate function
 * @param {Function} predicate - Predicate to negate
 * @returns {Function} Negated predicate
 */
export const not = predicate => (...args) => !predicate(...args)

/**
 * Memoize a function
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
 * Debounce a function
 * @param {number} delay - Delay in milliseconds
 * @param {Function} fn - Function to debounce
 * @returns {Function} Debounced function
 */
export const debounce = curry((delay, fn) => {
	let timeoutId
	return (...args) => {
		clearTimeout(timeoutId)
		timeoutId = setTimeout(() => fn(...args), delay)
	}
})

/**
 * Throttle a function
 * @param {number} delay - Delay in milliseconds
 * @param {Function} fn - Function to throttle
 * @returns {Function} Throttled function
 */
export const throttle = curry((delay, fn) => {
	let lastCall = 0
	return (...args) => {
		const now = Date.now()
		if (now - lastCall >= delay) {
			lastCall = now
			return fn(...args)
		}
	}
})

/**
 * Try-catch wrapper that returns [error, result]
 * @param {Function} fn - Function to try
 * @returns {Function} Wrapped function returning [error, result]
 */
export const tryCatch = (fn) => (...args) => {
	try {
		return [null, fn(...args)]
	} catch (error) {
		return [error, null]
	}
}

/**
 * Async try-catch wrapper
 * @param {Function} fn - Async function to try
 * @returns {Function} Wrapped async function returning [error, result]
 */
export const tryCatchAsync = (fn) => async (...args) => {
	try {
		return [null, await fn(...args)]
	} catch (error) {
		return [error, null]
	}
}

/**
 * Tap function - execute side effect and return original value
 * @param {Function} fn - Side effect function
 * @param {*} x - Value to tap
 * @returns {*} Original value
 */
export const tap = curry((fn, x) => {
	fn(x)
	return x
})

/**
 * Default value if null/undefined
 * @param {*} defaultValue - Default value
 * @param {*} value - Value to check
 * @returns {*} Value or default
 */
export const defaultTo = curry((defaultValue, value) =>
	value == null ? defaultValue : value
)

/**
 * Check if value is null or undefined
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export const isNil = value => value == null

/**
 * Check if value is not null or undefined
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export const isNotNil = value => value != null