/**
 * Path Sanitizer Utilities
 * Centralized path analysis and encoding/decoding
 */

import { REGEX_PATTERNS, PATH_SEPARATOR } from '../config/constants.js'

export const analyzePathIssues = (path, existingPaths = [], options = {}) => {
	const { checkEncoding = true } = options
	const issues = []

	if (/[<>:"|?*\\]/.test(path)) {
		issues.push({
			type: 'windows-forbidden',
			chars: path.match(/[<>:"|?*\\]/g) || []
		})
	}

	if (checkEncoding && path !== encodePath(path)) {
		issues.push({ type: 'needs-encoding', original: path })
	}

	const collisions = existingPaths.filter(existing =>
		existing.toLowerCase() === path.toLowerCase() && existing !== path
	)
	if (collisions.length > 0) {
		issues.push({ type: 'case-collision', matches: collisions })
	}

	return issues
}

export const encodePath = (path) => {
	return path
		.split(PATH_SEPARATOR)
		.map(encodeURIComponent)
		.join(PATH_SEPARATOR)
}

export const decodePath = (uri) => {
	const match = uri.match(REGEX_PATTERNS.URI_TO_PATH)
	return match ? decodeURIComponent(match[1]) : null
}

export const generateWarnings = (issues, path) => {
	return issues.map(issue => {
		switch (issue.type) {
			case 'windows-forbidden':
				return `Path contains forbidden characters: ${issue.chars.join(', ')} (${path})`
			case 'needs-encoding':
				return `Path will be URL-encoded: "${issue.original}"`
			case 'case-collision':
				return `Path differs only by case from existing: ${issue.matches.join(', ')}`
			default:
				return `Path issue detected: ${path}`
		}
	})
}
