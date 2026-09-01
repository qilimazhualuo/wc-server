export const success = <T>(data: T) => ({
    code: '200',
    data,
})

export const fail = (code: string, message: string) => ({
    code,
    data: message,
})

export interface PageResult<T> {
    list: T[]
    total: number
    page: number
    pageSize: number
}

export const toPageResult = <T>(
    list: T[],
    total: number,
    page: number,
    pageSize: number,
): PageResult<T> => ({
    list,
    total,
    page,
    pageSize,
})
