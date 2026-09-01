import { Elysia } from 'elysia'
import { deleteRowById, insertRow, selectAllRows, updateRowById } from './dbOperations'
import type { CrudResourceOptions, CrudRouteContext } from './crudTypes'
import { buildWhereClause } from './filters'
import { fetchPaginatedList } from './paginatedQuery'
import { fail, success } from './response'
import { buildTree } from './tree'

const readRouteContext = (context: Record<string, unknown>, auth: unknown): CrudRouteContext => ({
    request: context.request as Request,
    db: context.db as CrudRouteContext['db'],
    set: context.set as CrudRouteContext['set'],
    params: context.params as Record<string, string>,
    query: context.query as Record<string, string>,
    body: (context.body || {}) as Record<string, unknown>,
    auth,
})

const runAuth = async (
    options: Pick<CrudResourceOptions<unknown, unknown>, 'requireAuth'>,
    context: Record<string, unknown>,
) => {
    const authResult = await options.requireAuth({
        request: context.request as Request,
        db: context.db as CrudRouteContext['db'],
        set: context.set as CrudRouteContext['set'],
    })
    if (authResult && typeof authResult === 'object' && 'code' in authResult) {
        return { blocked: true, response: authResult }
    }
    return { blocked: false, auth: authResult }
}

export const createCrudResource = <TRow, TCreateBody, TUpdateBody = TCreateBody>(
    options: CrudResourceOptions<TRow, TCreateBody, TUpdateBody>,
) => {
    const basePath = `${options.routePrefix}${options.path}`
    let app = new Elysia({ name: `wc-crud-${options.name}` })

    if (options.list) {
        const listPath = options.list.mode === 'tree' ? `${basePath}/tree` : basePath
        app = app.get(listPath, async (context) => {
            const authState = await runAuth(options, context)
            if (authState.blocked) {
                return authState.response
            }

            const routeContext = readRouteContext(context, authState.auth)
            if (options.list?.handler) {
                return options.list.handler(routeContext)
            }

            if (!options.list) {
                return fail('500', '列表配置缺失')
            }

            const listOptions = options.list
            const table = options.table()
            if (listOptions.mode === 'paginated') {
                const whereClause = listOptions.filterDefs?.length
                    ? buildWhereClause(routeContext.query, listOptions.filterDefs)
                    : undefined
                const pageResult = await fetchPaginatedList<TRow, unknown>({
                    db: routeContext.db,
                    isMysqlDriver: options.isMysqlDriver,
                    table,
                    query: routeContext.query,
                    whereClause,
                    orderBy: listOptions.orderBy,
                    mapRow: listOptions.mapRow,
                })
                return success(pageResult)
            }

            const rows = await selectAllRows<TRow>({
                db: routeContext.db,
                isMysqlDriver: options.isMysqlDriver,
                table,
            })
            const mappedRows = listOptions.mapRow
                ? rows.map((rowItem) => listOptions.mapRow?.(rowItem))
                : rows

            if (listOptions.mode === 'tree') {
                return success(buildTree(mappedRows as Array<{ id: number; parentId: number | null }>))
            }

            return success(mappedRows)
        })
    }

    if (options.create) {
        app = app.post(
            basePath,
            async (context) => {
                const authState = await runAuth(options, context)
                if (authState.blocked) {
                    return authState.response
                }

                const routeContext = readRouteContext(context, authState.auth)
                const table = options.table()
                const idColumn = options.idColumn(table)

                try {
                    const values = await options.create!.mapBody(routeContext.body as TCreateBody)
                    const createdId = await insertRow({
                        db: routeContext.db,
                        isMysqlDriver: options.isMysqlDriver,
                        table,
                        values,
                    })

                    if (options.create?.afterCreate && createdId) {
                        await options.create.afterCreate(routeContext, createdId)
                    }

                    return success({ id: createdId })
                } catch (error) {
                    if (options.create?.onCreateError) {
                        return options.create.onCreateError(error, routeContext)
                    }
                    throw error
                }
            },
            { body: options.create.body },
        )
    }

    if (options.update) {
        app = app.put(
            `${basePath}/:id`,
            async (context) => {
                const authState = await runAuth(options, context)
                if (authState.blocked) {
                    return authState.response
                }

                const routeContext = readRouteContext(context, authState.auth)
                const recordId = Number(routeContext.params.id)
                if (!Number.isFinite(recordId)) {
                    return fail('400', '无效的记录 ID')
                }

                const table = options.table()
                const idColumn = options.idColumn(table)
                const values = await options.update!.mapBody(routeContext.body as TUpdateBody, recordId)
                await updateRowById({
                    db: routeContext.db,
                    isMysqlDriver: options.isMysqlDriver,
                    table,
                    idColumn,
                    recordId,
                    values,
                })
                return success(true)
            },
            { body: options.update.body },
        )
    }

    if (options.delete !== false) {
        const deleteOptions = options.delete
        app = app.delete(`${basePath}/:id`, async (context) => {
            const authState = await runAuth(options, context)
            if (authState.blocked) {
                return authState.response
            }

            const routeContext = readRouteContext(context, authState.auth)
            if (deleteOptions?.handler) {
                return deleteOptions.handler(routeContext)
            }

            const recordId = Number(routeContext.params.id)
            if (!Number.isFinite(recordId)) {
                return fail('400', '无效的记录 ID')
            }

            if (deleteOptions?.beforeDelete) {
                const beforeResult = await deleteOptions.beforeDelete(routeContext)
                if (beforeResult) {
                    return beforeResult
                }
            }

            const table = options.table()
            const idColumn = options.idColumn(table)
            await deleteRowById({
                db: routeContext.db,
                isMysqlDriver: options.isMysqlDriver,
                table,
                idColumn,
                recordId,
            })

            if (deleteOptions?.afterDelete) {
                await deleteOptions.afterDelete(routeContext)
            }

            return success(true)
        })
    }

    if (options.extend) {
        app = options.extend(app)
    }

    return app
}

export const createCrudRoutes = (
    sharedOptions: Pick<CrudResourceOptions<unknown, unknown>, 'routePrefix' | 'requireAuth' | 'isMysqlDriver'>,
    resources: Array<CrudResourceOptions<unknown, unknown, unknown>>,
) => resources.reduce(
    (app, resourceOptions) => app.use(createCrudResource({
        ...resourceOptions,
        routePrefix: sharedOptions.routePrefix,
        requireAuth: sharedOptions.requireAuth,
        isMysqlDriver: sharedOptions.isMysqlDriver,
    })),
    new Elysia({ name: 'wc-server-crud' }),
)
