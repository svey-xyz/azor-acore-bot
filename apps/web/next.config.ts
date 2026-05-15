import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
	// `@azor/shared` ships as TypeScript source (no build step). Next has to
	// transpile it like first-party code rather than treat it as a built dep.
	transpilePackages: ['@azor/shared'],
}

export default nextConfig
