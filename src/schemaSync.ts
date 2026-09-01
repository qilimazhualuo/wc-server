export type SchemaField = {
    field: string
    columnName?: string
    dbType?: string
    inputType?: string
    required?: boolean
    unique?: boolean
    primaryKey?: boolean
    locked?: boolean
    lockReason?: string
    persist?: boolean
    comment?: string
    title?: string
    defaultValue?: string
    showInTable?: boolean
    searchMode?: string
    [key: string]: unknown
}

export type SchemaSyncContext = {
    isMysql: boolean
    execute: (sqlText: string) => Promise<void>
    queryRows: <TRow extends Record<string, unknown>>(sqlText: string) => Promise<TRow[]>
}

const INPUT_TYPE_TO_PG: Record<string, string> = {
    input: 'varchar(255)',
    textarea: 'text',
    number: 'double precision',
    select: 'varchar(255)',
    radio: 'varchar(255)',
    checkbox: 'varchar(255)',
    date: 'date',
    datetime: 'timestamp',
    switch: 'boolean',
}

const INPUT_TYPE_TO_MYSQL: Record<string, string> = {
    input: 'varchar(255)',
    textarea: 'text',
    number: 'double',
    select: 'varchar(255)',
    radio: 'varchar(255)',
    checkbox: 'varchar(255)',
    date: 'date',
    datetime: 'timestamp',
    switch: 'tinyint(1)',
}

const SAFE_IDENT_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const SAFE_TABLE_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export const camelToSnake = (value: string) => value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase()

export const resolveColumnName = (fieldItem: SchemaField) => {
    const columnName = (fieldItem.columnName || fieldItem.field || '').trim()
    if (!columnName) {
        throw new Error('字段名不能为空')
    }
    if (!SAFE_IDENT_PATTERN.test(columnName)) {
        throw new Error(`非法字段名: ${columnName}`)
    }
    return columnName
}

export const isPersistedField = (fieldItem: SchemaField) => {
    if (fieldItem.persist === false) {
        return false
    }
    if (fieldItem.lockReason === 'virtual') {
        return false
    }
    return true
}

const resolveDbType = (fieldItem: SchemaField, isMysql: boolean) => {
    const dbType = (fieldItem.dbType || '').trim()
    if (dbType && /^[a-zA-Z0-9_(),.\s]+$/.test(dbType)) {
        return dbType
    }
    const inputType = fieldItem.inputType || 'input'
    const typeMap = isMysql ? INPUT_TYPE_TO_MYSQL : INPUT_TYPE_TO_PG
    return typeMap[inputType] || (isMysql ? 'varchar(255)' : 'varchar(255)')
}

const quoteIdent = (ident: string, isMysql: boolean) => {
    if (!SAFE_IDENT_PATTERN.test(ident)) {
        throw new Error(`非法标识符: ${ident}`)
    }
    return isMysql ? `\`${ident}\`` : `"${ident.replace(/"/g, '""')}"`
}

const tableExists = async (context: SchemaSyncContext, tableName: string) => {
    if (context.isMysql) {
        const rows = await context.queryRows<{ tableName: string }>(`
            SELECT TABLE_NAME AS tableName
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = '${tableName}'
        `)
        return rows.length > 0
    }

    const rows = await context.queryRows<{ tableName: string }>(`
        SELECT table_name AS "tableName"
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '${tableName}'
    `)
    return rows.length > 0
}

const fetchExistingColumns = async (context: SchemaSyncContext, tableName: string) => {
    if (context.isMysql) {
        return context.queryRows<{
            columnName: string
            isNullable: string
            isPrimaryKey: number
        }>(`
            SELECT
                cols.COLUMN_NAME AS columnName,
                cols.IS_NULLABLE AS isNullable,
                CASE WHEN keyCols.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS isPrimaryKey
            FROM information_schema.COLUMNS cols
            LEFT JOIN (
                SELECT kcu.COLUMN_NAME
                FROM information_schema.TABLE_CONSTRAINTS tc
                JOIN information_schema.KEY_COLUMN_USAGE kcu
                  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
                 AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                WHERE tc.TABLE_SCHEMA = DATABASE()
                  AND tc.TABLE_NAME = '${tableName}'
                  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
            ) keyCols ON keyCols.COLUMN_NAME = cols.COLUMN_NAME
            WHERE cols.TABLE_SCHEMA = DATABASE()
              AND cols.TABLE_NAME = '${tableName}'
        `)
    }

    return context.queryRows<{
        columnName: string
        isNullable: string
        isPrimaryKey: boolean
    }>(`
        SELECT
            cols.column_name AS "columnName",
            cols.is_nullable AS "isNullable",
            CASE WHEN pk.column_name IS NOT NULL THEN TRUE ELSE FALSE END AS "isPrimaryKey"
        FROM information_schema.columns cols
        LEFT JOIN (
            SELECT key_cols.column_name
            FROM information_schema.table_constraints constraints
            JOIN information_schema.key_column_usage key_cols
              ON constraints.constraint_name = key_cols.constraint_name
             AND constraints.table_schema = key_cols.table_schema
            WHERE constraints.table_schema = 'public'
              AND constraints.table_name = '${tableName}'
              AND constraints.constraint_type = 'PRIMARY KEY'
        ) pk ON pk.column_name = cols.column_name
        WHERE cols.table_schema = 'public'
          AND cols.table_name = '${tableName}'
    `)
}

const buildColumnDefinition = (
    fieldItem: SchemaField,
    context: SchemaSyncContext,
    options: { forCreate: boolean },
) => {
    const columnName = resolveColumnName(fieldItem)
    const columnIdent = quoteIdent(columnName, context.isMysql)
    const dbType = resolveDbType(fieldItem, context.isMysql)
    const parts = [columnIdent, dbType]

    if (fieldItem.lockReason === 'pk' && columnName === 'id' && options.forCreate) {
        if (context.isMysql) {
            parts[1] = 'INT'
            parts.push('NOT NULL AUTO_INCREMENT')
        } else {
            parts[1] = 'SERIAL'
        }
    } else if (fieldItem.required) {
        parts.push('NOT NULL')
    } else if (options.forCreate) {
        parts.push('NULL')
    }

    if (options.forCreate && fieldItem.unique) {
        parts.push('UNIQUE')
    }

    if (options.forCreate && fieldItem.defaultValue) {
        parts.push(`DEFAULT ${fieldItem.defaultValue}`)
    } else if (options.forCreate && columnName === 'created_at') {
        parts.push(context.isMysql ? 'DEFAULT CURRENT_TIMESTAMP' : 'DEFAULT NOW()')
    }

    return parts.join(' ')
}

const createTable = async (
    context: SchemaSyncContext,
    tableName: string,
    fields: SchemaField[],
) => {
    if (!SAFE_TABLE_PATTERN.test(tableName)) {
        throw new Error(`非法表名: ${tableName}`)
    }

    const persistedFields = fields.filter(isPersistedField)
    const tableIdent = quoteIdent(tableName, context.isMysql)
    const primaryKeyColumns = persistedFields
        .filter((fieldItem) => fieldItem.primaryKey || fieldItem.lockReason === 'pk')
        .map((fieldItem) => quoteIdent(resolveColumnName(fieldItem), context.isMysql))

    const columnDefinitions = persistedFields.map((fieldItem) => buildColumnDefinition(fieldItem, context, { forCreate: true }))

    if (!primaryKeyColumns.length) {
        const idField = persistedFields.find((fieldItem) => resolveColumnName(fieldItem) === 'id')
        if (idField) {
            primaryKeyColumns.push(quoteIdent('id', context.isMysql))
        }
    }

    const primaryKeySql = primaryKeyColumns.length
        ? `, PRIMARY KEY (${primaryKeyColumns.join(', ')})`
        : ''

    const createSql = `CREATE TABLE ${tableIdent} (${columnDefinitions.join(', ')}${primaryKeySql})`
    await context.execute(createSql)
}

const addMissingColumns = async (
    context: SchemaSyncContext,
    tableName: string,
    fields: SchemaField[],
    existingColumnNames: Set<string>,
) => {
    const tableIdent = quoteIdent(tableName, context.isMysql)
    const added: string[] = []

    for (const fieldItem of fields.filter(isPersistedField)) {
        const columnName = resolveColumnName(fieldItem)
        if (existingColumnNames.has(columnName)) {
            continue
        }
        if (fieldItem.lockReason === 'pk' && columnName === 'id') {
            continue
        }

        const columnDefinition = buildColumnDefinition(fieldItem, context, { forCreate: true })
        await context.execute(`ALTER TABLE ${tableIdent} ADD COLUMN ${columnDefinition}`)
        added.push(columnName)
    }

    return added
}

export const syncTableSchema = async (
    context: SchemaSyncContext,
    tableName: string,
    fields: SchemaField[],
) => {
    if (!SAFE_TABLE_PATTERN.test(tableName)) {
        throw new Error(`非法表名: ${tableName}`)
    }

    const persistedFields = fields.filter(isPersistedField)
    if (!persistedFields.length) {
        return { tableName, created: false, added: [] as string[] }
    }

    const exists = await tableExists(context, tableName)
    if (!exists) {
        await createTable(context, tableName, fields)
        console.log(`[schema] 已创建表: ${tableName}`)
        return { tableName, created: true, added: persistedFields.map((fieldItem) => resolveColumnName(fieldItem)) }
    }

    const existingColumns = await fetchExistingColumns(context, tableName)
    const existingColumnNames = new Set(existingColumns.map((columnItem) => String(columnItem.columnName)))
    const added = await addMissingColumns(context, tableName, fields, existingColumnNames)

    if (added.length) {
        console.log(`[schema] 表 ${tableName} 新增字段: ${added.join(', ')}`)
    }

    return { tableName, created: false, added }
}
