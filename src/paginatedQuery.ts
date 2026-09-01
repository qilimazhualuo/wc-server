import { count, type SQL } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { parsePageQuery } from './pagination'
import { toPageResult } from './response'
import type { DatabaseInstance } from './pageExtrasService'

export type PaginatedQueryOptions<TRow, TTable> = {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: TTable
    query: Record<string, string | undefined>
    whereClause?: SQL
    mapRow?: (row: TRow) => unknown
    orderBy?: SQL | SQL[]
}

export const fetchPaginatedList = async <TRow, TTable>({
    db,
    isMysqlDriver,
    table,
    query,
    whereClause,
    mapRow,
    orderBy,
}: PaginatedQueryOptions<TRow, TTable>) => {
    const { page, pageSize, offset } = parsePageQuery(query)
    const orderClauses = orderBy
        ? (Array.isArray(orderBy) ? orderBy : [orderBy])
        : []

    if (isMysqlDriver()) {
        const mysqlDb = db as MySql2Database
        const listQuery = mysqlDb.select().from(table as never)
        const countQuery = mysqlDb.select({ total: count() }).from(table as never)
        const filteredListQuery = whereClause ? listQuery.where(whereClause) : listQuery
        const filteredCountQuery = whereClause ? countQuery.where(whereClause) : countQuery
        const orderedListQuery = orderClauses.length
            ? filteredListQuery.orderBy(...orderClauses)
            : filteredListQuery
        const rows = await orderedListQuery.limit(pageSize).offset(offset)
        const totalRows = await filteredCountQuery
        const total = Number((totalRows[0] as { total?: number } | undefined)?.total ?? 0)
        const list = mapRow
            ? (rows as TRow[]).map((rowItem) => mapRow(rowItem))
            : rows
        return toPageResult(list, total, page, pageSize)
    }

    const pgDb = db as PostgresJsDatabase
    const listQuery = pgDb.select().from(table as never)
    const countQuery = pgDb.select({ total: count() }).from(table as never)
    const filteredListQuery = whereClause ? listQuery.where(whereClause) : listQuery
    const filteredCountQuery = whereClause ? countQuery.where(whereClause) : countQuery
    const orderedListQuery = orderClauses.length
        ? filteredListQuery.orderBy(...orderClauses)
        : filteredListQuery
    const rows = await orderedListQuery.limit(pageSize).offset(offset)
    const totalRows = await filteredCountQuery
    const total = Number((totalRows[0] as { total?: number } | undefined)?.total ?? 0)
    const list = mapRow
        ? (rows as TRow[]).map((rowItem) => mapRow(rowItem))
        : rows
    return toPageResult(list, total, page, pageSize)
}
