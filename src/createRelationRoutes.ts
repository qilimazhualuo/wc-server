import { Elysia } from 'elysia'
import type { RelationRouteOptions } from './crudTypes'
import type { DatabaseInstance } from './pageExtrasService'
import { success } from './response'

type RelationRouteContext = Record<string, unknown> & {
    db: DatabaseInstance
    params: Record<string, string>
    body: Record<string, unknown>
}

const readRelationContext = (context: Record<string, unknown>) => context as RelationRouteContext

const runAuth = async (
    options: Pick<RelationRouteOptions, 'requireAuth'>,
    context: Record<string, unknown>,
) => {
    const routeContext = readRelationContext(context)
    const authResult = await options.requireAuth({
        request: routeContext.request as Request,
        db: routeContext.db,
        set: routeContext.set as { status?: number | string },
    })
    if (authResult && typeof authResult === 'object' && 'code' in authResult) {
        return { blocked: true, response: authResult }
    }
    return { blocked: false }
}

export const createRelationRoutes = (options: RelationRouteOptions) => {
    const basePath = `${options.routePrefix}${options.ownerPath}`
    const relationPath = `${basePath}/:id/${options.relationKey}`

    return new Elysia({ name: `wc-relation-${options.name}` })
        .get(relationPath, async (context) => {
            const authState = await runAuth(options, context)
            if (authState.blocked) {
                return authState.response
            }

            const ownerId = Number(readRelationContext(context).params.id)
            const relationIds = await options.getRelationIds(readRelationContext(context).db, ownerId)
            return success(relationIds)
        })
        .put(
            relationPath,
            async (context) => {
                const authState = await runAuth(options, context)
                if (authState.blocked) {
                    return authState.response
                }

                const routeContext = readRelationContext(context)
                const ownerId = Number(routeContext.params.id)
                const relationIds = Array.isArray(routeContext.body[options.relationField])
                    ? routeContext.body[options.relationField] as number[]
                    : []

                await options.replaceRelationIds(routeContext.db, ownerId, relationIds)
                return success(true)
            },
            { body: options.body },
        )
}
