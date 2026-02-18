export function jsonContent<T>(schema: T, description = "") {
  return {
    content: {
      "application/json": {
        schema,
      },
    },
    description,
  } as const;
}

export function jsonContentRequired<T>(schema: T, description = "") {
  return {
    content: {
      "application/json": {
        schema,
      },
    },
    description,
    required: true,
  } as const;
}

export function emptyContent(description = "") {
  return {
    content: {},
    description,
  } as const;
}
