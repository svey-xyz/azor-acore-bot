import { azorApi } from '@/lib/azorApi'
import { handle } from '@/lib/respond'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** `GET /api/realm/population` → `{ online }`. */
export function GET(): Promise<Response> {
	return handle(() => azorApi().realmPopulation())
}
