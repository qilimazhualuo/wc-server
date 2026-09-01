export const buildTree = <T extends { id: number; parentId: number | null }>(
    items: T[],
    parentId: number | null = null,
): Array<T & { children: Array<T & { children: unknown[] }> }> => {
    return items
        .filter((item) => (item.parentId ?? null) === parentId)
        .sort((leftItem, rightItem) => {
            const leftSort = 'sort' in leftItem ? Number((leftItem as { sort?: number }).sort) : 0
            const rightSort = 'sort' in rightItem ? Number((rightItem as { sort?: number }).sort) : 0
            return leftSort - rightSort
        })
        .map((item) => ({
            ...item,
            children: buildTree(items, item.id),
        }))
}
