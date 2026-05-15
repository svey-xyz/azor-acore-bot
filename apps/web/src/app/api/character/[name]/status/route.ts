import { azorApi } from '@/lib/azorApi'
import { handle } from '@/lib/respond'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ name: string }> }

/** `GET /api/character/:name/status` → `{ online, level }`. */
export async function GET(_req: Request, ctx: RouteContext): Promise<Response> {
	const { name } = await ctx.params
	return handle(() => azorApi().characterStatus(name))
}
