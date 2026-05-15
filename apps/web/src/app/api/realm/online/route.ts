import type { NextRequest } from 'next/server'
import type { RealmOnlineArgs } from '@azor/shared/client'
import { azorApi } from '@/lib/azorApi'
import { handle } from '@/lib/respond'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `GET /api/realm/online?limit=&offset=` → paginated online characters.
 *
 * Both query params are optional; the module clamps `limit`. Non-numeric or
 * negative values are rejected by the shared client and surface as a 500 via
 * `handle` — fine for v1; tighten to a 400 with explicit validation later.
 */
export function GET(req: NextRequest): Promise<Response> {
	const params = req.nextUrl.searchParams
	const limit = params.get('limit')
	const offset = params.get('offset')

	const args: RealmOnlineArgs = {}
	if (limit !== null) args.limit = Number(limit)
	if (offset !== null) args.offset = Number(offset)

	return handle(() => azorApi().realmOnline(args))
}
