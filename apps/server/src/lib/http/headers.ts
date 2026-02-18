export function toLowerCaseHeaderRecord(headers: Headers) {
  const normalized: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

