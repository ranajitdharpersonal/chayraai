
import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

const SESSION_COOKIE_NAME = 'chayra_session';
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ServerSessionResult =
  | {
      ok: true;
      sessionId: string;
      setCookie?: string;
    }
  | {
      ok: false;
      reason: 'SESSION_SECRET_MISSING_OR_INVALID';
    };

function getSessionSecret(): string | null {
  const secret = process.env.CHAYRA_SESSION_SECRET;

  if (
    typeof secret !== 'string' ||
    Buffer.byteLength(secret, 'utf8') < 32
  ) {
    return null;
  }

  return secret;
}

function signPayload(
  payload: string,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
}

function createSessionToken(
  sessionId: string,
  secret: string,
): string {
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    SESSION_TTL_SECONDS;

  const payload = `${sessionId}.${expiresAt}`;
  const signature = signPayload(payload, secret);

  return `${payload}.${signature}`;
}

function verifySessionToken(
  token: string,
  secret: string,
): string | null {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [sessionId, expiryValue, receivedSignature] =
    parts;

  if (
    !UUID_REGEX.test(sessionId) ||
    !/^\d+$/.test(expiryValue) ||
    !receivedSignature
  ) {
    return null;
  }

  const expiresAt = Number(expiryValue);

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  const payload = `${sessionId}.${expiryValue}`;
  const expectedSignature = signPayload(
    payload,
    secret,
  );

  const received = Buffer.from(
    receivedSignature,
    'base64url',
  );

  const expected = Buffer.from(
    expectedSignature,
    'base64url',
  );

  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  return sessionId.toLowerCase();
}

function readSessionCookie(
  request: Request,
): string | null {
  const cookieHeader = request.headers.get('cookie');

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const name = cookie
      .slice(0, separatorIndex)
      .trim();

    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }

    return cookie
      .slice(separatorIndex + 1)
      .trim();
  }

  return null;
}

function createSessionCookie(
  sessionId: string,
  secret: string,
): string {
  const token = createSessionToken(
    sessionId,
    secret,
  );

  const secure =
    process.env.NODE_ENV === 'production'
      ? '; Secure'
      : '';

  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    `Max-Age=${SESSION_TTL_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ') + secure;
}

export function resolveServerSession(
  request: Request,
): ServerSessionResult {
  const secret = getSessionSecret();

  if (!secret) {
    console.error(
      '[Session Security]: CHAYRA_SESSION_SECRET is missing or too short.',
    );

    return {
      ok: false,
      reason: 'SESSION_SECRET_MISSING_OR_INVALID',
    };
  }

  const existingToken = readSessionCookie(request);

  if (existingToken) {
    const existingSessionId = verifySessionToken(
      existingToken,
      secret,
    );

    if (existingSessionId) {
      return {
        ok: true,
        sessionId: existingSessionId,
      };
    }
  }

  const sessionId = randomUUID();

  return {
    ok: true,
    sessionId,
    setCookie: createSessionCookie(
      sessionId,
      secret,
    ),
  };
}
