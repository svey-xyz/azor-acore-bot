import { azorApi } from '@/lib/azorApi'
import { handle } from '@/lib/respond'

// The SOAP transport uses `node:*`-backed `fetch` and admin credentials — keep
// these routes on the Node runtime, never the edge.
export const runtime = 'nodejs'
// Every response reflects live worldserver state; never statically cache it.
export const dynamic = 'force-dynamic'

/** `GET /api/version` → `{ schema, build }`. Cheap module compat probe. */
export function GET(): Promise<Response> {
	return handle(() => azorApi().version())
}
