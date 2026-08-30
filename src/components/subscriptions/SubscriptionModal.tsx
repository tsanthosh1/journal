"use client";

import React, { useState, useEffect } from "react";
import {
  BillingCycle,
  BillingType,
  DedupStrategy,
  EmailConfig,
  SourceType,
  Subscription,
  SubscriptionCategory,
} from "@/lib/subscriptionTypes";
import { ThumbnailPicker } from "./ThumbnailPicker";

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (subscriptionData: Partial<Subscription>) => Promise<void>;
  initialData?: Subscription | null;
  onOpenTestSandbox?: () => void;
}

export function SubscriptionModal({
  isOpen,
  onClose,
  onSave,
  initialData,
  onOpenTestSandbox,
}: SubscriptionModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // Basic Information
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SubscriptionCategory>("Credit Cards");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("MONTHLY");
  const [defaultAmount, setDefaultAmount] = useState<number>(0);
  const [isPrepaid, setIsPrepaid] = useState<boolean>(false);
  const [dueDayOfMonth, setDueDayOfMonth] = useState<number>(5);
  const [isEndOfMonthDue, setIsEndOfMonthDue] = useState<boolean>(false);
  const [allowSkip, setAllowSkip] = useState<boolean>(false);
  const [dedupStrategy, setDedupStrategy] = useState<DedupStrategy>("SAME_DAY_SAME_AMOUNT");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");

  // Independent Sources
  // Statement Source: "EMAIL" | "MANUAL"
  const [statementSource, setStatementSource] = useState<"EMAIL" | "MANUAL">("EMAIL");
  const [statementQuery, setStatementQuery] = useState("");

  // Payment Source: "EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL"
  const [paymentSource, setPaymentSource] = useState<"EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL">("EMAIL");
  const [paymentQuery, setPaymentQuery] = useState("");

  // SMS Configuration
  const [smsSenderQuery, setSmsSenderQuery] = useState("");
  const [smsKeywords, setSmsKeywords] = useState("loan, emi, recovery");
  const [smsLoanDigits, setSmsLoanDigits] = useState("");

  // Custom Query Builder Helper state
  const [fromDomain, setFromDomain] = useState("");
  const [keyword, setKeyword] = useState("");
  const [cardDigits, setCardDigits] = useState("");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setCategory((initialData.category as SubscriptionCategory) || "Credit Cards");
      setImageUrl(initialData.imageUrl || (initialData.icon?.startsWith("http") || initialData.icon?.startsWith("data:") ? initialData.icon : "") || "");
      setBillingCycle(initialData.billingCycle || "MONTHLY");
      setDefaultAmount(initialData.defaultAmount || 0);
      const isPre = Boolean(initialData.isPrepaid);
      setIsPrepaid(isPre);
      setDueDayOfMonth(initialData.dueDayOfMonth || 5);
      setIsEndOfMonthDue(Boolean(initialData.isEndOfMonthDue));
      setAllowSkip(Boolean(initialData.allowSkip));
      setDedupStrategy(
        (initialData.dedupStrategy as DedupStrategy) ||
          (initialData.emailConfig?.dedupStrategy as DedupStrategy) ||
          "SAME_DAY_SAME_AMOUNT",
      );
      setCurrency(initialData.currency || "INR");
      setNotes(initialData.notes || "");

      const ec = initialData.emailConfig;
      const sc = initialData.smsConfig;

      if (sc && (sc.enabled || initialData.source === "SMS_AUTOMATED")) {
        setPaymentSource("SMS");
        setSmsSenderQuery(sc.senderQuery || "");
        setSmsKeywords(sc.filterKeywords?.join(", ") || "loan, emi, recovery");
        setSmsLoanDigits(sc.accountOrLoanDigits || "");
        setStatementSource("MANUAL");
      } else if (ec && ec.enabled) {
        if (ec.statementQuery && ec.statementQuery.trim().length > 0) {
          setStatementSource("EMAIL");
          setStatementQuery(ec.statementQuery);
        } else {
          setStatementSource("MANUAL");
          setStatementQuery("");
        }

        if (ec.paymentQuery && ec.paymentQuery.trim().length > 0) {
          setPaymentSource("EMAIL");
          setPaymentQuery(ec.paymentQuery);
        } else if (isPre) {
          setPaymentSource("PREPAID_INVOICE");
          setPaymentQuery("");
        } else {
          setPaymentSource("MANUAL");
          setPaymentQuery("");
        }
      } else {
        setStatementSource("MANUAL");
        setPaymentSource(isPre ? "PREPAID_INVOICE" : "MANUAL");
        setStatementQuery("");
        setPaymentQuery("");
      }
    } else {
      setName("");
      setCategory("Credit Cards");
      setImageUrl("");
      setBillingCycle("MONTHLY");
      setDefaultAmount(0);
      setIsPrepaid(false);
      setDueDayOfMonth(5);
      setIsEndOfMonthDue(false);
      setAllowSkip(false);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
      setCurrency("INR");
      setNotes("");

      setStatementSource("EMAIL");
      setStatementQuery('from:cc.statements@axis.bank.in subject:"Credit Card"');
      setPaymentSource("EMAIL");
      setPaymentQuery('from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"');
      setSmsSenderQuery("HDFCBK");
      setSmsKeywords("loan, emi, recovery");
      setSmsLoanDigits("");
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleTimingModelChange = (prepaid: boolean) => {
    setIsPrepaid(prepaid);
    if (prepaid) {
      if (paymentSource !== "EMAIL") {
        setPaymentSource("PREPAID_INVOICE");
      }
    } else {
      if (paymentSource === "PREPAID_INVOICE") {
        setPaymentSource("EMAIL");
      }
    }
  };

  const handleCategoryChange = (newCat: SubscriptionCategory) => {
    setCategory(newCat);
    if (newCat === "Entertainment") {
      handleTimingModelChange(true);
    } else if (newCat === "Savings & Schemes") {
      handleTimingModelChange(false);
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
    }
  };

  // Preset Handlers for Statement
  const applyStatementPreset = (presetId: string) => {
    setStatementSource("EMAIL");
    if (presetId === "GRT_JEWELS") {
      setStatementQuery('from:mail@grtjewels.com subject:"GRT JPS Advance payment"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/grtjewels.com");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
      handleTimingModelChange(false);
    } else if (presetId === "TANISHQ_GOLD") {
      setStatementQuery('from:tanishq.co.in subject:"Golden Harvest"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/tanishq.co.in");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
      handleTimingModelChange(false);
    } else if (presetId === "AIRTEL_OTT") {
      setStatementQuery('from:ebill@airtel.com subject:"Invoice Generated"');
      setCategory("Entertainment");
      setImageUrl("https://logo.clearbit.com/airtel.in");
      handleTimingModelChange(true);
    } else if (presetId === "AXIS") {
      setStatementQuery('from:cc.statements@axis.bank.in subject:"Credit Card"');
      setImageUrl("https://logo.clearbit.com/axisbank.com");
      handleTimingModelChange(false);
    } else if (presetId === "AMAZON_PAY_ICICI") {
      setStatementQuery('from:credit_cards@icici.bank.in subject:"Amazon Pay ICICI Bank Credit Card Statement"');
      setImageUrl("https://logo.clearbit.com/amazon.in");
      handleTimingModelChange(false);
    } else if (presetId === "HDFC") {
      setStatementQuery('from:statements@hdfcbank.net subject:"Statement"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
      handleTimingModelChange(false);
    } else if (presetId === "ICICI") {
      setStatementQuery('from:(credit_cards@icici.bank.in OR credit_cards@icicibank.com) subject:"Statement"');
      setImageUrl("https://logo.clearbit.com/icicibank.com");
      handleTimingModelChange(false);
    } else if (presetId === "SBI") {
      setStatementQuery('from:estatement@sbicard.com subject:"SBI Card e-Statement"');
      setImageUrl("https://logo.clearbit.com/sbicard.com");
      handleTimingModelChange(false);
    } else if (presetId === "UTILITY") {
      setStatementQuery('from:(airtel OR jio OR bescom OR electricity) subject:("Bill" OR "Invoice")');
    }
  };

  // Preset Handlers for Payment
  const applyPaymentPreset = (presetId: string) => {
    setPaymentSource("EMAIL");
    if (presetId === "GRT_JEWELS") {
      setPaymentQuery('from:mail@grtjewels.com subject:"GRT JPS Advance payment"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/grtjewels.com");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
    } else if (presetId === "TANISHQ_GOLD") {
      setPaymentQuery('from:tanishq.co.in subject:"Golden Harvest"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/tanishq.co.in");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
    } else if (presetId === "AIRTEL_OTT") {
      setPaymentQuery('from:ebill@airtel.com subject:"Invoice Generated"');
      setImageUrl("https://logo.clearbit.com/airtel.in");
    } else if (presetId === "AMAZON_PAY") {
      setPaymentQuery('from:no-reply@amazonpay.in subject:"Bill payment"');
      setImageUrl("https://logo.clearbit.com/amazon.in");
    } else if (presetId === "HDFC_UPI_GPAY") {
      setPaymentQuery('from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "HDFC_UPI_VPA") {
      setPaymentQuery('from:alerts@hdfcbank.bank.in "VPA"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "HDFC_DIRECT") {
      setPaymentQuery('from:alerts@hdfcbank.net subject:"Payment Received"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "AXIS_DIRECT") {
      setPaymentQuery('from:alerts@axisbank.com subject:"Payment received"');
      setImageUrl("https://logo.clearbit.com/axisbank.com");
    } else if (presetId === "ICICI_DIRECT") {
      setPaymentQuery('from:alerts@icicibank.com subject:"Payment received"');
      setImageUrl("https://logo.clearbit.com/icicibank.com");
    } else if (presetId === "SBI_DIRECT") {
      setPaymentQuery('from:feedback@sbicard.com subject:"Payment Confirmation"');
      setImageUrl("https://logo.clearbit.com/sbicard.com");
    } else if (presetId === "UTILITY_RECEIPT") {
      setPaymentQuery('from:(airtel OR jio OR bescom OR electricity) subject:("Receipt" OR "Payment")');
    }
  };

  const handleBuildCustomHelperQuery = () => {
    const parts: string[] = [];
    if (fromDomain.trim()) parts.push(`from:${fromDomain.trim()}`);
    if (keyword.trim()) parts.push(`"${keyword.trim()}"`);
    if (cardDigits.trim()) parts.push(`"${cardDigits.trim()}"`);

    const q = parts.join(" ");
    if (q) {
      if (paymentSource === "EMAIL" && (!statementSource || statementSource === "MANUAL")) {
        setPaymentQuery(q);
      } else {
        setStatementQuery(q);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage("Please provide a name for this commitment.");
      return;
    }

    if (statementSource === "MANUAL" && (!defaultAmount || defaultAmount <= 0)) {
      setErrorMessage("Please enter an estimated or default amount (₹) since no statement email is being synced.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const isSmsAutomated = paymentSource === "SMS";
      const isEmailAutomated =
        !isSmsAutomated &&
        (statementSource === "EMAIL" || paymentSource === "EMAIL" || paymentSource === "PREPAID_INVOICE");

      const billingType: BillingType =
        statementSource === "EMAIL" ? "BILL_GENERATED" : "FIXED_TENURE";

      const source: SourceType = isSmsAutomated
        ? "SMS_AUTOMATED"
        : isEmailAutomated
        ? "EMAIL_AUTOMATED"
        : "MANUAL";

      const emailConfig: EmailConfig | undefined = isEmailAutomated
        ? {
            enabled: true,
            statementQuery: statementSource === "EMAIL" ? statementQuery.trim() : "",
            paymentQuery: paymentSource === "EMAIL" ? paymentQuery.trim() : "",
            dedupStrategy,
          }
        : undefined;

      const smsConfig = isSmsAutomated
        ? {
            enabled: true,
            senderQuery: smsSenderQuery.trim(),
            filterKeywords: smsKeywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
            accountOrLoanDigits: smsLoanDigits.trim() || undefined,
            dedupStrategy,
          }
        : undefined;

      const payload: Partial<Subscription> = {
        name,
        category,
        imageUrl: imageUrl.trim() || undefined,
        billingType,
        source,
        currency,
        defaultAmount: Number(defaultAmount) || 0,
        billingCycle,
        isPrepaid,
        dueDayOfMonth: isPrepaid ? undefined : isEndOfMonthDue ? undefined : Number(dueDayOfMonth) || 5,
        isEndOfMonthDue: isPrepaid ? false : isEndOfMonthDue,
        allowSkip,
        dedupStrategy,
        emailConfig,
        smsConfig,
        notes,
      };

      await onSave(payload);
      onClose();
    } catch (err) {
      setErrorMessage((err as Error).message || "Failed to save subscription.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-white/15 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-slate-950/40">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {initialData ? "Edit Recurring Commitment" : "Add Recurring Commitment"}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure details, timing model, and independent sources for statements and payments.
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

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {errorMessage && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {errorMessage}
            </div>
          )}

          {/* Section 1: General Information */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                1. General Information
              </span>
            </div>

            {/* Thumbnail Picker */}
            <ThumbnailPicker
              name={name}
              category={category}
              imageUrl={imageUrl}
              onChange={setImageUrl}
            />

            {/* Name */}
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                Service / Commitment Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. GRT Gold Scheme, Netflix, Axis Bank Card, Vehicle Cleaning"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            {/* Category & Billing Frequency */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => handleCategoryChange(e.target.value as SubscriptionCategory)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <option value="Credit Cards">Credit Cards</option>
                  <option value="Savings & Schemes">Jewellery & Savings Schemes (Gold Chit, SIP, RD)</option>
                  <option value="Entertainment">Entertainment & OTT Streaming</option>
                  <option value="Services">Services (Cleaning, Maintenance, Maid)</option>
                  <option value="Utilities">Utilities (Power, Water, Gas)</option>
                  <option value="Insurance">Insurance</option>
                  <option value="Software & Tools">Software & Tools</option>
                  <option value="Housing & Rent">Housing & Rent</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Frequency
                </label>
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="HALF_YEARLY">Half Yearly</option>
                  <option value="ANNUAL">Annual</option>
                  <option value="CUSTOM">Custom</option>
                </select>
              </div>
            </div>

            {/* Payment Timing Model */}
            <div>
              <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Payment Timing Model
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTimingModelChange(false)}
                  className={`min-h-[42px] rounded-xl border p-2 text-xs font-semibold transition cursor-pointer text-left ${
                    !isPrepaid
                      ? "border-cyan-400 bg-cyan-500/15 text-cyan-200"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  🗓️ Postpaid / Due Date Driven
                  <span className="block font-normal text-[10px] text-slate-400 mt-0.5">
                    Has a due date / deadline (e.g. Credit Cards, Schemes, Electricity)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTimingModelChange(true)}
                  className={`min-h-[42px] rounded-xl border p-2 text-xs font-semibold transition cursor-pointer text-left ${
                    isPrepaid
                      ? "border-amber-400 bg-amber-500/15 text-amber-200"
                      : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  ⚡ Prepaid / Instant Renewal
                  <span className="block font-normal text-[10px] text-slate-400 mt-0.5">
                    No due date (e.g. OTT, Netflix, Spotify, Recharges)
                  </span>
                </button>
              </div>
            </div>

            {/* Default Amount & Due Day */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {statementSource === "EMAIL"
                    ? "Estimated Amount (₹) (Optional)"
                    : "Amount per Cycle (₹) *"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={defaultAmount || ""}
                  onChange={(e) => setDefaultAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {statementSource === "EMAIL"
                    ? "Updated automatically when bill/invoice email is synced."
                    : "Fixed or default installment amount expected each cycle."}
                </span>
              </div>

              {!isPrepaid ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Payment Deadline
                    </label>
                    <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-0.5 border border-white/10">
                      <button
                        type="button"
                        onClick={() => setIsEndOfMonthDue(false)}
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                          !isEndOfMonthDue
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        Day (1-31)
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEndOfMonthDue(true)}
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded transition cursor-pointer ${
                          isEndOfMonthDue
                            ? "bg-cyan-500/20 text-cyan-300"
                            : "text-slate-400 hover:text-white"
                        }`}
                      >
                        End of Month
                      </button>
                    </div>
                  </div>

                  {!isEndOfMonthDue ? (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={dueDayOfMonth}
                      onChange={(e) => setDueDayOfMonth(parseInt(e.target.value) || 5)}
                      className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
                    />
                  ) : (
                    <div className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800/80 px-3.5 py-2 text-xs text-cyan-200 flex items-center justify-between">
                      <span>📅 Due on last day of month (28th-31st)</span>
                    </div>
                  )}

                  {/* Voluntary / Skip Policy Toggle */}
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 flex items-start gap-2.5 mt-2">
                    <input
                      type="checkbox"
                      id="allowSkipCheckbox"
                      checked={allowSkip}
                      onChange={(e) => setAllowSkip(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-800 text-indigo-500 focus:ring-indigo-400 cursor-pointer"
                    />
                    <label htmlFor="allowSkipCheckbox" className="text-xs text-slate-300 cursor-pointer">
                      <span className="font-semibold block text-white text-[11px]">
                        Voluntary / Skip Month if Missed
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        No overdue penalty. If unpaid in a month, mark cycle as <strong>Skipped</strong>.
                      </span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-center rounded-xl bg-amber-500/5 border border-amber-500/20 p-3">
                  <span className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                    <span>⚡</span> Prepaid Service
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    No payment due date required. Charged instantly upon invoice.
                  </span>
                </div>
              )}
            </div>
          </div>

          <hr className="border-white/10" />

          {/* Section 2: Statement / Bill Dues Source */}
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-950/20 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 block">
                  2. Statement / Invoice Source
                </span>
                <span className="text-[11px] text-slate-400">
                  Where does the billing invoice or statement come from?
                </span>
              </div>

              {/* Source Toggle */}
              <div className="flex items-center rounded-xl bg-slate-900/80 p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setStatementSource("EMAIL")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    statementSource === "EMAIL"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  ✉️ Gmail Sync
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatementSource("MANUAL");
                    setStatementQuery("");
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                    statementSource === "MANUAL"
                      ? "bg-white/10 text-white border border-white/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  🚫 None (Fixed / Manual)
                </button>
              </div>
            </div>

            {statementSource === "EMAIL" ? (
              <div className="space-y-2.5 pt-1">
                {/* Statement Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { id: "GRT_JEWELS", label: "GRT Gold Scheme" },
                    { id: "TANISHQ_GOLD", label: "Tanishq Golden Harvest" },
                    { id: "AIRTEL_OTT", label: "Airtel OTT" },
                    { id: "AMAZON_PAY_ICICI", label: "Amazon Pay ICICI" },
                    { id: "AXIS", label: "Axis Card" },
                    { id: "HDFC", label: "HDFC Card" },
                    { id: "ICICI", label: "ICICI Card" },
                    { id: "SBI", label: "SBI Card" },
                    { id: "UTILITY", label: "Telecom / Utility" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyStatementPreset(p.id)}
                      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder='from:mail@grtjewels.com subject:"GRT JPS Advance payment"'
                  value={statementQuery}
                  onChange={(e) => setStatementQuery(e.target.value)}
                  className="w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                No statement email will be searched. Expected amount will use the <strong>Amount per Cycle (₹{defaultAmount || 0})</strong>.
              </p>
            )}
          </div>

          {/* Section 3: Payment Confirmation Source */}
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 block">
                  3. Payment Confirmation Source
                </span>
                <span className="text-[11px] text-slate-400">
                  How should payments and debits be reconciled?
                </span>
              </div>

              {/* Source Toggle */}
              <div className="flex items-center rounded-xl bg-slate-900/80 p-1 border border-white/10">
                {isPrepaid ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentSource("PREPAID_INVOICE");
                        setPaymentQuery("");
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "PREPAID_INVOICE"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ⚡ Settled on Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentSource("EMAIL")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "EMAIL"
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ✉️ Bank / UPI Alert
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentSource("MANUAL");
                        setPaymentQuery("");
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "MANUAL"
                          ? "bg-white/10 text-white border border-white/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ✋ Manual
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setPaymentSource("EMAIL")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "EMAIL"
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ✉️ Gmail Sync
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentSource("SMS")}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "SMS"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      💬 Android SMS (Loan/EMI)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentSource("MANUAL");
                        setPaymentQuery("");
                      }}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                        paymentSource === "MANUAL"
                          ? "bg-white/10 text-white border border-white/20"
                          : "text-slate-400 hover:text-white"
                      }`}
                    >
                      ✋ Manual
                    </button>
                  </>
                )}
              </div>
            </div>

            {paymentSource === "PREPAID_INVOICE" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                <span className="font-bold flex items-center gap-1 mb-0.5">
                  <span>⚡</span> Auto-Settled Upon Invoice Receipt
                </span>
                <p className="text-[11px] text-slate-300">
                  Because this is a prepaid subscription, the invoice email in Section 2 is also the payment confirmation. Each detected bill is automatically recorded as <strong>Fully Paid</strong>.
                </p>
              </div>
            ) : paymentSource === "SMS" ? (
              <div className="space-y-3 pt-1">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                  <span className="font-bold flex items-center gap-1 mb-0.5">
                    <span>💬</span> Android SMS Companion Sync
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Loan debits and EMI recovery messages forwarded from your Android phone will automatically reconcile this commitment.
                  </p>
                </div>

                {/* Loan Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSmsSenderQuery("HDFCBK");
                      setSmsKeywords("Home Loan, LN RECOVERY");
                      setCategory("Housing & Rent");
                      setName((n) => n || "HDFC Home Loan");
                      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    🏦 HDFC Home Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSmsSenderQuery("SBIINB");
                      setSmsKeywords("LOAN A/C, transfer to LOAN");
                      setCategory("Housing & Rent");
                      setName((n) => n || "SBI Home Loan");
                      setImageUrl("https://logo.clearbit.com/sbi.co.in");
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    🏦 SBI Home Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSmsSenderQuery("ICICIB");
                      setSmsKeywords("Loan Account, towards EMI");
                      setCategory("Housing & Rent");
                      setName((n) => n || "ICICI Home Loan");
                      setImageUrl("https://logo.clearbit.com/icicibank.com");
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    🏦 ICICI Home Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSmsSenderQuery("BAJAJ");
                      setSmsKeywords("EMI, debited");
                      setCategory("Services");
                      setName((n) => n || "Bajaj Finserv Loan");
                      setImageUrl("https://logo.clearbit.com/bajajfinserv.in");
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    💳 Bajaj Finserv EMI
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Bank Sender Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HDFCBK, SBIINB, CANBNK"
                      value={smsSenderQuery}
                      onChange={(e) => setSmsSenderQuery(e.target.value)}
                      className="mt-1 w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Matches SMS sender header (e.g. AD-HDFCBK).
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Loan Last 4 Digits (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 7890"
                      value={smsLoanDigits}
                      onChange={(e) => setSmsLoanDigits(e.target.value)}
                      className="mt-1 w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Filters SMS matching your specific loan account.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Filter Keywords (Comma Separated)
                  </label>
                  <input
                    type="text"
                    placeholder="loan, emi, recovery, debited"
                    value={smsKeywords}
                    onChange={(e) => setSmsKeywords(e.target.value)}
                    className="mt-1 w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
            ) : paymentSource === "EMAIL" ? (
              <div className="space-y-2.5 pt-1">
                {/* Payment Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { id: "GRT_JEWELS", label: "GRT Gold Scheme" },
                    { id: "TANISHQ_GOLD", label: "Tanishq Golden Harvest" },
                    { id: "AMAZON_PAY", label: "Amazon Pay" },
                    { id: "HDFC_UPI_VPA", label: "HDFC UPI (VPA / Alert)" },
                    { id: "HDFC_UPI_GPAY", label: "HDFC UPI (GPay Flex)" },
                    { id: "HDFC_DIRECT", label: "HDFC Direct" },
                    { id: "AXIS_DIRECT", label: "Axis Direct" },
                    { id: "ICICI_DIRECT", label: "ICICI Direct" },
                    { id: "SBI_DIRECT", label: "SBI Direct" },
                    { id: "UTILITY_RECEIPT", label: "Utility Receipt" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPaymentPreset(p.id)}
                      className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/20 cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  placeholder='from:mail@grtjewels.com subject:"GRT JPS Advance payment"'
                  value={paymentQuery}
                  onChange={(e) => setPaymentQuery(e.target.value)}
                  className="w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 block">
                  Example: <code className="text-indigo-300 font-mono">from:mail@grtjewels.com subject:"GRT JPS Advance payment"</code>
                </span>

                {/* Duplicate Prevention Setting */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2 mt-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                      🛡️ Duplicate Prevention Strategy
                    </label>
                    <span className="text-[10px] text-indigo-300 font-medium">Prevents double-counting duplicate notifications</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setDedupStrategy("SAME_DAY_SAME_AMOUNT")}
                      className={`p-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        dedupStrategy === "SAME_DAY_SAME_AMOUNT"
                          ? "border border-indigo-400 bg-indigo-500/20 text-indigo-200"
                          : "border border-white/10 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="font-semibold block text-white text-xs">🛡️ Same Day & Amount</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Ignores duplicate emails on same day for same amount (e.g. GRT / chits).
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDedupStrategy("SINGLE_PAYMENT_PER_CYCLE")}
                      className={`p-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        dedupStrategy === "SINGLE_PAYMENT_PER_CYCLE"
                          ? "border border-indigo-400 bg-indigo-500/20 text-indigo-200"
                          : "border border-white/10 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="font-semibold block text-white text-xs">🎯 1 Payment / Month</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Records max 1 installment per month. All subsequent emails ignored.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDedupStrategy("ALLOW_MULTIPLE")}
                      className={`p-2.5 rounded-xl text-left text-xs transition cursor-pointer ${
                        dedupStrategy === "ALLOW_MULTIPLE"
                          ? "border border-indigo-400 bg-indigo-500/20 text-indigo-200"
                          : "border border-white/10 bg-slate-900 text-slate-400 hover:text-white"
                      }`}
                    >
                      <span className="font-semibold block text-white text-xs">➕ Sum All Emails</span>
                      <span className="block text-[10px] text-slate-400 mt-0.5">
                        Sums every matching email (e.g. multiple card payments).
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                Payments will not be synced automatically. You can click <strong>Pay Full</strong> or <strong>Override</strong> anytime in the ledger.
              </p>
            )}
          </div>

          {/* Helper: Custom Query Builder */}
          {(statementSource === "EMAIL" || paymentSource === "EMAIL") && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3.5 space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                Query Builder Assistant
              </span>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <label className="text-[10px] sm:text-[11px] text-slate-400">Sender / Domain (from:)</label>
                  <input
                    type="text"
                    placeholder="e.g. mail@grtjewels.com"
                    value={fromDomain}
                    onChange={(e) => setFromDomain(e.target.value)}
                    className="mt-0.5 w-full min-h-[36px] rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] sm:text-[11px] text-slate-400">Keyword / Payee Name</label>
                  <input
                    type="text"
                    placeholder="e.g. GRT JPS Advance payment"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="mt-0.5 w-full min-h-[36px] rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] sm:text-[11px] text-slate-400">Membership / Account No</label>
                  <input
                    type="text"
                    placeholder="e.g. 9292"
                    value={cardDigits}
                    onChange={(e) => setCardDigits(e.target.value)}
                    className="mt-0.5 w-full min-h-[36px] rounded-lg border border-white/10 bg-slate-800 px-2.5 py-1 text-xs text-white"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleBuildCustomHelperQuery}
                className="mt-1.5 min-h-[32px] rounded-lg bg-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/20 cursor-pointer"
              >
                Apply to Active Query
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">
              Notes & Remarks
            </label>
            <textarea
              rows={2}
              placeholder="Optional remarks, membership numbers, scheme details, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 p-3 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
            />
          </div>

          {/* Live Sandbox Trigger */}
          {onOpenTestSandbox && (statementSource === "EMAIL" || paymentSource === "EMAIL") && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onOpenTestSandbox}
                className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
              >
                <span>🧪</span> Open Live Regex Sandbox →
              </button>
            </div>
          )}

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 border-t border-white/10 pt-4 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[40px] rounded-xl bg-gradient-to-r from-cyan-400 to-indigo-500 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-400/20 hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
            >
              {isSubmitting ? "Saving..." : initialData ? "Save Changes" : "Create Commitment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
