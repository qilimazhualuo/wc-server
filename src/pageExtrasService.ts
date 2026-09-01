import { sql } from 'drizzle-orm'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { FilePageConfigStore } from './pageConfigStore'

export type DatabaseInstance = MySql2Database | PostgresJsDatabase

export type PageExtrasServiceOptions = {
    isMysqlDriver: () => boolean
    tableName?: string
}

type PageFieldRecord = Record<string, unknown>

const parseJsonObject = (rawValue: unknown): Record<string, unknown> => {
    if (!rawValue) {
        return {}
    }
    if (typeof rawValue === 'object' && !Array.isArray(rawValue)) {
        return rawValue as Record<string, unknown>
    }
    if (typeof rawValue === 'string') {
        try {
            const parsed = JSON.parse(rawValue)
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed as Record<string, unknown>
                : {}
        } catch {
            return {}
        }
    }
    return {}
}

export type PageExtrasService = ReturnType<typeof createPageExtrasService>

export const createPageExtrasService = (options: PageExtrasServiceOptions) => {
    const tableName = options.tableName ?? 'system_page_extras'

    const getPageExtraFields = (configStore: FilePageConfigStore, pageKey: string) => {
        const pageConfig = configStore.loadPageConfig(pageKey)
        return {
            tableName: pageConfig.tableName,
            fields: pageConfig.fields,
            fieldOrder: pageConfig.fieldOrder,
            coreFieldOverrides: pageConfig.coreFieldOverrides,
        }
    }

    const savePageExtraFields = (
        configStore: FilePageConfigStore,
        pageKey: string,
        fields: PageFieldRecord[],
        fieldOrder: string[] = [],
        coreFieldOverrides: PageFieldRecord[] = [],
    ) => {
        const pageConfig = configStore.savePageConfig(pageKey, {
            fields,
            fieldOrder,
            coreFieldOverrides,
        })
        return {
            tableName: pageConfig.tableName,
            fields: pageConfig.fields,
            fieldOrder: pageConfig.fieldOrder,
            coreFieldOverrides: pageConfig.coreFieldOverrides,
        }
    }

    const getRecordExtrasMap = async (
        db: DatabaseInstance,
        pageKey: string,
        recordIds: number[],
    ) => {
        const extrasMap: Record<number, Record<string, unknown>> = {}
        if (!recordIds.length) {
            return extrasMap
        }

        const placeholders = sql.join(recordIds.map((recordId) => sql`${recordId}`), sql`, `)

        if (options.isMysqlDriver()) {
            const mysqlDb = db as MySql2Database
            const rows = await mysqlDb.execute(sql`
                SELECT record_id, extras
                FROM ${sql.raw(tableName)}
                WHERE page_key = ${pageKey}
                  AND record_id IN (${placeholders})
            `) as unknown as Array<{ record_id: number; extras: unknown }>
            rows.forEach((rowItem) => {
                extrasMap[Number(rowItem.record_id)] = parseJsonObject(rowItem.extras)
            })
            return extrasMap
        }

        const pgDb = db as PostgresJsDatabase
        const rows = await pgDb.execute(sql`
            SELECT record_id, extras
            FROM ${sql.raw(tableName)}
            WHERE page_key = ${pageKey}
              AND record_id IN (${placeholders})
        `) as unknown as Array<{ record_id: number; extras: unknown }>
        rows.forEach((rowItem) => {
            extrasMap[Number(rowItem.record_id)] = parseJsonObject(rowItem.extras)
        })
        return extrasMap
    }

    const saveRecordExtras = async (
        db: DatabaseInstance,
        pageKey: string,
        recordId: number,
        extras: Record<string, unknown>,
    ) => {
        const serializedExtras = JSON.stringify(extras)
        if (options.isMysqlDriver()) {
            const mysqlDb = db as MySql2Database
            await mysqlDb.execute(sql`
                INSERT INTO ${sql.raw(tableName)} (page_key, record_id, extras, updated_at)
                VALUES (${pageKey}, ${recordId}, ${serializedExtras}, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    extras = VALUES(extras),
                    updated_at = CURRENT_TIMESTAMP
            `)
            return
        }

        const pgDb = db as PostgresJsDatabase
        await pgDb.execute(sql`
            INSERT INTO ${sql.raw(tableName)} (page_key, record_id, extras, updated_at)
            VALUES (${pageKey}, ${recordId}, ${serializedExtras}, NOW())
            ON CONFLICT (page_key, record_id) DO UPDATE SET
                extras = EXCLUDED.extras,
                updated_at = NOW()
        `)
    }

    const deleteRecordExtras = async (
        db: DatabaseInstance,
        pageKey: string,
        recordIds: number[],
    ) => {
        if (!recordIds.length) {
            return
        }
        const placeholders = sql.join(recordIds.map((recordId) => sql`${recordId}`), sql`, `)
        if (options.isMysqlDriver()) {
            const mysqlDb = db as MySql2Database
            await mysqlDb.execute(sql`
                DELETE FROM ${sql.raw(tableName)}
                WHERE page_key = ${pageKey}
                  AND record_id IN (${placeholders})
            `)
            return
        }

        const pgDb = db as PostgresJsDatabase
        await pgDb.execute(sql`
            DELETE FROM ${sql.raw(tableName)}
            WHERE page_key = ${pageKey}
              AND record_id IN (${placeholders})
        `)
    }

    return {
        getPageExtraFields,
        savePageExtraFields,
        getRecordExtrasMap,
        saveRecordExtras,
        deleteRecordExtras,
    }
}
