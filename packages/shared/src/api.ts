import { z } from "zod";

export const paginationSchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const apiErrorSchema = z.object({
  message: z.string(),
  error: z.boolean(),
  code: z.number(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    message: z.string(),
    error: z.literal(false),
    code: z.number(),
    results: data,
  });

export type ApiSuccess<T> = {
  message: string;
  error: false;
  code: number;
  results: T;
};
