"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getToken } from "@/lib/session";
import { listMyInvoices, type Invoice } from "@/lib/api";

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }
    listMyInvoices(token)
      .then(({ items }) => setInvoices(items))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/dashboard" className="text-sm text-acacia underline">
        ← Back to account
      </Link>
      <h1 className="mt-4 font-display text-3xl text-ink-horizon">Invoices</h1>
      <p className="mt-2 text-sm text-ink/60">
        An invoice appears here once you've made at least one payment toward a booking.
      </p>

      {loading && <p className="mt-8 text-ink/50">Loading…</p>}
      {!loading && invoices.length === 0 && <p className="mt-8 text-ink/50">No invoices yet.</p>}

      <div className="mt-6 divide-y divide-ink-horizon/10">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between py-4">
            <div>
              <p className="font-medium text-ink-horizon">{inv.invoiceNumber}</p>
              <p className="mt-0.5 text-xs text-ink/50">
                Travel date {new Date(inv.travelDate).toLocaleDateString()} · Issued{" "}
                {new Date(inv.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-medium text-ink-horizon">
                {inv.currency} {Number(inv.amountPaid).toLocaleString()} / {Number(inv.totalAmount).toLocaleString()}
              </p>
              <p className={`text-xs ${Number(inv.balanceDue) > 0 ? "text-plum" : "text-acacia"}`}>
                {Number(inv.balanceDue) > 0
                  ? `${inv.currency} ${Number(inv.balanceDue).toLocaleString()} due`
                  : "Paid in full"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {invoices.length > 0 && (
        <p className="mt-8 text-xs text-ink/40">
          PDF download isn't wired up yet - use your browser's print-to-PDF on a booking's detail page for a copy in
          the meantime.
        </p>
      )}
    </div>
  );
}
