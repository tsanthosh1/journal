"use client";

import React, { useState, useEffect } from "react";
import {
  SourceEmailRecord,
  Subscription,
  formatCycleMonth,
  formatDisplayDate,
  formatEmailTimestamp,
} from "@/lib/subscriptionTypes";
import { SubscriptionAvatar } from "./SubscriptionAvatar";

interface SourceEmailViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: Subscription | null;
  initialEmail?: SourceEmailRecord | null;
  scopedEmails?: SourceEmailRecord[] | null;
  cycleMonth?: string | null;
}

export function SourceEmailViewerModal({
  isOpen,
  onClose,
  subscription,
  initialEmail,
  scopedEmails,
  cycleMonth,
}: SourceEmailViewerModalProps) {
  const [emails, setEmails] = useState<SourceEmailRecord[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<SourceEmailRecord | null>(null);
  const [activeTab, setActiveTab] = useState<"html" | "text" | "debug">("html");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !subscription) return;

    // If scoped emails are passed (from a specific historical cycle line), show ONLY those emails
    if (scopedEmails && scopedEmails.length > 0) {
      const sorted = [...scopedEmails].sort((a, b) => b.date.localeCompare(a.date));
      setEmails(sorted);
      setSelectedEmail(initialEmail || sorted[0]);
      setIsLoading(false);
      return;
    }

    const fetchEmails = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/subscriptions/${subscription.id}/emails`);
        if (res.ok) {
          const data = await res.json();
          const list: SourceEmailRecord[] = data.emails || [];

          // Also merge any in-memory currentCycle sourceEmails & sourceSms
          const cycleEmails = subscription.currentCycle?.sourceEmails || [];
          const cycleSms = subscription.currentCycle?.sourceSms || [];

          const mergedMap = new Map<string, SourceEmailRecord>();
          list.forEach((e) => mergedMap.set(e.id, e));
          cycleEmails.forEach((e) => mergedMap.set(e.id, e));

          // Convert SMS records to unified viewer items
          cycleSms.forEach((sms) => {
            mergedMap.set(sms.id, {
              id: sms.id,
              subscriptionId: subscription.id,
              subscriptionName: subscription.name,
              cycleMonth: sms.date.slice(0, 7),
              type: "PAYMENT",
              subject: `💬 SMS Alert: ${sms.sender}`,
              from: sms.sender,
              date: sms.date,
              bodySnippet: sms.body,
              bodyText: sms.body,
              extractedAmount: sms.extractedAmount,
              extractedDate: sms.extractedDate,
              accountOrCardDigits: sms.accountReference,
              createdAt: sms.createdAt,
            });
          });

          let merged = Array.from(mergedMap.values()).sort((a, b) =>
            b.date.localeCompare(a.date),
          );

          // If cycleMonth filter is active, filter by that cycle month
          if (cycleMonth) {
            merged = merged.filter((e) => e.cycleMonth === cycleMonth);
          }

          setEmails(merged);
          if (initialEmail) {
            setSelectedEmail(initialEmail);
          } else if (merged.length > 0) {
            setSelectedEmail(merged[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching source emails:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmails();
  }, [isOpen, subscription, initialEmail, scopedEmails, cycleMonth]);

  if (!isOpen || !subscription) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-3.5">
            <SubscriptionAvatar
              name={subscription.name}
              category={subscription.category}
              imageUrl={subscription.imageUrl}
              icon={subscription.icon}
              size="xl"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  Archived Source Email Viewer
                </h2>
                <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-300">
                  {subscription.name}
                </span>
                {cycleMonth && (
                  <span className="rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
                    🗓️ Cycle {formatCycleMonth(cycleMonth)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {cycleMonth
                  ? `Showing statement and payment confirmation emails specific to billing cycle ${formatCycleMonth(cycleMonth)}.`
                  : "Verified email copies archived in Firebase Storage and extracted by deterministic parsers."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Layout: Sidebar of Emails + Main Email Preview Canvas */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Left Email Selector Sidebar */}
          <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 bg-slate-950/30 overflow-y-auto max-h-48 md:max-h-none shrink-0 p-2 sm:p-3 space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block px-2 py-1">
              {cycleMonth ? `Cycle Emails (${emails.length})` : `Archived Emails (${emails.length})`}
            </span>

            {isLoading ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-r-transparent mb-1" />
                <p>Loading email archives...</p>
              </div>
            ) : emails.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No email copies linked to this specific cycle entry. Run a scan to sync incoming statements and payment alerts.
              </div>
            ) : (
              emails.map((e) => {
                const isSelected = selectedEmail?.id === e.id;
                const isStmt = e.type === "STATEMENT";
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedEmail(e)}
                    className={`w-full text-left rounded-xl p-2.5 transition cursor-pointer border ${
                      isSelected
                        ? "border-cyan-400/50 bg-cyan-500/10 text-white"
                        : "border-white/5 bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          isStmt
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "bg-emerald-500/20 text-emerald-300"
                        }`}
                      >
                        {e.type}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formatDisplayDate(e.date || e.extractedDate)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold truncate text-white">{e.subject}</p>
                    {e.extractedAmount !== undefined && (
                      <div className="mt-1 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Extracted:</span>
                        <span
                          className={`font-bold ${
                            isStmt ? "text-cyan-300" : "text-emerald-300"
                          }`}
                        >
                          ₹{e.extractedAmount.toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Right Main Email Viewer */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-900">
            {selectedEmail ? (
              <>
                {/* Email Metadata Card */}
                <div className="border-b border-white/10 p-3 sm:p-4 bg-slate-950/20 space-y-2 shrink-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h3 className="text-sm sm:text-base font-bold text-white">
                      {selectedEmail.subject}
                    </h3>
                    <span
                      className={`self-start sm:self-auto inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        selectedEmail.type === "STATEMENT"
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {selectedEmail.type === "STATEMENT"
                        ? "📄 Statement Email"
                        : "💳 Payment Confirmation"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-300 pt-1 border-t border-white/5">
                    {selectedEmail.from && (
                      <div className="truncate" title={selectedEmail.from}>
                        <span className="text-slate-500">From:</span> {selectedEmail.from}
                      </div>
                    )}
                    <div>
                      <span className="text-slate-500">Date:</span> {formatEmailTimestamp(selectedEmail.date)}
                    </div>
                    {selectedEmail.extractedAmount !== undefined && (
                      <div>
                        <span className="text-slate-500">Amount:</span>{" "}
                        <strong className="text-white">
                          ₹{selectedEmail.extractedAmount.toLocaleString("en-IN")}
                        </strong>
                      </div>
                    )}
                    {selectedEmail.extractedDate && (
                      <div>
                        <span className="text-slate-500">Cycle / Due:</span>{" "}
                        <span className="text-white">{formatDisplayDate(selectedEmail.extractedDate)}</span>
                      </div>
                    )}
                  </div>

                  {/* Tab switchers: HTML Preview vs Raw Text vs Debug JSON */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("html")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        activeTab === "html"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Rich HTML Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("text")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        activeTab === "text"
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      Plaintext
                    </button>
                    {selectedEmail.rawMatches && Object.keys(selectedEmail.rawMatches).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("debug")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          activeTab === "debug"
                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Extracted Regex Matches
                      </button>
                    )}
                  </div>
                </div>

                {/* Email Body Canvas */}
                <div className="flex-1 overflow-y-auto p-4 bg-slate-950/60">
                  {activeTab === "html" && selectedEmail.bodyHtml ? (
                    <div className="rounded-2xl overflow-hidden bg-white text-slate-950 p-4 shadow-xl min-h-[400px]">
                      <div
                        dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                        className="email-html-wrapper"
                      />
                    </div>
                  ) : activeTab === "debug" && selectedEmail.rawMatches ? (
                    <div className="rounded-2xl bg-slate-900 border border-white/10 p-4 font-mono text-xs text-cyan-300 space-y-2">
                      <span className="text-slate-400 block font-sans font-bold text-xs uppercase mb-2">
                        Parser Key-Value Extractions
                      </span>
                      <pre className="overflow-x-auto p-3 rounded-xl bg-black/40 text-emerald-300 whitespace-pre-wrap">
                        {JSON.stringify(selectedEmail.rawMatches, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-slate-900 border border-white/10 p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                      {selectedEmail.bodyText || selectedEmail.bodySnippet || "No text content."}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                Select an email from the left sidebar to preview full contents.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3 shrink-0 bg-slate-950/40 text-xs text-slate-500">
          <span className="font-mono text-[11px] truncate max-w-sm">
            {selectedEmail?.storagePath
              ? `Firebase Storage: ${selectedEmail.storagePath}`
              : "Email details cached"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[34px] rounded-xl bg-white/10 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
