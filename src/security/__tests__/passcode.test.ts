import { describe, expect, it } from 'vitest';
import { createSecurityConfig, isPasscodeValid, verifyPasscodeAgainstConfig } from '../passcode';

describe('passcode helpers', () => {
  it('validates a 4 digit passcode', () => {
    expect(isPasscodeValid('1234')).toBe(true);
    expect(isPasscodeValid('123')).toBe(false);
    expect(isPasscodeValid('12a4')).toBe(false);
  });

  it('creates and verifies a passcode config', async () => {
    const config = await createSecurityConfig('2580');
    await expect(verifyPasscodeAgainstConfig(config, '2580')).resolves.toBe(true);
    await expect(verifyPasscodeAgainstConfig(config, '0000')).resolves.toBe(false);
  });
});
