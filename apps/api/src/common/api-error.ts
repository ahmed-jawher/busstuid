import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Every error response has the shape `{ error: { code, message, details? } }`.
 * `code` is stable and machine-readable; the web app translates it.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message: message ?? code, ...(details ? { details } : {}) } }, status);
  }
}

export const Errors = {
  unauthorized: (code = 'unauthorized') => new ApiError(HttpStatus.UNAUTHORIZED, code),
  forbidden: (code = 'forbidden') => new ApiError(HttpStatus.FORBIDDEN, code),
  notFound: (code = 'not_found') => new ApiError(HttpStatus.NOT_FOUND, code),
  conflict: (code: string) => new ApiError(HttpStatus.CONFLICT, code),
  badRequest: (code: string, details?: Record<string, unknown>) =>
    new ApiError(HttpStatus.BAD_REQUEST, code, undefined, details),
  tooMany: (code: string, retryAfterSeconds: number) =>
    new ApiError(HttpStatus.TOO_MANY_REQUESTS, code, undefined, { retryAfterSeconds }),
};
