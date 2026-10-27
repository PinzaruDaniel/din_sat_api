import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

export async function createPasswords() {
  const options = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };
  return {
    dummyHash: await argon2.hash(randomBytes(32).toString('hex'), options),
    hash: (password) => argon2.hash(password, options),
    verify: (hash, password) => argon2.verify(hash, password),
  };
}
