import { and, eq, like, or, type SQL } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'

export type QueryFilterDef = {
    queryKey: string
    kind: 'keyword' | 'like' | 'eq'
    columns?: AnyColumn[]
    column?: AnyColumn
    valueType?: 'number' | 'string'
}

export const buildWhereClause = (
    query: Record<string, string | undefined>,
    filterDefs: QueryFilterDef[],
) => {
    const filterConditions: SQL[] = []

    filterDefs.forEach((filterDef) => {
        if (filterDef.kind === 'keyword') {
            const keyword = query.keyword?.trim()
            if (!keyword || !filterDef.columns?.length) {
                return
            }
            filterConditions.push(or(
                ...filterDef.columns.map((columnItem) => like(columnItem, `%${keyword}%`)),
            ) as SQL)
            return
        }

        if (filterDef.kind === 'like' && filterDef.column) {
            const value = query[filterDef.queryKey]?.trim()
            if (value) {
                filterConditions.push(like(filterDef.column, `%${value}%`))
            }
            return
        }

        if (filterDef.kind === 'eq' && filterDef.column) {
            const rawValue = query[filterDef.queryKey]
            if (rawValue === undefined || rawValue === '') {
                return
            }
            if (filterDef.valueType === 'number') {
                const numericValue = Number(rawValue)
                if (Number.isFinite(numericValue)) {
                    filterConditions.push(eq(filterDef.column, numericValue))
                }
                return
            }
            filterConditions.push(eq(filterDef.column, rawValue))
        }
    })

    return filterConditions.length ? and(...filterConditions) : undefined
}
