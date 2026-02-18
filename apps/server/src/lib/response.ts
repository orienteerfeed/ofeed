import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type {
  ApiResponseEnvelope as SharedApiResponseEnvelope,
  ErrorEnvelope as SharedErrorEnvelope,
  ResponseMeta as SharedResponseMeta,
  SuccessEnvelope as SharedSuccessEnvelope,
} from "@repo/shared";

import type { ProblemDetails } from "./problem";

export type ResponseMeta = SharedResponseMeta;
export type SuccessEnvelope<T> = SharedSuccessEnvelope<T>;
export type ErrorEnvelope = Omit<SharedErrorEnvelope, "error"> & { error: ProblemDetails };
export type ApiResponse<T> = SharedApiResponseEnvelope<T>;

export type LegacySuccessEnvelope<T = unknown> = {
  message: string;
  error: false;
  code: number;
  results: T;
};

export type LegacyErrorEnvelope = {
  message: string;
  error: true;
  code: number;
};

export type LegacyValidationEnvelope = {
  message: "Validation errors";
  error: true;
  code: number;
  errors: unknown;
};

const LEGACY_STATUS_CODES = [200, 201, 400, 401, 403, 404, 413, 422, 500] as const;

function normalizeLegacyStatusCode(statusCode: number, fallback: number) {
  const matched = LEGACY_STATUS_CODES.find(code => code == statusCode);
  return matched ?? fallback;
}

export function legacySuccess<T = unknown>(
  message: string,
  results?: T,
  statusCode: number = 200,
): LegacySuccessEnvelope<T | Record<string, never>> {
  return {
    message,
    error: false,
    code: normalizeLegacyStatusCode(statusCode, 200),
    results: results ?? {},
  };
}

export function legacyError(message: string, statusCode: number = 500): LegacyErrorEnvelope {
  return {
    message,
    error: true,
    code: normalizeLegacyStatusCode(statusCode, 500),
  };
}

export function legacyValidation(
  errors: unknown,
  statusCode: number = 422,
): LegacyValidationEnvelope {
  return {
    message: "Validation errors",
    error: true,
    code: normalizeLegacyStatusCode(statusCode, 422),
    errors,
  };
}

function buildMeta(c: Context): ResponseMeta {
  return {
    requestId: c.get("requestId") || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

export function ok<T>(c: Context, data: T): ReturnType<typeof c.json<SuccessEnvelope<T>, 200>>;
export function ok<T, S extends ContentfulStatusCode>(
  c: Context,
  data: T,
  status: S,
): ReturnType<typeof c.json<SuccessEnvelope<T>, S>>;
export function ok<T, S extends ContentfulStatusCode>(c: Context, data: T, status?: S) {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    error: null,
    meta: buildMeta(c),
  };

  if (typeof status === "number") {
    return c.json(body, status);
  }

  return c.json(body, 200);
}

export function fail<S extends ContentfulStatusCode>(
  c: Context,
  problem: ProblemDetails,
  status: S,
): ReturnType<typeof c.json<ErrorEnvelope, S>> {
  return c.json(
    {
      success: false,
      data: null,
      error: problem,
      meta: buildMeta(c),
    },
    status,
  );
}
