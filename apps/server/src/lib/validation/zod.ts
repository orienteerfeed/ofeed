import type { z } from "@hono/zod-openapi";

export type ValidationIssue = {
  msg: string;
  param: string;
  location: "all";
};

function toIssueList(input: z.ZodIssue[] | z.ZodError): z.ZodIssue[] {
  return Array.isArray(input) ? input : input.issues;
}

export function toValidationIssues(input: z.ZodIssue[] | z.ZodError): ValidationIssue[] {
  return toIssueList(input).map(issue => ({
    msg: issue.message,
    param: issue.path.length > 0 ? issue.path.join(".") : "body",
    location: "all",
  }));
}

export function toValidationMessage(input: z.ZodIssue[] | z.ZodError) {
  return toValidationIssues(input)
    .map(issue => `${issue.msg}: ${issue.param}`)
    .join(", ");
}

