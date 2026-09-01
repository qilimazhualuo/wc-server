import { count, type SQL } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { MySqlTable } from 'drizzle-orm/mysql-core'
import { parsePageQuery } from './pagination'
import { toPageResult } from './response'
import type { DatabaseInstance } from './pageExtrasService'

type TableLike = PgTable | MySqlTable

export type PaginatedQueryOptions<TRow> = {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: TableLike
    query: Record<string, string | undefined>
    whereClause?: SQL
    mapRow?: (row: TRow) => unknown
    orderBy?: SQL | SQL[]
}

export const fetchPaginatedList = async <TRow>({
    db,
    isMysqlDriver,
    table,
    query,
    whereClause,
    mapRow,
    orderBy,
}: PaginatedQueryOptions<TRow>) => {
    const { page, pageSize, offset } = parsePageQuery(query)

    const listQuery = isMysqlDriver()
        ? (db as MySql2Database).select().from(table)
        : (db as PostgresJsDatabase).select().from(table)

    const countQuery = isMysqlDriver()
        ? (db as MySql2Database).select({ total: count() }).from(table)
        : (db as PostgresJsDatabase).select({ total: count() }).from(table)

    const filteredListQuery = whereClause ? listQuery.where(whereClause) : listQuery
    const filteredCountQuery = whereClause ? countQuery.where(whereClause) : countQuery
    const orderClauses = orderBy
        ? (Array.isArray(orderBy) ? orderBy : [orderBy])
        : []
    const orderedListQuery = orderClauses.length
        ? filteredListQuery.orderBy(...orderClauses)
        : filteredListQuery

    const rows = await orderedListQuery.limit(pageSize).offset(offset)
    const totalRows = await filteredCountQuery
    const total = Number(totalRows[0]?.total ?? 0)
    const list = mapRow
        ? (rows as TRow[]).map((rowItem) => mapRow(rowItem))
        : rows

    return toPageResult(list, total, page, pageSize)
}
