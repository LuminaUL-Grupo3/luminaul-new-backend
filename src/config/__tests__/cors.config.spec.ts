import { validateEnv } from '../env.validation';
import {
  createHttpCorsOptions,
  getAllowedOrigins,
  isOriginAllowed,
} from '../cors.config';

describe('env.validation and cors.config (Parte A)', () => {
  it('preserves DATABASE_SSL=false, WEB_ORIGIN, FRONTEND_URL, and DOMAIN during env validation', () => {
    const validated = validateEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:secret@postgres:5432/luminaul',
      DATABASE_SSL: 'false',
      JWT_SECRET: 'a-very-strong-production-secret-32chars!',
      WEB_ORIGIN: 'https://luminaul.duckdns.org,http://localhost:5173',
      FRONTEND_URL: 'https://luminaul.duckdns.org',
      DOMAIN: 'luminaul.duckdns.org',
    });

    expect(validated.DATABASE_SSL).toBe('false');
    expect(validated.WEB_ORIGIN).toBe(
      'https://luminaul.duckdns.org,http://localhost:5173',
    );
    expect(validated.FRONTEND_URL).toBe('https://luminaul.duckdns.org');
    expect(validated.DOMAIN).toBe('luminaul.duckdns.org');
  });

  it('parses allowed origins from WEB_ORIGIN, FRONTEND_URL, and DOMAIN and normalizes case/trailing slashes', () => {
    const env: NodeJS.ProcessEnv = {
      WEB_ORIGIN: 'https://LuminaUL.duckdns.org/, http://localhost:5173',
      FRONTEND_URL: 'https://app.luminaul.duckdns.org',
      DOMAIN: 'luminaul.duckdns.org',
    };

    const origins = getAllowedOrigins(env);

    expect(origins).toContain('https://luminaul.duckdns.org');
    expect(origins).toContain('http://localhost:5173');
    expect(origins).toContain('https://app.luminaul.duckdns.org');
    expect(origins).toContain('https://luminaul.duckdns.org:5173');
    expect(origins).toContain('http://luminaul.duckdns.org');
  });

  it('allows whitelisted origins and requests without Origin, but rejects untrusted origins', () => {
    const env: NodeJS.ProcessEnv = {
      WEB_ORIGIN: 'https://luminaul.duckdns.org,http://localhost:5173',
    };

    expect(isOriginAllowed(undefined, env)).toBe(true);
    expect(isOriginAllowed('https://luminaul.duckdns.org', env)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', env)).toBe(true);
    expect(isOriginAllowed('https://evil.example.com', env)).toBe(false);
    expect(isOriginAllowed('http://34.200.10.5', env)).toBe(false);
  });

  it('configures HTTP CORS with credentials=true and validates origin callback', () => {
    const env: NodeJS.ProcessEnv = {
      WEB_ORIGIN: 'https://luminaul.duckdns.org',
    };
    const options = createHttpCorsOptions(env);
    expect(options.credentials).toBe(true);

    const originFn = options.origin as (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => void;

    const allowedResult: Array<[Error | null, boolean | undefined]> = [];
    originFn('https://luminaul.duckdns.org', (err, allow) =>
      allowedResult.push([err, allow]),
    );
    expect(allowedResult).toEqual([[null, true]]);

    const rejectedResult: Array<[Error | null, boolean | undefined]> = [];
    originFn('https://attacker.example', (err, allow) =>
      rejectedResult.push([err, allow]),
    );
    expect(rejectedResult).toEqual([[null, false]]);
  });
});

