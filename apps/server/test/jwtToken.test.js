import { verifyJwtToken } from '../src/utils/jwtToken.js';
import { expect } from 'chai';
import sinon from 'sinon';
import jwt from 'jsonwebtoken';
import { oauth2Model } from '../src/modules/auth/oauth2Model.js';

describe('verifyJwtToken', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
    next = sinon.spy();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return a 401 status code if no authorization header is present', async () => {
    await verifyJwtToken(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
  });

  it('should return a 401 status code if the token is invalid', async () => {
    req.headers.authorization = 'Bearer invalid';
    sinon.stub(jwt, 'verify').throws(new Error('Invalid token'));

    await verifyJwtToken(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
  });

  it('should set the decoded JWT on the request object and call next if the token is valid', async () => {
    const decoded = { id: 'userId' };
    req.headers.authorization = 'Bearer valid';
    sinon.stub(jwt, 'verify').returns(decoded);
    sinon.stub(oauth2Model, 'getAccessToken').resolves(true);

    await verifyJwtToken(req, res, next);
    expect(req.jwtDecoded).to.deep.equal(decoded);
    expect(next.calledOnce).to.be.true;
  });

  it('should return a 401 status code if the token is valid but clientId token details are missing', async () => {
    const decoded = { clientId: 'clientId' };
    req.headers.authorization = 'Bearer valid';
    sinon.stub(jwt, 'verify').returns(decoded);
    sinon.stub(oauth2Model, 'getAccessToken').resolves(null);

    await verifyJwtToken(req, res, next);
    expect(res.status.calledWith(401)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
  });

  it('should call next if the token is valid and clientId token details are present', async () => {
    const decoded = { clientId: 'clientId' };
    req.headers.authorization = 'Bearer valid';
    sinon.stub(jwt, 'verify').returns(decoded);
    sinon.stub(oauth2Model, 'getAccessToken').resolves(true);

    await verifyJwtToken(req, res, next);
    expect(req.jwtDecoded).to.deep.equal(decoded);
    expect(next.calledOnce).to.be.true;
  });
});
