import { expect } from 'chai';
import sinon from 'sinon';
import { PrismaClient } from '@prisma/client';
import { parseXmlForTesting } from '../src/modules/upload/uploadRoutes.js';

const { upsertCompetitor } = parseXmlForTesting;

const prisma = new PrismaClient();

describe('upsertCompetitor', () => {
  let findFirstStub, createStub, updateStub;

  beforeEach(() => {
    findFirstStub = sinon.stub(prisma.competitor, 'findFirst');
    createStub = sinon.stub(prisma.competitor, 'create');
    updateStub = sinon.stub(prisma.competitor, 'update');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should create a new competitor if not found in the database', async () => {
    findFirstStub.resolves(null);
    createStub.resolves({ id: 1 });

    const result = await upsertCompetitor(
      1,
      1,
      { Name: [{ Given: ['John'], Family: ['Doe'] }] },
      { Name: ['Org'], ShortName: ['OrgShort'] },
    );

    expect(result).to.equal(1);
    expect(createStub.calledOnce).to.be.true;
    expect(updateStub.notCalled).to.be.true;
  });

  it('should update an existing competitor if found in the database and data is different', async () => {
    findFirstStub.resolves({
      id: 1,
      classId: 1,
      firstname: 'John',
      lastname: 'Doe',
      nationality: 'USA',
      registration: 'reg123',
      organisation: 'Org',
      shortName: 'OrgShort',
      card: 123,
      bibNumber: 1,
      startTime: '2021-01-01T00:00:00.000Z',
      finishTime: '2021-01-01T01:00:00.000Z',
      time: 3600,
      status: 'OK',
      team: null,
      leg: null,
    });

    const result = await upsertCompetitor(
      1,
      1,
      { Name: [{ Given: ['John'], Family: ['Doe'] }] },
      { Name: ['Org'], ShortName: ['OrgShort'] },
      null,
      { BibNumber: [2], StartTime: ['2021-01-01T00:00:00.000Z'], Time: [3600] },
    );

    expect(result).to.equal(1);
    expect(updateStub.calledOnce).to.be.true;
    expect(createStub.notCalled).to.be.true;
  });

  it('should not update an existing competitor if found in the database and data is the same', async () => {
    findFirstStub.resolves({
      id: 1,
      classId: 1,
      firstname: 'John',
      lastname: 'Doe',
      nationality: 'USA',
      registration: 'reg123',
      organisation: 'Org',
      shortName: 'OrgShort',
      card: 123,
      bibNumber: 1,
      startTime: '2021-01-01T00:00:00.000Z',
      finishTime: '2021-01-01T01:00:00.000Z',
      time: 3600,
      status: 'OK',
      team: null,
      leg: null,
    });

    const result = await upsertCompetitor(
      1,
      1,
      { Name: [{ Given: ['John'], Family: ['Doe'] }] },
      { Name: ['Org'], ShortName: ['OrgShort'] },
      null,
      { BibNumber: [1], StartTime: ['2021-01-01T00:00:00.000Z'], Time: [3600] },
    );

    expect(result).to.equal(1);
    expect(updateStub.notCalled).to.be.true;
    expect(createStub.notCalled).to.be.true;
  });
});
