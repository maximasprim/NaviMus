"use client";

import { useEffect, useState } from "react";
import {
  getMyApprovedOperator,
  getMyEarnings,
  getMyEarningsTimeSeries,
  listMyBookings,
  listMyPackages,
  type Earning,
  type EarningsPoint,
  type Operator,
  type OperatorBooking,
  type OperatorPackage,
} from "@/lib/api";
import { getToken, isLoggedIn } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import {
  DashboardSkeleton,
  LoggedOutNotice,
  NotApprovedNotice,
  NotRegisteredNotice,
  PartnerDashboard,
} from "@/components/dashboard-view";

type Gate = "loading" | "loggedOut" | "notRegistered" | "notApproved" | "approved";

export default function HomePage() {
  const [gate, setGate] = useState<Gate>("loading");
  const [operator, setOperator] = useState<Operator | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Dashboard widgets. Each loads on its own and degrades to "empty" if its request fails,
  // exactly like the Earnings and Bookings pages do, so one failure never blanks the page.
  const [earnings, setEarnings] = useState<Earning[] | null>(null);
  const [series, setSeries] = useState<EarningsPoint[] | null>(null);
  const [bookings, setBookings] = useState<OperatorBooking[] | null>(null);
  const [packages, setPackages] = useState<OperatorPackage[] | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      setGate("loggedOut");
      return;
    }
    getMyApprovedOperator(getToken()!)
      .then((op) => {
        setOperator(op);
        setGate("approved");
        // Only approved partners load widget data, so unregistered users don't trigger extra 404s.
        getMyEarnings(getToken()!).then(setEarnings).catch(() => setEarnings([]));
        getMyEarningsTimeSeries(getToken()!).then(setSeries).catch(() => setSeries([]));
        listMyBookings(getToken()!).then(setBookings).catch(() => setBookings([]));
        listMyPackages(getToken()!).then(setPackages).catch(() => setPackages([]));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "NOT_FOUND") {
          setGate("notRegistered");
        } else if (err instanceof ApiError && err.code === "CONFLICT") {
          setStatusMessage(err.message);
          setGate("notApproved");
        } else {
          setGate("loggedOut");
        }
      });
  }, []);

  if (gate === "loading") return <DashboardSkeleton />;
  if (gate === "loggedOut") return <LoggedOutNotice />;
  if (gate === "notRegistered") return <NotRegisteredNotice />;
  if (gate === "notApproved") return <NotApprovedNotice message={statusMessage} />;

  return <PartnerDashboard operator={operator} earnings={earnings} series={series} bookings={bookings} packages={packages} />;
}
