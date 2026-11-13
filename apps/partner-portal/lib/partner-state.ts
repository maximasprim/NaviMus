"use client";

import { useEffect, useState } from "react";
import { getMyApprovedOperator } from "./api";
import { ApiError } from "./api-client";
import { getToken, isLoggedIn } from "./session";

/**
 * Where this signed-in person stands as a partner. Every partner page except the dashboard needs an APPROVED
 * operator account (the API refuses otherwise), so the menu and pages follow this state instead of showing
 * links that can only fail.
 *
 *  approved     full portal
 *  pending      application under review
 *  blocked      application rejected, or the account is suspended
 *  unregistered signed in but hasn't registered a business yet
 *  unknown      couldn't tell (network error etc.): behave as before - show everything; the API still decides
 */
export type PartnerState = "approved" | "pending" | "blocked" | "unregistered" | "unknown";

export interface PartnerInfo {
  state: PartnerState;
  /** The API's own explanation for a non-approved account, e.g. "Your operator account is pending and ...". */
  message: string | null;
}

const FRESH_MS = 30_000;
let memo: { at: number; value: PartnerInfo } | null = null;
let inflight: Promise<PartnerInfo> | null = null;

async function fetchState(): Promise<PartnerInfo> {
  try {
    await getMyApprovedOperator(getToken()!);
    return { state: "approved", message: null };
  } catch (err) {
    if (err instanceof ApiError && err.code === "NOT_FOUND") return { state: "unregistered", message: null };
    if (err instanceof ApiError && err.code === "CONFLICT") {
      const fromDetails = (err.details as { operatorStatus?: string } | undefined)?.operatorStatus;
      const status = fromDetails ?? /is (pending|rejected|suspended)\b/.exec(err.message)?.[1];
      if (status === "pending") return { state: "pending", message: err.message };
      if (status === "rejected" || status === "suspended") return { state: "blocked", message: err.message };
    }
    return { state: "unknown", message: null };
  }
}

/** One shared request for the sidebar, the route guard and anything else on the page. */
function loadState(): Promise<PartnerInfo> {
  if (memo && Date.now() - memo.at < FRESH_MS) return Promise.resolve(memo.value);
  if (inflight) return inflight;
  inflight = fetchState()
    .then((value) => {
      memo = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function usePartnerState(): { info: PartnerInfo; ready: boolean } {
  const [info, setInfo] = useState<PartnerInfo>({ state: "unknown", message: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn()) {
      setReady(true);
      return;
    }
    loadState().then((v) => {
      if (cancelled) return;
      setInfo(v);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { info, ready };
}

/** Pages a not-yet-approved partner may still open (everything else needs an approved account). */
export const OPEN_TO_ANY_PARTNER = ["/", "/login", "/register"];
