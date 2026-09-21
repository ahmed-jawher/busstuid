import { applyDecorators, PipeTransform } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import { Errors } from './api-error';

/** Validates and transforms a request part with a zod schema; 400 `validation_failed` on error. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw Errors.badRequest('validation_failed', {
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zod = <S extends z.ZodType>(schema: S) => new ZodPipe(schema);

function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

/** Documents a JSON body in Swagger from the same zod schema used for validation. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: jsonSchema(schema) });

/** Documents query parameters in Swagger from a zod object schema. */
export function ApiZodQuery(schema: z.ZodObject) {
  const props = (jsonSchema(schema).properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((jsonSchema(schema).required as string[] | undefined) ?? []);
  return applyDecorators(
    ...Object.entries(props).map(([name, s]) =>
      ApiQuery({ name, required: required.has(name), schema: s }),
    ),
  );
}
