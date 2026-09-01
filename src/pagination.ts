export const parsePageQuery = (query: Record<string, string | undefined>) => {
    const page = Math.max(1, Number(query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
    return { page, pageSize, offset: (page - 1) * pageSize }
}
