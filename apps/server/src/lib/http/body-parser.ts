export type MultipartFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

function normalizeBooleanLikeValue(input: unknown): unknown {
  if (typeof input === "string") {
    if (input === "true") {
      return true;
    }

    if (input === "false") {
      return false;
    }
  }

  return input;
}

async function normalizeFile(file: File): Promise<MultipartFile> {
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    mimetype: file.type,
    originalname: file.name,
    size: file.size,
  };
}

export async function parseMultipartPayload(c: {
  req: { parseBody: (options?: Record<string, unknown>) => Promise<Record<string, unknown>> };
}) {
  const parsed = await c.req.parseBody({ all: true });
  const body: Record<string, unknown> = {};
  let file: MultipartFile | undefined;

  for (const [key, value] of Object.entries(parsed)) {
    if (Array.isArray(value)) {
      const normalized = await Promise.all(
        value.map(async item => {
          if (item instanceof File) {
            const normalizedFile = await normalizeFile(item);

            if (!file) {
              file = normalizedFile;
            }

            return normalizedFile;
          }

          return normalizeBooleanLikeValue(item);
        }),
      );

      body[key] = normalized;
      continue;
    }

    if (value instanceof File) {
      const normalizedFile = await normalizeFile(value);

      if (!file) {
        file = normalizedFile;
      }

      continue;
    }

    body[key] = normalizeBooleanLikeValue(value);
  }

  return { body, file };
}

export async function parseJsonObjectSafe(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  try {
    const payload = await c.req.json();
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

