#!/usr/bin/env node
// Prints fresh values for every secret this platform needs. Nothing is
// written to disk: copy what you need into your (git-ignored) .env or,
// better, your host's secret manager. Run: pnpm secrets:generate
import { randomBytes } from "node:crypto";

const b64 = (n) => randomBytes(n).toString("base64");
const hex = (n) => randomBytes(n).toString("hex");

console.log(`# Generated ${new Date().toISOString()} - treat as secret, do not commit.
JWT_SECRET=${b64(48)}
JWT_REFRESH_SECRET=${b64(48)}
ENCRYPTION_KEY=${hex(32)}
MPESA_CALLBACK_SECRET=${hex(32)}
`);
console.error(`Reminder: rotating ENCRYPTION_KEY? Put the OLD key in ENCRYPTION_KEY_PREVIOUS,
deploy, run the re-encrypt script, then remove ENCRYPTION_KEY_PREVIOUS.
Rotating JWT_* secrets signs every user out (acceptable, and desired after a leak).
Database password, SUPABASE_SERVICE_ROLE_KEY and provider keys can only be rotated
in their own dashboards.`);
