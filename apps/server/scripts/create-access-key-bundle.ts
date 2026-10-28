import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const destination = process.argv[2];
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
if (!destination || !isAbsolute(destination)) {
  throw new Error('Provide an absolute destination outside the repository');
}
const resolvedDestination = join(realpathSync(dirname(destination)), basename(destination));
const relativePath = relative(realpathSync(repository), resolvedDestination);
if (!relativePath.startsWith(`..${sep}`)) {
  throw new Error('Provide an absolute destination outside the repository');
}
const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const kid = randomUUID();
const bundle = {
  activeKid: kid,
  privateKey: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
  publicKeys: { [kid]: pair.publicKey.export({ type: 'spki', format: 'pem' }) },
};
writeFileSync(resolvedDestination, JSON.stringify(bundle), { flag: 'wx', mode: 0o600 });
console.info(`Created access signing bundle at ${destination} (kid ${kid})`);
