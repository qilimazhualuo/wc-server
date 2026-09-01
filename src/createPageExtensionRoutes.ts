import { Elysia, t } from 'elysia'
import type { FilePageConfigStore } from './pageConfigStore'
import type { DatabaseInstance, PageExtrasService } from './pageExtrasService'
import { fail, success } from './response'

export type PageExtensionAuthContext = {
    request: Request
    db: DatabaseInstance
    set: {
        status?: number | string
    }
}

export type PageExtensionRouteOptions = {
    routePrefix?: string
    configStore: FilePageConfigStore
    extrasService: PageExtrasService
    requireAuth: (context: PageExtensionAuthContext) => Promise<unknown>
}

const parseRecordIds = (rawIds?: string) => {
    if (!rawIds?.trim()) {
        return []
    }
    return rawIds
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
}

export const createPageExtensionRoutes = (options: PageExtensionRouteOptions) => {
    const routePrefix = options.routePrefix ?? '/api/system'

    type RouteContext = {
        request: Request
        db: DatabaseInstance
        set: PageExtensionAuthContext['set']
        params: Record<string, string>
        query: Record<string, string>
        body: Record<string, unknown>
    }

    const readContext = (context: Record<string, unknown>) => context as RouteContext

    return new Elysia({ name: 'wc-server-page-extensions' })
        .get(`${routePrefix}/page-schemas/:pageKey`, async (context) => {
            const { request, db, set, params } = readContext(context)
            const auth = await options.requireAuth({ request, db, set })
            if (auth && typeof auth === 'object' && 'code' in auth) {
                return auth
            }

            const pageSchema = options.extrasService.getPageExtraFields(options.configStore, params.pageKey)
            return success({
                pageKey: params.pageKey,
                fields: pageSchema.fields,
                fieldOrder: pageSchema.fieldOrder,
                coreFieldOverrides: pageSchema.coreFieldOverrides,
            })
        })
        .put(
            `${routePrefix}/page-schemas/:pageKey`,
            async (context) => {
                const { request, db, set, params, body } = readContext(context)
                const auth = await options.requireAuth({ request, db, set })
                if (auth && typeof auth === 'object' && 'code' in auth) {
                    return auth
                }

                if (!Array.isArray(body.fields)) {
                    return fail('400', 'fields 必须是数组')
                }

                options.extrasService.savePageExtraFields(
                    options.configStore,
                    params.pageKey,
                    body.fields,
                    Array.isArray(body.fieldOrder) ? body.fieldOrder.map((value) => String(value)) : [],
                    Array.isArray(body.coreFieldOverrides) ? body.coreFieldOverrides : [],
                )
                return success(true)
            },
            {
                body: t.Object({
                    fields: t.Array(t.Any()),
                    fieldOrder: t.Optional(t.Array(t.String())),
                    coreFieldOverrides: t.Optional(t.Array(t.Any())),
                }),
            },
        )
        .get(`${routePrefix}/page-extras/:pageKey`, async (context) => {
            const { request, db, set, params, query } = readContext(context)
            const auth = await options.requireAuth({ request, db, set })
            if (auth && typeof auth === 'object' && 'code' in auth) {
                return auth
            }

            const recordIds = parseRecordIds(query.ids)
            const extrasMap = await options.extrasService.getRecordExtrasMap(db, params.pageKey, recordIds)
            return success(extrasMap)
        })
        .put(
            `${routePrefix}/page-extras/:pageKey/:recordId`,
            async (context) => {
                const { request, db, set, params, body } = readContext(context)
                const auth = await options.requireAuth({ request, db, set })
                if (auth && typeof auth === 'object' && 'code' in auth) {
                    return auth
                }

                const recordId = Number(params.recordId)
                if (!Number.isFinite(recordId) || recordId <= 0) {
                    return fail('400', '无效的记录 ID')
                }

                await options.extrasService.saveRecordExtras(
                    db,
                    params.pageKey,
                    recordId,
                    (body.extras || {}) as Record<string, unknown>,
                )
                return success(true)
            },
            {
                body: t.Object({
                    extras: t.Record(t.String(), t.Any()),
                }),
            },
        )
        .delete(`${routePrefix}/page-extras/:pageKey`, async (context) => {
            const { request, db, set, params, query } = readContext(context)
            const auth = await options.requireAuth({ request, db, set })
            if (auth && typeof auth === 'object' && 'code' in auth) {
                return auth
            }

            const recordIds = parseRecordIds(query.ids)
            await options.extrasService.deleteRecordExtras(db, params.pageKey, recordIds)
            return success(true)
        })
}
