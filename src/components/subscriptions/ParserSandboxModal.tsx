"use client";

import React, { useState } from "react";
import { ParserTestResult } from "@/lib/subscriptionTypes";

interface ParserSandboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialModule?: string;
  initialCustomRegex?: any;
}

const SAMPLE_TEMPLATES: Record<string, { label: string; subject: string; content: string }> = {
  AxisCardParser: {
    label: "Axis Bank Statement",
    subject: "Your Axis Bank Google Pay Flex Axis Bank Credit Card ending XX44 - August 2026",
    content: `Dear Customer,

Please find enclosed your credit card statement for AUGUST 2026.

Total Amount Due INR: 202330.63 Dr
Minimum Amount Due (INR): 4122 Dr
Payment Due Date (DD-MM-YYYY): 04/09/2026

Card ending with: XX44
Warm regards,
Axis Bank`,
  },
  UPIPaymentParser: {
    label: "HDFC UPI Payment (GPay)",
    subject: "❗  You have done a UPI txn. Check details!",
    content: `Dear Customer,

Greetings from HDFC Bank!

Rs.70000.00 is debited from your account ending 6013 towards VPA gpay-creditcard@okpayaxis (Google India Digital Services Pvt Ltd) on 29-08-26.

UPI transaction reference no.: 128680903509.

If you did not authorize this transaction, please report it immediately.

Warm regards,
HDFC Bank`,
  },
  HDFCCardParser: {
    label: "HDFC Card Statement",
    subject: "Your HDFC Bank Credit Card Statement - Card ending in 4082",
    content: `Dear Customer,

Here is your e-Statement for HDFC Bank Credit Card ending with 4082 for the period ending 15-Aug-2026.

Statement Date: 15-Aug-2026
Payment Due Date: 05-Sep-2026
Total Amount Due: Rs. 24,500.00
Minimum Amount Due: Rs. 1,225.00
Credit Limit: Rs. 3,50,000.00

Thank you for banking with HDFC Bank.`,
  },
  HDFC_Payment: {
    label: "HDFC Card Direct Payment",
    subject: "Alert: Payment received for HDFC Bank Credit Card ending 4082",
    content: `Dear Customer,

We have received payment of Rs. 10,000.00 towards your HDFC Bank Credit Card ending with 4082 on 28-Aug-2026.
Transaction Reference Number: HDFC892374892.

Your available credit limit has been updated.`,
  },
  AmazonPayICICI: {
    label: "Amazon Pay ICICI",
    subject: "Amazon Pay ICICI Bank Credit Card Statement for the period July 13, 2026 to August 12, 2026",
    content: `payment due by August 30, 2026
ICICI Bank Credit Card XX5005
Minimum Amount Due: ₹1,040.00
Total Amount Due: ₹20,759.19

Pay from any UPI-enabled app to the ICICI Bank UPI ID: ccpay.98765432105005@icici`,
  },
  ICICICardParser: {
    label: "ICICI Statement",
    subject: "ICICI Bank Credit Card e-Statement for Card ending 1094",
    content: `Dear Customer,

Summary of your ICICI Bank Credit Card Account:
Credit Card No: 4315-XXXX-XXXX-1094
Statement Date: 18-Aug-2026
Payment Due Date: 08-Sep-2026
Total Amount Due: INR 18,750.50
Minimum Amount Due: INR 940.00

Please pay your dues on or before the due date.`,
  },
  SBICardParser: {
    label: "SBI Statement",
    subject: "SBI Card e-Statement - Card ending 7731",
    content: `Dear Cardholder,

Your SBI Card Statement is ready:
SBI Card ending in 7731
Total Amount Due: Rs. 32,100.00
Payment Due Date: 12-Sep-2026
Minimum Amount Due: Rs. 1,600.00`,
  },
  AirtelOTT: {
    label: "Airtel Xstream OTT",
    subject: "25+ OTTs Invoice Generated",
    content: `Payment Reciept
Hi Santhosh thamaraiselvan T

Thank you for purchasing a subscription of Rs 279 for 25+ OTTs. Please find the payment receipt attached.

Regards,
XTELIFY LIMITED - Formerly Airtel Digital Limited`,
  },
  GRTJewels: {
    label: "GRT JPS Gold Scheme",
    subject: "GRT JPS Advance payment",
    content: `Date: Tue, 04 Aug 2026 12:03:21 +0000
From: Customer Care <mail@grtjewels.com>
Subject: GRT JPS Advance payment

Hi Santhosh Thamaraiselvan,
Thanks for making advance payment for your jewellery purchase plan. It will reflect in your ledger shortly.

Here's a quick preview of your Jewellery Purchase Plan:
Name : Santhosh Thamaraiselvan,
Membership Number : 9292,
Group Code : EGU,
Branch : GAX,
Scheme Amount : 30000.`,
  },
  GenericUtilityParser: {
    label: "Airtel Broadband",
    subject: "Airtel Broadband Bill for 08041234567",
    content: `Dear Customer,

Your Airtel Xstream Fiber bill for the billing period 01-Aug-2026 to 31-Aug-2026 has been generated.
Total Amount Due: ₹ 1,178.00
Payment Due Date: 20-Sep-2026

Pay online before the due date.`,
  },
};

export function ParserSandboxModal({
  isOpen,
  onClose,
  initialModule = "UniversalAutoParser",
}: ParserSandboxModalProps) {
  const [subject, setSubject] = useState(SAMPLE_TEMPLATES.AxisCardParser?.subject || "");
  const [content, setContent] = useState(SAMPLE_TEMPLATES.AxisCardParser?.content || "");

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ParserTestResult | null>(null);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleLoadTemplate = (key: string) => {
    const t = SAMPLE_TEMPLATES[key];
    if (t) {
      setSubject(t.subject);
      setContent(t.content);
    }
  };

  const handleRunTest = async () => {
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/parsers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parserModule: "UniversalAutoParser",
          subject,
          content,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Testing parser failed.");
      }

      setResult(data.testResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const stmtRes = result?.statementResult;
  const payRes = result?.paymentResult;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base">🧪</span>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Live Email Parser Sandbox & Tester
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Verify statement dues & payment extraction against raw email text with Universal Auto-Detect.
            </p>
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

        {/* Body - Scrollable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Preloaded Template Pills */}
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Load Sample Email
            </label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SAMPLE_TEMPLATES).map(([key, tmpl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleLoadTemplate(key)}
                  className="min-h-[32px] rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-400 hover:text-white transition cursor-pointer"
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
              Email Subject Line
            </label>
            <input
              type="text"
              placeholder="e.g. Your Credit Card Statement"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full min-h-[40px] rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Email Content Body */}
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-300">
              Email Content Body (HTML or Plaintext)
            </label>
            <textarea
              rows={7}
              placeholder="Paste raw email text, alert body, or HTML message here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1 w-full font-mono text-xs rounded-xl border border-white/10 bg-slate-800 p-3 text-slate-200 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Run Button */}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={isLoading || !content.trim()}
              onClick={handleRunTest}
              className="min-h-[40px] flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-cyan-300 disabled:opacity-50 transition cursor-pointer"
            >
              <span>▶</span>
              {isLoading ? "Running Auto-Detect Match..." : "Execute Test Extraction"}
            </button>
          </div>

          {/* Error notice */}
          {error && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Results Output */}
          {result && (
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 space-y-3">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 block">
                Extraction Test Results (Universal Auto-Detect)
              </span>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Statement Extraction */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Statement Match</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                        stmtRes?.success
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {stmtRes?.success ? "MATCHED" : "NO MATCH"}
                    </span>
                  </div>
                  {stmtRes?.success ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-300">
                      <div>
                        Total Due:{" "}
                        <strong className="text-white">
                          ₹{stmtRes.statementTotal?.toLocaleString("en-IN")}
                        </strong>
                      </div>
                      <div>
                        Due Date:{" "}
                        <span className="text-slate-200">{stmtRes.dueDate}</span>
                      </div>
                      {stmtRes.statementDate && (
                        <div>
                          Statement Date:{" "}
                          <span className="text-slate-200">
                            {stmtRes.statementDate}
                          </span>
                        </div>
                      )}
                      {stmtRes.accountOrCardDigits && (
                        <div>
                          Card Last Digits:{" "}
                          <span className="text-slate-200 font-mono">
                            {stmtRes.accountOrCardDigits}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {stmtRes?.error || "No statement dues detected"}
                    </p>
                  )}
                </div>

                {/* Payment Extraction */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Payment Match</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                        payRes?.success
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {payRes?.success ? "MATCHED" : "NO MATCH"}
                    </span>
                  </div>
                  {payRes?.success ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-300">
                      <div>
                        Paid Amount:{" "}
                        <strong className="text-emerald-400">
                          ₹{payRes.paidAmount?.toLocaleString("en-IN")}
                        </strong>
                      </div>
                      <div>
                        Payment Date:{" "}
                        <span className="text-slate-200">{payRes.paymentDate}</span>
                      </div>
                      {payRes.referenceId && (
                        <div>
                          Reference ID:{" "}
                          <span className="text-slate-300 font-mono">
                            {payRes.referenceId}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      {payRes?.error || "No payment confirmation detected"}
                    </p>
                  )}
                </div>
              </div>

              {/* Logs */}
              {result.logs && (
                <div className="rounded-xl bg-slate-900 p-2.5 font-mono text-[11px] text-slate-400 max-h-32 overflow-y-auto">
                  {result.logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-white/10 px-4 sm:px-6 py-3.5 shrink-0 bg-slate-950/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white"
          >
            Close Sandbox
          </button>
        </div>
      </div>
    </div>
  );
}
