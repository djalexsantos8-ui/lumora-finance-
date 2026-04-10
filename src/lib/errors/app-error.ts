export class AppError extends Error {
  code: string
  status?: number

  constructor(code: string, status?: number) {
    super(code)
    this.code = code
    this.status = status
    this.name = 'AppError'
  }
}
