import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
	title: 'AZOR API',
	description: 'Browser-facing API for the AZOR platform, backed by mod-azor-api.',
}

/**
 * Root layout. Required by the App Router even though this surface is
 * API-first — there is no real UI yet (see `apps/web/CLAUDE.md`).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	)
}
