/**
 * Data Transformation Utilities
 * Pure functions for common data operations
 */

/**
 * Create a Set from array
 * @param {Array} arr - Source array
 * @returns {Set} New Set
 */
export const toSet = arr => new Set(arr)

/**
 * Create a Map from array of [key, value] pairs
 * @param {Array<[*, *]>} pairs - Array of pairs
 * @returns {Map} New Map
 */
export const toMap = pairs => new Map(pairs)

/**
 * Convert Set to Array
 * @param {Set} set - Source Set
 * @returns {Array} Array from Set
 */
export const fromSet = set => Array.from(set)

/**
 * Convert Map to object
 * @param {Map} map - Source Map
 * @returns {Object} Object from Map
 */
export const mapToObject = map => Object.fromEntries(map)

/**
 * Get unique values from array
 * @param {Array} arr - Source array
 * @returns {Array} Array with unique values
 */
export const unique = arr => [...new Set(arr)]

/**
 * Group array by key function
 * @param {Function} keyFn - Function to extract key
 * @param {Array} arr - Array to group
 * @returns {Map} Map of grouped items
 */
export const groupBy = (keyFn, arr) => {
	const groups = new Map()
	arr.forEach(item => {
		const key = keyFn(item)
		if (!groups.has(key)) {
			groups.set(key, [])
		}
		groups.get(key).push(item)
	})
	return groups
}

/**
 * Sort array by comparator
 * @param {Function} compareFn - Comparison function
 * @param {Array} arr - Array to sort
 * @returns {Array} New sorted array
 */
export const sortBy = (compareFn, arr) => [...arr].sort(compareFn)

/**
 * Sort array by property
 * @param {string|Function} keyOrFn - Property name or key function
 * @param {Array} arr - Array to sort
 * @returns {Array} New sorted array
 */
export const sortByKey = (keyOrFn, arr) => {
	const keyFn = typeof keyOrFn === 'function' 
		? keyOrFn 
		: item => item[keyOrFn]
	
	return [...arr].sort((a, b) => {
		const aKey = keyFn(a)
		const bKey = keyFn(b)
		if (aKey < bKey) return -1
		if (aKey > bKey) return 1
		return 0
	})
}

/**
 * Reverse array
 * @param {Array} arr - Array to reverse
 * @returns {Array} New reversed array
 */
export const reverse = arr => [...arr].reverse()

/**
 * Flatten array one level
 * @param {Array} arr - Array to flatten
 * @returns {Array} Flattened array
 */
export const flatten = arr => arr.flat()

/**
 * Deep flatten array
 * @param {Array} arr - Array to flatten
 * @returns {Array} Deeply flattened array
 */
export const flattenDeep = arr => arr.flat(Infinity)

/**
 * Chunk array into groups
 * @param {number} size - Chunk size
 * @param {Array} arr - Array to chunk
 * @returns {Array<Array>} Array of chunks
 */
export const chunk = (size, arr) => {
	const chunks = []
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size))
	}
	return chunks
}

/**
 * Partition array by predicate
 * @param {Function} predicate - Partitioning predicate
 * @param {Array} arr - Array to partition
 * @returns {[Array, Array]} [matching, notMatching]
 */
export const partition = (predicate, arr) => {
	const matching = []
	const notMatching = []
	arr.forEach(item => {
		if (predicate(item)) {
			matching.push(item)
		} else {
			notMatching.push(item)
		}
	})
	return [matching, notMatching]
}

/**
 * Count items matching predicate
 * @param {Function} predicate - Counting predicate
 * @param {Array} arr - Array to count
 * @returns {number} Count
 */
export const count = (predicate, arr) =>
	arr.reduce((acc, item) => acc + (predicate(item) ? 1 : 0), 0)

/**
 * Sum array of numbers
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} Sum
 */
export const sum = arr => arr.reduce((acc, n) => acc + n, 0)

/**
 * Get minimum value
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} Minimum value
 */
export const min = arr => Math.min(...arr)

/**
 * Get maximum value
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} Maximum value
 */
export const max = arr => Math.max(...arr)

/**
 * Calculate average
 * @param {Array<number>} arr - Array of numbers
 * @returns {number} Average
 */
export const average = arr => arr.length ? sum(arr) / arr.length : 0

/**
 * Zip arrays together
 * @param {...Array} arrays - Arrays to zip
 * @returns {Array<Array>} Zipped arrays
 */
export const zip = (...arrays) => {
	const minLength = Math.min(...arrays.map(arr => arr.length))
	return Array.from({ length: minLength }, (_, i) =>
		arrays.map(arr => arr[i])
	)
}

/**
 * Merge objects (shallow)
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export const merge = (...objects) => Object.assign({}, ...objects)

/**
 * Deep clone object/array
 * @param {*} value - Value to clone
 * @returns {*} Cloned value
 */
export const deepClone = value => {
	if (value === null || typeof value !== 'object') return value
	if (value instanceof Date) return new Date(value)
	if (value instanceof RegExp) return new RegExp(value)
	if (Array.isArray(value)) return value.map(deepClone)
	return Object.keys(value).reduce((acc, key) => {
		acc[key] = deepClone(value[key])
		return acc
	}, {})
}

/**
 * Check deep equality
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if deeply equal
 */
export const deepEqual = (a, b) => {
	if (a === b) return true
	if (a == null || b == null) return false
	if (typeof a !== 'object' || typeof b !== 'object') return false
	
	const keysA = Object.keys(a)
	const keysB = Object.keys(b)
	
	if (keysA.length !== keysB.length) return false
	
	return keysA.every(key => deepEqual(a[key], b[key]))
}

/**
 * Range generator
 * @param {number} start - Start value
 * @param {number} end - End value (exclusive)
 * @param {number} step - Step value (default: 1)
 * @returns {Array<number>} Range array
 */
export const range = (start, end, step = 1) => {
	const arr = []
	for (let i = start; i < end; i += step) {
		arr.push(i)
	}
	return arr
}

/**
 * Repeat value n times
 * @param {number} n - Number of repetitions
 * @param {*} value - Value to repeat
 * @returns {Array} Array of repeated values
 */
export const repeat = (n, value) => Array.from({ length: n }, () => value)

/**
 * Times function - execute function n times
 * @param {number} n - Number of times
 * @param {Function} fn - Function to execute
 * @returns {Array} Array of results
 */
export const times = (n, fn) => Array.from({ length: n }, (_, i) => fn(i))