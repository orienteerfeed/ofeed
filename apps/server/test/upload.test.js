import { parseXmlForTesting } from '../src/modules/upload/uploadRoutes.js';
import { expect } from 'chai';

const { parseXml, checkXmlType } = parseXmlForTesting;

describe('parseXml', () => {
  it('should parse xml', async () => {
    const req = { file: { buffer: Buffer.from('<xml>test</xml>') } };

    const callback = (err, result) => {
      expect(err).to.be.null;
      expect(result).to.deep.equal({ xml: 'test' });
    };

    await parseXml(req, callback);
  });

  it('should handle errors', async () => {
    const req = { file: { buffer: Buffer.from('<xml>test') } };

    const callback = (err, result) => {
      expect(err).to.be.an('error');
      expect(result).to.be.undefined;
    };

    await parseXml(req, callback);
  });
});

describe('checkXmlType', () => {
  it('should return an array of objects when given a valid json object', () => {
    const json = {
      ResultList: [],
      StartList: [],
      CourseData: [],
    };

    const expected = [
      { isArray: true, jsonKey: 'ResultList', jsonValue: ['ResultList', []] },
      { isArray: true, jsonKey: 'StartList', jsonValue: ['StartList', []] },
      { isArray: true, jsonKey: 'CourseData', jsonValue: ['CourseData', []] },
    ];

    expect(checkXmlType(json)).to.deep.equal(expected);
  });

  it('should return an empty array when given an invalid json object', () => {
    const json = {};

    expect(checkXmlType(json)).to.deep.equal([]);
  });
});
