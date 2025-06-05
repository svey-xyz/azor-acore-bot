export const assertValue = <T>(v: T | undefined, errorMessage: string): T => {
	if (v === undefined) {
		// throw new Error(errorMessage) // Always throws error
		console.error(errorMessage)
	}

	return v as T
}