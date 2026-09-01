import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export type PageConfigRecord = Record<string, unknown>

export type PageConfigPayload = {
    pageKey: string
    extraFields: PageConfigRecord[]
    fieldOrder: string[]
    coreFieldOverrides: PageConfigRecord[]
}

export type FilePageConfigStoreOptions = {
    configRootDir: string
    knownPageKeys?: string[]
}

const defaultPageConfig = (pageKey: string): PageConfigPayload => ({
    pageKey,
    extraFields: [],
    fieldOrder: [],
    coreFieldOverrides: [],
})

const parseJsonArray = (rawValue: unknown): PageConfigRecord[] => {
    if (!rawValue) {
        return []
    }
    if (Array.isArray(rawValue)) {
        return rawValue as PageConfigRecord[]
    }
    if (typeof rawValue === 'string') {
        try {
            const parsed = JSON.parse(rawValue)
            return Array.isArray(parsed) ? parsed as PageConfigRecord[] : []
        } catch {
            return []
        }
    }
    return []
}

const parseJsonStringArray = (rawValue: unknown): string[] => {
    if (!rawValue) {
        return []
    }
    if (Array.isArray(rawValue)) {
        return rawValue.map((value) => String(value))
    }
    if (typeof rawValue === 'string') {
        try {
            const parsed = JSON.parse(rawValue)
            return Array.isArray(parsed) ? parsed.map((value) => String(value)) : []
        } catch {
            return []
        }
    }
    return []
}

const normalizePageConfig = (pageKey: string, rawConfig: Record<string, unknown>): PageConfigPayload => ({
    pageKey,
    extraFields: parseJsonArray(rawConfig.extraFields ?? rawConfig.fields),
    fieldOrder: parseJsonStringArray(rawConfig.fieldOrder),
    coreFieldOverrides: parseJsonArray(rawConfig.coreFieldOverrides),
})

export type FilePageConfigStore = ReturnType<typeof createFilePageConfigStore>

export const createFilePageConfigStore = (options: FilePageConfigStoreOptions) => {
    const configRootDir = resolve(options.configRootDir)
    const knownPageKeys = options.knownPageKeys ?? []

    const pageConfigFilePath = (pageKey: string) => resolve(configRootDir, pageKey, 'config.json')

    const savePageConfig = (
        pageKey: string,
        config: Partial<PageConfigPayload> & { fields?: PageConfigRecord[] },
    ): PageConfigPayload => {
        const configFilePath = pageConfigFilePath(pageKey)
        mkdirSync(dirname(configFilePath), { recursive: true })
        const payload = normalizePageConfig(pageKey, {
            pageKey,
            extraFields: config.extraFields ?? config.fields ?? [],
            fieldOrder: config.fieldOrder ?? [],
            coreFieldOverrides: config.coreFieldOverrides ?? [],
        })
        writeFileSync(configFilePath, `${JSON.stringify(payload, null, 4)}\n`, 'utf-8')
        return payload
    }

    const loadPageConfig = (pageKey: string): PageConfigPayload => {
        const configFilePath = pageConfigFilePath(pageKey)
        if (!existsSync(configFilePath)) {
            return savePageConfig(pageKey, defaultPageConfig(pageKey))
        }
        const rawConfig = JSON.parse(readFileSync(configFilePath, 'utf-8')) as Record<string, unknown>
        return normalizePageConfig(pageKey, rawConfig)
    }

    const initPageConfigDir = () => {
        mkdirSync(configRootDir, { recursive: true })
        knownPageKeys.forEach((pageKey) => {
            const configFilePath = pageConfigFilePath(pageKey)
            if (!existsSync(configFilePath)) {
                savePageConfig(pageKey, defaultPageConfig(pageKey))
            }
        })
    }

    return {
        initPageConfigDir,
        loadPageConfig,
        savePageConfig,
    }
}
