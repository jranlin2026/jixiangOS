import { failure, type ApiResponse } from '../api/response';
import { CustomerWriteConflictError } from './customerBusinessRecordRepository';

export function customerWriteConflictResponse<T>(error: unknown): ApiResponse<T | null> | null {
  return error instanceof CustomerWriteConflictError
    ? failure<T>(error.message, 409)
    : null;
}
