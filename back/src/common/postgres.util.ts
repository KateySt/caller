import { QueryFailedError } from 'typeorm';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/** True for a Postgres unique-constraint/unique-index violation from a `save`/`insert`. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string } | undefined)?.code === POSTGRES_UNIQUE_VIOLATION
  );
}
