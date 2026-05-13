/**
 * @azor/shared
 *
 * Shared TypeScript types and helpers consumed across the AZOR monorepo.
 *
 * Note on runtime resolution: `main` / `exports` here point at the raw `.ts`
 * source so Bun (Dockerfile + workspace consumers) can resolve it without a
 * build step. ts-node consumers in apps/discord-bot resolve through
 * tsconfig-paths and Node's symlinked node_modules entry. If you ever publish
 * this package or consume it from a runtime that won't transpile TS, run
 * `bun --cwd packages/shared run build` and update `exports` to point at dist/.
 */

export {};
