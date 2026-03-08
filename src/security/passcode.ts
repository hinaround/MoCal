export interface SecurityConfig {
  version: 1;
  saltBase64: string;
  hashBase64: string;
  updatedAt: string;
}

const STORAGE_KEY = 'family-trip-ledger:security-config';
const PBKDF2_ITERATIONS = 120000;

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('当前浏览器不支持管理口令，请换到较新的浏览器再试');
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });
  return globalThis.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveHash(passcode: string, saltBase64: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey('raw', encoder.encode(passcode), 'PBKDF2', false, ['deriveBits']);
  const derivedBits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: base64ToBytes(saltBase64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );

  return bytesToBase64(new Uint8Array(derivedBits));
}

function validateConfig(value: unknown): SecurityConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<SecurityConfig>;
  if (candidate.version !== 1) {
    return null;
  }

  if (typeof candidate.saltBase64 !== 'string' || typeof candidate.hashBase64 !== 'string' || typeof candidate.updatedAt !== 'string') {
    return null;
  }

  return {
    version: 1,
    saltBase64: candidate.saltBase64,
    hashBase64: candidate.hashBase64,
    updatedAt: candidate.updatedAt,
  };
}

export function isPasscodeValid(passcode: string): boolean {
  return /^\d{4}$/.test(passcode.trim());
}

export async function createSecurityConfig(passcode: string): Promise<SecurityConfig> {
  if (!isPasscodeValid(passcode)) {
    throw new Error('管理口令必须是 4 位数字');
  }

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = bytesToBase64(salt);
  const hashBase64 = await deriveHash(passcode.trim(), saltBase64);
  return {
    version: 1,
    saltBase64,
    hashBase64,
    updatedAt: new Date().toISOString(),
  };
}

export async function verifyPasscodeAgainstConfig(config: SecurityConfig, passcode: string): Promise<boolean> {
  if (!isPasscodeValid(passcode)) {
    return false;
  }

  const derivedHash = await deriveHash(passcode.trim(), config.saltBase64);
  return derivedHash === config.hashBase64;
}

export function readSecurityConfig(): SecurityConfig | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return validateConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSecurityConfig(config: SecurityConfig): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearSecurityConfig(): void {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
}
