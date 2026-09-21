import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
  413: 'payload_too_large',
  415: 'unsupported_media_type',
  422: 'unprocessable',
  429: 'too_many_requests',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'error' in body) {
        this.send(res, status, body);
        return;
      }
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: unknown }).message ?? exception.message);
      this.send(res, status, {
        error: { code: STATUS_CODES[status] ?? 'error', message: String(message) },
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        this.send(res, HttpStatus.CONFLICT, {
          error: { code: 'conflict', message: 'already_exists' },
        });
        return;
      }
      if (exception.code === 'P2025') {
        this.send(res, HttpStatus.NOT_FOUND, {
          error: { code: 'not_found', message: 'not_found' },
        });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    this.send(res, HttpStatus.INTERNAL_SERVER_ERROR, {
      error: { code: 'internal_error', message: 'internal_error' },
    });
  }

  private send(res: Response, status: number, body: object): void {
    const details = (body as { error?: { details?: { retryAfterSeconds?: number } } }).error
      ?.details;
    if (status === 429 && details?.retryAfterSeconds) {
      res.setHeader('Retry-After', String(details.retryAfterSeconds));
    }
    res.status(status).json(body);
  }
}
