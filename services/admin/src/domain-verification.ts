import { resolveTxt } from "node:dns/promises";
import { randomBytes } from "node:crypto";

/** The record a tenant is instructed to publish: `_NaviMus-verify.<domain> TXT NaviMus-verify=<token>`. */
export const VERIFICATION_SUBDOMAIN = "_NaviMus-verify";

export function generateVerificationToken(): string {
  return `NaviMus-verify=${randomBytes(16).toString("hex")}`;
}

/**
 * Looks up the actual TXT record and checks it matches the token this
 * tenant was issued. This is a real DNS lookup (Node's dns/promises),
 * not a stub - it will fail closed (return false) for any DNS error
 * (NXDOMAIN, timeout, no TXT records) rather than throwing, since "we
 * couldn't verify it" and "it's definitely not verified" should look
 * the same to the caller: never verified by default.
 *
 * Proving domain ownership via a DNS TXT record you control is the
 * same mechanism used by Google Search Console, SPF/DKIM setup, ACM
 * certificate validation, etc. - it works because only someone who can
 * edit the domain's DNS zone can make this record appear.
 */
export async function verifyDomainOwnership(domain: string, expectedToken: string): Promise<boolean> {
  try {
    const records = await resolveTxt(`${VERIFICATION_SUBDOMAIN}.${domain}`);
    // resolveTxt returns string[][] - each TXT record can be split into
    // multiple character-strings that concatenate back into one value.
    return records.some((chunks) => chunks.join("") === expectedToken);
  } catch {
    return false;
  }
}
