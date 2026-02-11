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
