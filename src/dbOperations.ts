import { eq } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { DatabaseInstance } from './pageExtrasService'

export const insertRow = async ({
    db,
    isMysqlDriver,
    table,
    values,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: unknown
    values: Record<string, unknown>
}) => {
    if (isMysqlDriver()) {
        const insertResult = await (db as MySql2Database).insert(table as never).values(values)
        return Number((insertResult as unknown as { insertId: number }).insertId)
    }

    const insertResult = await (db as PostgresJsDatabase)
        .insert(table as never)
        .values(values)
        .returning()
    return (insertResult as { id: number }[])[0]?.id
}

export const updateRowById = async ({
    db,
    isMysqlDriver,
    table,
    idColumn,
    recordId,
    values,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: unknown
    idColumn: AnyColumn
    recordId: number
    values: Record<string, unknown>
}) => {
    if (isMysqlDriver()) {
        await (db as MySql2Database)
            .update(table as never)
            .set(values)
            .where(eq(idColumn, recordId))
        return
    }

    await (db as PostgresJsDatabase)
        .update(table as never)
        .set(values)
        .where(eq(idColumn, recordId))
}

export const deleteRowsByColumn = async ({
    db,
    isMysqlDriver,
    table,
    column,
    columnValue,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: unknown
    column: AnyColumn
    columnValue: unknown
}) => {
    if (isMysqlDriver()) {
        await (db as MySql2Database).delete(table as never).where(eq(column, columnValue))
        return
    }

    await (db as PostgresJsDatabase).delete(table as never).where(eq(column, columnValue))
}

export const deleteRowById = async ({
    db,
    isMysqlDriver,
    table,
    idColumn,
    recordId,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: unknown
    idColumn: AnyColumn
    recordId: number
}) => {
    if (isMysqlDriver()) {
        await (db as MySql2Database).delete(table as never).where(eq(idColumn, recordId))
        return
    }

    await (db as PostgresJsDatabase).delete(table as never).where(eq(idColumn, recordId))
}

export const selectAllRows = async <TRow>({
    db,
    isMysqlDriver,
    table,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    table: unknown
}) => {
    if (isMysqlDriver()) {
        return (db as MySql2Database).select().from(table as never) as Promise<TRow[]>
    }

    return (db as PostgresJsDatabase).select().from(table as never) as Promise<TRow[]>
}

export const replaceJoinRows = async ({
    db,
    isMysqlDriver,
    joinTable,
    ownerColumn,
    ownerId,
    relationColumn,
    relationIds,
    mapJoinRow,
}: {
    db: DatabaseInstance
    isMysqlDriver: () => boolean
    joinTable: unknown
    ownerColumn: AnyColumn
    ownerId: number
    relationColumn: AnyColumn
    relationIds: number[]
    mapJoinRow: (relationId: number) => Record<string, unknown>
}) => {
    if (isMysqlDriver()) {
        await (db as MySql2Database).delete(joinTable as never).where(eq(ownerColumn, ownerId))
    } else {
        await (db as PostgresJsDatabase).delete(joinTable as never).where(eq(ownerColumn, ownerId))
    }

    if (!relationIds.length) {
        return
    }

    const joinRows = relationIds.map((relationId) => mapJoinRow(relationId))
    if (isMysqlDriver()) {
        await (db as MySql2Database).insert(joinTable as never).values(joinRows)
        return
    }

    await (db as PostgresJsDatabase).insert(joinTable as never).values(joinRows)
}
