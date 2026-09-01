import type { TObject } from '@sinclair/typebox'
import type { Elysia } from 'elysia'
import type { SQL } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import type { QueryFilterDef } from './filters'
import type { DatabaseInstance } from './pageExtrasService'

export type CrudAuthContext = {
    request: Request
    db: DatabaseInstance
    set: {
        status?: number | string
    }
}

export type CrudRouteContext = CrudAuthContext & {
    params: Record<string, string>
    query: Record<string, string>
    body: Record<string, unknown>
    auth: unknown
}

export type CrudSharedOptions = {
    routePrefix: string
    requireAuth: (context: CrudAuthContext) => Promise<unknown>
    isMysqlDriver: () => boolean
}

export type CrudListOptions<TRow> = {
    mode: 'paginated' | 'all' | 'tree'
    filterDefs?: QueryFilterDef[]
    orderBy?: SQL | SQL[]
    mapRow?: (row: TRow) => unknown
    handler?: (context: CrudRouteContext) => Promise<unknown>
}

export type CrudWriteOptions<TBody> = {
    body: TObject
    mapBody: (body: TBody, recordId?: number) => Record<string, unknown> | Promise<Record<string, unknown>>
    afterCreate?: (context: CrudRouteContext, createdId: number) => Promise<void>
    onCreateError?: (error: unknown, context: CrudRouteContext) => unknown
}

export type CrudDeleteOptions = {
    handler?: (context: CrudRouteContext) => Promise<unknown>
    beforeDelete?: (context: CrudRouteContext) => Promise<unknown | void>
    afterDelete?: (context: CrudRouteContext) => Promise<void>
}

export type CrudResourceOptions<TRow, TCreateBody, TUpdateBody = TCreateBody> = CrudSharedOptions & {
    name: string
    path: string
    table: () => unknown
    idColumn: (table: unknown) => AnyColumn
    list?: CrudListOptions<TRow>
    create?: CrudWriteOptions<TCreateBody>
    update?: CrudWriteOptions<TUpdateBody>
    delete?: CrudDeleteOptions | false
    extend?: (app: Elysia) => Elysia
}

export type RelationRouteOptions = CrudSharedOptions & {
    name: string
    ownerPath: string
    relationKey: string
    body: TObject
    relationField: string
    getRelationIds: (db: DatabaseInstance, ownerId: number) => Promise<number[]>
    replaceRelationIds: (db: DatabaseInstance, ownerId: number, relationIds: number[]) => Promise<void>
}
