/**
 * Minimal state store with subscription support.
 * Designed for UI state synchronization without external dependencies.
 */

export const createStore = (initialState = {}) => {
	const state = { ...initialState }
	const listeners = new Set()

	const getState = () => state

	const setState = (updater, meta = {}) => {
		const prev = { ...state }
		const partial = (typeof updater === 'function')
			? updater(state)
			: updater

		if (!partial || partial === state) return
		Object.assign(state, partial)
		listeners.forEach(listener => listener(state, prev, meta))
	}

	const subscribe = (listener) => {
		listeners.add(listener)
		return () => listeners.delete(listener)
	}

	return { getState, setState, subscribe }
}
