import { generateSecret, generateURI, verify } from 'otplib';

/** Thin wrapper around otplib's v13 functional API for TOTP-based MFA. */
export const mfa = {
  generateSecret: (): string => generateSecret(),

  otpauthUrl: (email: string, issuer: string, secret: string): string =>
    generateURI({ issuer, label: email, secret }),

  check: async (code: string, secret: string): Promise<boolean> => {
    const result = await verify({ secret, token: code });
    return result.valid;
  },
};
