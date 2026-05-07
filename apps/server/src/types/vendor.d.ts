declare module 'ejs' {
  export function renderFile(
    path: string,
    data?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<string>;

  const ejs: {
    renderFile: typeof renderFile;
  };

  export default ejs;
}

declare module 'jsonwebtoken' {
  export type JwtPayload = Record<string, unknown> & {
    exp?: number;
    iat?: number;
    iss?: string;
    sub?: string;
    aud?: string | string[];
  };

  export type SignOptions = {
    expiresIn?: string | number;
  };

  export function sign(
    payload: string | Buffer | Record<string, unknown>,
    secretOrPrivateKey: string,
    options?: SignOptions,
  ): string;

  export function verify(token: string, secretOrPublicKey: string): string | JwtPayload;

  const jwt: {
    sign: typeof sign;
    verify: typeof verify;
  };

  export default jwt;
}
