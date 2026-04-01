import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseXmlForTesting } from '../upload.handlers.js';

const { checkXmlType, parseXml } = parseXmlForTesting;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('upload.handlers testing helpers', () => {
  it('parseXml parses valid XML payload', async () => {
    const parsed = await parseXml(Buffer.from('<xml>test</xml>'));

    expect(parsed).toEqual({ xml: 'test' });
  });

  it('parseXml throws for invalid XML payload', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(parseXml(Buffer.from('<xml>test'))).rejects.toThrow('Error parsing file');

    expect(consoleErrorSpy).toHaveBeenCalledOnce();
  });

  it('checkXmlType returns only supported IOF XML root types', () => {
    const result = checkXmlType({
      ResultList: [{ id: 1 }],
      Unknown: [{ id: 2 }],
      CourseData: [{ id: 3 }],
    });

    expect(result).toEqual([
      { isArray: true, jsonKey: 'ResultList', jsonValue: [{ id: 1 }] },
      { isArray: true, jsonKey: 'CourseData', jsonValue: [{ id: 3 }] },
    ]);
  });
});
