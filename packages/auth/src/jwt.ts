import { SignJWT, jwtVerify } from "jose";
import { env } from "@travel/config";
import { AuthenticationError } from "@travel/types";

const accessSecret = new TextEncoder().encode(env.JWT_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

export interface AccessTokenPayload {
  sub: string; // user id
  tenantId: string; // the user's own tenant - see packages/http/tenant-context.ts for how this is checked against the request's resolved tenant
  email: string;
  roles: string[];
  permissions: string[];
}

export interface RefreshTokenPayload {
  sub: string;
  tokenFamily: string; // groups a login's chain of rotated tokens; reuse of a revoked one revokes the family
  jti?: string; // this token's id = refresh_tokens.id (set on sign, standard JWT claim)
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

export async function signRefreshToken(payload: Omit<RefreshTokenPayload, "jti">, jti: string): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_TTL)
    .sign(refreshSecret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, accessSecret);
    return payload as unknown as AccessTokenPayload;
  } catch {
    throw new AuthenticationError("Invalid or expired access token");
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, refreshSecret);
    return payload as unknown as RefreshTokenPayload;
  } catch {
    throw new AuthenticationError("Invalid or expired refresh token");
  }
}
