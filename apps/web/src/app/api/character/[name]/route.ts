import { azorApi } from '@/lib/azorApi'
import { handle } from '@/lib/respond'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Route params are async in the App Router (Next 15+). */
type RouteContext = { params: Promise<{ name: string }> }

/** `GET /api/character/:name` → full character snapshot. */
export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
	const { name } = await ctx.params
	return handle(() => azorApi().characterGet(name))
}
