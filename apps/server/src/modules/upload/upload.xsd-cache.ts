const IOF_XML_SCHEMA =
  'https://raw.githubusercontent.com/international-orienteering-federation/datastandard-v3/master/IOF.xsd';

const XSD_TTL_MS = 24 * 60 * 60 * 1000;

let xsdCache: { content: string; fetchedAt: number } | null = null;

export async function getXsdSchema(): Promise<string> {
  const now = Date.now();
  if (xsdCache !== null && now - xsdCache.fetchedAt < XSD_TTL_MS) {
    return xsdCache.content;
  }
  try {
    const response = await fetch(IOF_XML_SCHEMA, {
      method: 'get',
      headers: { 'Content-Type': 'application/xml' },
    });
    const content = await response.text();
    xsdCache = { content, fetchedAt: now };
    return content;
  } catch (err: unknown) {
    if (xsdCache !== null) {
      return xsdCache.content;
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Problem to load IOF XML schema: ', message);
    return '';
  }
}
