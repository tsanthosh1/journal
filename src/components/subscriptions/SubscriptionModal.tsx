"use client";

import React, { useState, useEffect } from "react";
import {
  BillingCycle,
  BillingType,
  DedupStrategy,
  EmailConfig,
  ParserConfigField,
  SourceType,
  Subscription,
  SubscriptionCategory,
} from "@/lib/subscriptionTypes";
import { ThumbnailPicker } from "./ThumbnailPicker";
import { getAvailableParsers, ParserMetadata } from "@/lib/parsers";

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

  const availableParsers: ParserMetadata[] = getAvailableParsers();

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

  // Independent Statement Parser Selection & Config
  const [statementParserModule, setStatementParserModule] = useState<string>("UniversalAutoParser");
  const [statementParserConfig, setStatementParserConfig] = useState<Record<string, any>>({});

  // Independent Payment Parser Selection & Config
  const [paymentParserModule, setPaymentParserModule] = useState<string>("UniversalAutoParser");
  const [paymentParserConfig, setPaymentParserConfig] = useState<Record<string, any>>({});

  const [customRegex, setCustomRegex] = useState<{
    statementAmountPattern?: string;
    statementDueDatePattern?: string;
    paymentAmountPattern?: string;
  }>({});

  // Independent Sources
  // Statement Source: "EMAIL" | "SMS" | "MANUAL"
  const [statementSource, setStatementSource] = useState<"EMAIL" | "SMS" | "MANUAL">("EMAIL");
  const [statementQuery, setStatementQuery] = useState("");
  const [statementSmsSender, setStatementSmsSender] = useState("");
  const [statementSmsKeywords, setStatementSmsKeywords] = useState("bill, due, statement");
  const [statementSmsDigits, setStatementSmsDigits] = useState("");

  // Payment Source: "EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL"
  const [paymentSource, setPaymentSource] = useState<"EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL">("EMAIL");
  const [paymentQuery, setPaymentQuery] = useState("");
  const [paymentSmsSender, setPaymentSmsSender] = useState("");
  const [paymentSmsKeywords, setPaymentSmsKeywords] = useState("loan, emi, recovery, debited");
  const [paymentSmsDigits, setPaymentSmsDigits] = useState("");

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

      if (ec?.statementParserModule) {
        setStatementParserModule(ec.statementParserModule);
      } else if (ec?.parserModule) {
        setStatementParserModule(ec.parserModule);
      } else {
        setStatementParserModule("UniversalAutoParser");
      }

      if (ec?.statementParserConfig) {
        setStatementParserConfig(ec.statementParserConfig);
      } else if (ec?.parserConfig) {
        setStatementParserConfig(ec.parserConfig);
      } else {
        setStatementParserConfig({});
      }

      if (ec?.paymentParserModule) {
        setPaymentParserModule(ec.paymentParserModule);
      } else if (ec?.parserModule) {
        setPaymentParserModule(ec.parserModule);
      } else {
        setPaymentParserModule("UniversalAutoParser");
      }

      if (ec?.paymentParserConfig) {
        setPaymentParserConfig(ec.paymentParserConfig);
      } else if (ec?.parserConfig) {
        setPaymentParserConfig(ec.parserConfig);
      } else {
        setPaymentParserConfig({});
      }

      if (ec?.customRegex) {
        setCustomRegex(ec.customRegex);
      } else {
        setCustomRegex({});
      }

      if (sc && (sc.enabled || initialData.source === "SMS_AUTOMATED")) {
        setPaymentSource("SMS");
        setPaymentSmsSender(sc.senderQuery || "");
        setPaymentSmsKeywords(sc.filterKeywords?.join(", ") || "loan, emi, recovery, debited");
        setPaymentSmsDigits(sc.accountOrLoanDigits || "");
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

      setStatementParserModule("UniversalAutoParser");
      setStatementParserConfig({});
      setPaymentParserModule("UniversalAutoParser");
      setPaymentParserConfig({});
      setCustomRegex({});

      setStatementSource("EMAIL");
      setStatementQuery('from:cc.statements@axis.bank.in subject:"Credit Card"');
      setStatementSmsSender("");
      setStatementSmsKeywords("bill, due, statement");
      setStatementSmsDigits("");

      setPaymentSource("EMAIL");
      setPaymentQuery('from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"');
      setPaymentSmsSender("HDFCBK");
      setPaymentSmsKeywords("loan, emi, recovery, debited");
      setPaymentSmsDigits("");
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

  const handleSelectStatementParser = (parserId: string) => {
    setStatementParserModule(parserId);
    const pMeta = availableParsers.find((p) => p.id === parserId);
    if (pMeta?.sampleStatementQuery && statementSource === "EMAIL") {
      setStatementQuery(pMeta.sampleStatementQuery);
    }
  };

  const handleSelectPaymentParser = (parserId: string) => {
    setPaymentParserModule(parserId);
    const pMeta = availableParsers.find((p) => p.id === parserId);
    if (pMeta?.samplePaymentQuery && paymentSource === "EMAIL") {
      setPaymentQuery(pMeta.samplePaymentQuery);
    }
  };

  // Preset Handlers for Statement
  const applyStatementPreset = (presetId: string) => {
    setStatementSource("EMAIL");
    if (presetId === "GRT_JEWELS") {
      setStatementParserModule("JewellerySchemeParser");
      setStatementQuery('from:mail@grtjewels.com subject:"GRT JPS Advance payment"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/grtjewels.com");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
      handleTimingModelChange(false);
    } else if (presetId === "TANISHQ_GOLD") {
      setStatementParserModule("JewellerySchemeParser");
      setStatementQuery('from:tanishq.co.in subject:"Golden Harvest"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/tanishq.co.in");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
      handleTimingModelChange(false);
    } else if (presetId === "AIRTEL_POSTPAID") {
      setStatementParserModule("AirtelPostpaidParser");
      setStatementQuery('from:(google-pay-noreply@google.com OR ebill@airtel.com) subject:("Airtel Postpaid" OR "New bill from Airtel")');
      setCategory("Utilities");
      setName((n) => n || "Airtel Postpaid");
      setImageUrl("https://logo.clearbit.com/airtel.in");
      handleTimingModelChange(false);
    } else if (presetId === "AIRTEL_OTT") {
      setStatementParserModule("GenericUtilityParser");
      setStatementQuery('from:ebill@airtel.com subject:"Invoice Generated"');
      setCategory("Entertainment");
      setImageUrl("https://logo.clearbit.com/airtel.in");
      handleTimingModelChange(true);
    } else if (presetId === "AXIS") {
      setStatementParserModule("AxisCardParser");
      setStatementQuery('from:cc.statements@axis.bank.in subject:"Credit Card"');
      setImageUrl("https://logo.clearbit.com/axisbank.com");
      handleTimingModelChange(false);
    } else if (presetId === "AMAZON_PAY_ICICI") {
      setStatementParserModule("ICICICardParser");
      setStatementQuery('from:credit_cards@icici.bank.in subject:"Amazon Pay ICICI Bank Credit Card Statement"');
      setImageUrl("https://logo.clearbit.com/amazon.in");
      handleTimingModelChange(false);
    } else if (presetId === "HDFC") {
      setStatementParserModule("HDFCCardParser");
      setStatementQuery('from:statements@hdfcbank.net subject:"Statement"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
      handleTimingModelChange(false);
    } else if (presetId === "ICICI") {
      setStatementParserModule("ICICICardParser");
      setStatementQuery('from:(credit_cards@icici.bank.in OR credit_cards@icicibank.com) subject:"Statement"');
      setImageUrl("https://logo.clearbit.com/icicibank.com");
      handleTimingModelChange(false);
    } else if (presetId === "SBI") {
      setStatementParserModule("SBICardParser");
      setStatementQuery('from:estatement@sbicard.com subject:"SBI Card e-Statement"');
      setImageUrl("https://logo.clearbit.com/sbicard.com");
      handleTimingModelChange(false);
    } else if (presetId === "HOMEFY_WATER") {
      setStatementParserModule("HomefyParser");
      setStatementQuery('from:contact@homefy.co.in subject:"bill/receipt"');
      setCategory("Utilities");
      setDueDayOfMonth(9);
      setDefaultAmount((curr) => curr || 1200);
      setName((curr) => curr || "Apartment Water Bill (Homefy)");
      setImageUrl("https://logo.clearbit.com/homefy.co.in");
    } else if (presetId === "UTILITY") {
      setStatementParserModule("GenericUtilityParser");
      setStatementQuery('from:(airtel OR jio OR bescom OR electricity) subject:("Bill" OR "Invoice")');
    }
  };

  // Preset Handlers for Payment
  const applyPaymentPreset = (presetId: string) => {
    setPaymentSource("EMAIL");
    if (presetId === "GRT_JEWELS") {
      setPaymentParserModule("JewellerySchemeParser");
      setPaymentQuery('from:mail@grtjewels.com subject:"GRT JPS Advance payment"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/grtjewels.com");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
    } else if (presetId === "TANISHQ_GOLD") {
      setPaymentParserModule("JewellerySchemeParser");
      setPaymentQuery('from:tanishq.co.in subject:"Golden Harvest"');
      setCategory("Savings & Schemes");
      setImageUrl("https://logo.clearbit.com/tanishq.co.in");
      setIsEndOfMonthDue(true);
      setAllowSkip(true);
      setDedupStrategy("SAME_DAY_SAME_AMOUNT");
    } else if (presetId === "AIRTEL_RECEIPT") {
      setPaymentParserModule("AirtelPostpaidParser");
      setPaymentQuery('from:update@airtel.com subject:"payment receipt"');
      setCategory("Utilities");
      setName((n) => n || "Airtel Postpaid");
      setImageUrl("https://logo.clearbit.com/airtel.in");
    } else if (presetId === "AIRTEL_OTT") {
      setPaymentParserModule("GenericUtilityParser");
      setPaymentQuery('from:ebill@airtel.com subject:"Invoice Generated"');
      setImageUrl("https://logo.clearbit.com/airtel.in");
    } else if (presetId === "AMAZON_PAY") {
      setPaymentParserModule("ICICICardParser");
      setPaymentQuery('from:no-reply@amazonpay.in subject:"Bill payment"');
      setImageUrl("https://logo.clearbit.com/amazon.in");
    } else if (presetId === "HDFC_UPI_GPAY") {
      setPaymentParserModule("UPIPaymentParser");
      setPaymentParserConfig((prev) => ({ ...prev, vpaFilter: "gpay-creditcard@okpayaxis" }));
      setPaymentQuery('from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "HDFC_UPI_VPA") {
      setPaymentParserModule("UPIPaymentParser");
      setPaymentQuery('from:alerts@hdfcbank.bank.in "VPA"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "HDFC_DIRECT") {
      setPaymentParserModule("HDFCCardParser");
      setPaymentQuery('from:alerts@hdfcbank.net subject:"Payment Received"');
      setImageUrl("https://logo.clearbit.com/hdfcbank.com");
    } else if (presetId === "AXIS_DIRECT") {
      setPaymentParserModule("AxisCardParser");
      setPaymentQuery('from:alerts@axisbank.com subject:"Payment received"');
      setImageUrl("https://logo.clearbit.com/axisbank.com");
    } else if (presetId === "ICICI_DIRECT") {
      setPaymentParserModule("ICICICardParser");
      setPaymentQuery('from:alerts@icicibank.com subject:"Payment received"');
      setImageUrl("https://logo.clearbit.com/icicibank.com");
    } else if (presetId === "SBI_DIRECT") {
      setPaymentParserModule("SBICardParser");
      setPaymentQuery('from:feedback@sbicard.com subject:"Payment Confirmation"');
      setImageUrl("https://logo.clearbit.com/sbicard.com");
    } else if (presetId === "HOMEFY_WATER") {
      setPaymentParserModule("HomefyParser");
      setPaymentQuery('from:contact@homefy.co.in subject:"bill/receipt"');
      setCategory("Utilities");
      setDueDayOfMonth(9);
      setDefaultAmount((curr) => curr || 1200);
      setName((curr) => curr || "Apartment Water Bill (Homefy)");
      setImageUrl("https://logo.clearbit.com/homefy.co.in");
    } else if (presetId === "UTILITY_RECEIPT") {
      setPaymentParserModule("GenericUtilityParser");
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

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const isSmsAutomated = statementSource === "SMS" || paymentSource === "SMS";
      const isEmailAutomated =
        statementSource === "EMAIL" || paymentSource === "EMAIL" || paymentSource === "PREPAID_INVOICE";

      const billingType: BillingType =
        statementSource === "EMAIL" || statementSource === "SMS" ? "BILL_GENERATED" : "FIXED_TENURE";

      const source: SourceType =
        isEmailAutomated && isSmsAutomated
          ? "EMAIL_AUTOMATED"
          : isSmsAutomated
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
            statementParserModule:
              statementSource === "EMAIL" || statementSource === "SMS" ? statementParserModule : undefined,
            statementParserConfig:
              (statementSource === "EMAIL" || statementSource === "SMS") &&
              Object.keys(statementParserConfig).length > 0
                ? statementParserConfig
                : undefined,
            paymentParserModule:
              paymentSource === "EMAIL" || paymentSource === "SMS" ? paymentParserModule : undefined,
            paymentParserConfig:
              (paymentSource === "EMAIL" || paymentSource === "SMS") &&
              Object.keys(paymentParserConfig).length > 0
                ? paymentParserConfig
                : undefined,
            // Fallback for legacy
            parserModule: statementParserModule || paymentParserModule || "UniversalAutoParser",
            customRegex:
              statementParserModule === "CustomRegexParser" || paymentParserModule === "CustomRegexParser"
                ? customRegex
                : undefined,
          }
        : undefined;

      const smsConfig = isSmsAutomated
        ? {
            enabled: true,
            senderQuery: (paymentSource === "SMS" ? paymentSmsSender : statementSmsSender).trim(),
            filterKeywords: (paymentSource === "SMS" ? paymentSmsKeywords : statementSmsKeywords)
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
            accountOrLoanDigits:
              (paymentSource === "SMS" ? paymentSmsDigits : statementSmsDigits).trim() || undefined,
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
                  <option value="Loans & EMIs">🏦 Loans & EMIs (Home Loan, Auto, Personal, Recovery)</option>
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
                    : "Amount per Cycle (₹) (Optional)"}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00 (Optional if variable)"
                  value={defaultAmount || ""}
                  onChange={(e) => setDefaultAmount(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white focus:border-cyan-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {statementSource === "EMAIL"
                    ? "Updated automatically when bill/invoice email is synced."
                    : "Default or estimated installment. Leave blank if amount varies and resolves upon receipt."}
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

          {/* Section 2: Statement / Bill Invoice */}
          <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-950/30 to-slate-900/50 p-4 sm:p-5 space-y-4">
            {/* Header with Step 1: Source */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <span>📄</span> 2. Statement / Bill Invoice
                </span>
                <span className="text-[11px] text-slate-400">
                  Where does the billing invoice or statement come from?
                </span>
              </div>

              {/* 1. Source Pills */}
              <div className="flex items-center rounded-xl bg-slate-950/80 p-1 border border-white/10 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setStatementSource("EMAIL")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    statementSource === "EMAIL"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>✉️</span> Gmail
                </button>
                <button
                  type="button"
                  onClick={() => setStatementSource("SMS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    statementSource === "SMS"
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>💬</span> SMS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatementSource("MANUAL");
                    setStatementQuery("");
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    statementSource === "MANUAL"
                      ? "bg-white/10 text-white border border-white/20 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>✋</span> Manual (Fixed)
                </button>
              </div>
            </div>

            {/* 2. Query Filters based on Source */}
            {statementSource === "EMAIL" ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Gmail Search Query Filter
                  </label>
                  <span className="text-[10px] text-cyan-300">Discovers new bill statements</span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { id: "AIRTEL_POSTPAID", label: "📱 Airtel Postpaid" },
                    { id: "GRT_JEWELS", label: "GRT Gold Scheme" },
                    { id: "TANISHQ_GOLD", label: "Tanishq Gold" },
                    { id: "HOMEFY_WATER", label: "🏠 Homefy Water" },
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
            ) : statementSource === "SMS" ? (
              <div className="space-y-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 block">
                  SMS Search & Match Filters
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Sender Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HDFCBK, AIRTEL"
                      value={statementSmsSender}
                      onChange={(e) => setStatementSmsSender(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Account / Card Digits (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 7890"
                      value={statementSmsDigits}
                      onChange={(e) => setStatementSmsDigits(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Filter Keywords
                    </label>
                    <input
                      type="text"
                      placeholder="bill, due, statement"
                      value={statementSmsKeywords}
                      onChange={(e) => setStatementSmsKeywords(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-teal-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400">
                No automated statement search. Expected amount will use the <strong>Amount per Cycle (₹{defaultAmount || 0})</strong>.
              </div>
            )}

            {/* 3. Statement Parser Engine: Auto-Detect or Specific */}
            {(statementSource === "EMAIL" || statementSource === "SMS") && (
              <div className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-200">
                      Statement Parser Engine
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Select Auto-Detect or a dedicated parser tuned for this provider
                    </span>
                  </div>

                  {onOpenTestSandbox && (
                    <button
                      type="button"
                      onClick={onOpenTestSandbox}
                      className="text-[10px] font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      🧪 Test Sandbox
                    </button>
                  )}
                </div>

                <select
                  value={statementParserModule}
                  onChange={(e) => handleSelectStatementParser(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <optgroup label="Auto Detection">
                    <option value="UniversalAutoParser">🪄 Universal Auto-Detect (Auto Cascading Rules)</option>
                  </optgroup>
                  <optgroup label="Specific Specialized Parsers">
                    <option value="AirtelPostpaidParser">📱 Airtel Postpaid Mobile & Broadband (AirtelPostpaidParser)</option>
                    <option value="AxisCardParser">💳 Axis Bank Credit Card (AxisCardParser)</option>
                    <option value="HDFCCardParser">💳 HDFC Bank Credit Card (HDFCCardParser)</option>
                    <option value="ICICICardParser">💳 ICICI Bank & Amazon Pay Card (ICICICardParser)</option>
                    <option value="SBICardParser">💳 SBI Credit Card (SBICardParser)</option>
                    <option value="HomefyParser">🏠 Homefy Community Water & Maintenance (HomefyParser)</option>
                    <option value="JewellerySchemeParser">💍 Jewellery Scheme - GRT / Tanishq (JewellerySchemeParser)</option>
                    <option value="GenericUtilityParser">🛠️ Generic Telecom & Utility (GenericUtilityParser)</option>
                    <option value="CustomRegexParser">🧪 Custom Regex Pattern - Advanced (CustomRegexParser)</option>
                  </optgroup>
                </select>

                {/* Parser Description */}
                {(() => {
                  const selected = availableParsers.find((p) => p.id === statementParserModule) || availableParsers[0];
                  return selected ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                      <span className="text-[11px] text-slate-300 flex-1">{selected.description}</span>
                      {selected.sampleStatementQuery && statementSource === "EMAIL" && (
                        <button
                          type="button"
                          onClick={() => setStatementQuery(selected.sampleStatementQuery)}
                          className="text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer self-start sm:self-auto"
                        >
                          ⚡ Set Sample Query
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Dynamic Statement Parser Config Fields */}
                {(() => {
                  const selected = availableParsers.find((p) => p.id === statementParserModule);
                  if (!selected?.configFields || selected.configFields.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/40 p-2.5 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300 block">
                        ⚙️ Additional Parser Configuration & Filters
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selected.configFields.map((field) => (
                          <div key={field.key} className="space-y-0.5">
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                              {field.label}
                            </label>
                            <input
                              type="text"
                              placeholder={field.placeholder || ""}
                              value={statementParserConfig[field.key] || ""}
                              onChange={(e) =>
                                setStatementParserConfig((prev) => ({
                                  ...prev,
                                  [field.key]: e.target.value,
                                }))
                              }
                              className="w-full min-h-[34px] font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                            />
                            {field.description && (
                              <span className="text-[9px] text-slate-400 block">{field.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Custom Regex Pattern for Statement */}
                {statementParserModule === "CustomRegexParser" && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/40 p-2.5 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                      🧪 Custom Regex (Statement)
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300">Statement Amount Pattern</label>
                        <input
                          type="text"
                          placeholder='e.g. Total Due:\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)'
                          value={customRegex.statementAmountPattern || ""}
                          onChange={(e) => setCustomRegex((prev) => ({ ...prev, statementAmountPattern: e.target.value }))}
                          className="w-full font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-300">Statement Due Date Pattern</label>
                        <input
                          type="text"
                          placeholder='e.g. Due Date:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})'
                          value={customRegex.statementDueDatePattern || ""}
                          onChange={(e) => setCustomRegex((prev) => ({ ...prev, statementDueDatePattern: e.target.value }))}
                          className="w-full font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Payment Confirmation */}
          <div className="rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-950/30 to-slate-900/50 p-4 sm:p-5 space-y-4">
            {/* Header with Step 1: Source */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
                  <span>💳</span> 3. Payment Confirmation
                </span>
                <span className="text-[11px] text-slate-400">
                  How should debits & payments be matched and reconciled?
                </span>
              </div>

              {/* 1. Source Pills */}
              <div className="flex items-center rounded-xl bg-slate-950/80 p-1 border border-white/10 self-start sm:self-auto">
                {isPrepaid && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentSource("PREPAID_INVOICE");
                      setPaymentQuery("");
                    }}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                      paymentSource === "PREPAID_INVOICE"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <span>⚡</span> Prepaid / Invoice
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPaymentSource("EMAIL")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    paymentSource === "EMAIL"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>✉️</span> Gmail
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource("SMS")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    paymentSource === "SMS"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>💬</span> SMS
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentSource("MANUAL");
                    setPaymentQuery("");
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1 ${
                    paymentSource === "MANUAL"
                      ? "bg-white/10 text-white border border-white/20 shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>✋</span> Manual
                </button>
              </div>
            </div>

            {/* 2. Query Filters based on Source */}
            {paymentSource === "PREPAID_INVOICE" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                <span className="font-bold flex items-center gap-1 mb-0.5">
                  <span>⚡</span> Auto-Settled Upon Invoice Receipt
                </span>
                <p className="text-[11px] text-slate-300">
                  Because this is a prepaid subscription, the invoice in Section 2 is also the payment confirmation. Each detected bill is automatically recorded as <strong>Fully Paid</strong>.
                </p>
              </div>
            ) : paymentSource === "EMAIL" ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Gmail Search Query Filter
                  </label>
                  <span className="text-[10px] text-indigo-300">Matches debit alerts & receipts</span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-slate-400 mr-1">Presets:</span>
                  {[
                    { id: "AIRTEL_RECEIPT", label: "📱 Airtel Receipt" },
                    { id: "HOMEFY_WATER", label: "🏠 Homefy Water Bill" },
                    { id: "GRT_JEWELS", label: "GRT Gold Scheme" },
                    { id: "TANISHQ_GOLD", label: "Tanishq Gold" },
                    { id: "AMAZON_PAY", label: "Amazon Pay" },
                    { id: "HDFC_UPI_VPA", label: "HDFC UPI (VPA)" },
                    { id: "HDFC_UPI_GPAY", label: "HDFC UPI (GPay)" },
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
                  placeholder='from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"'
                  value={paymentQuery}
                  onChange={(e) => setPaymentQuery(e.target.value)}
                  className="w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3.5 py-2 text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 block">
                  Example: <code className="text-indigo-300 font-mono">from:alerts@hdfcbank.bank.in "gpay-creditcard@okpayaxis"</code>
                </span>
              </div>
            ) : paymentSource === "SMS" ? (
              <div className="space-y-3">
                {/* Loan Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Presets:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentSmsSender("BOI");
                      setPaymentSmsKeywords("Loan Rec, Debited(TRF), Debited");
                      setCategory("Loans & EMIs");
                      setName((n) => n || "Bank of India Home Loan");
                      setImageUrl("https://logo.clearbit.com/bankofindia.co.in");
                    }}
                    className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-300 hover:bg-teal-500/20 cursor-pointer"
                  >
                    🏦 BOI Home Loan
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentSmsSender("HDFCBK");
                      setPaymentSmsKeywords("Home Loan, LN RECOVERY");
                      setCategory("Loans & EMIs");
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
                      setPaymentSmsSender("SBIINB");
                      setPaymentSmsKeywords("LOAN A/C, transfer to LOAN");
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
                      setPaymentSmsSender("ICICIB");
                      setPaymentSmsKeywords("Loan Account, towards EMI");
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
                      setPaymentSmsSender("BAJAJ");
                      setPaymentSmsKeywords("EMI, debited");
                      setCategory("Services");
                      setName((n) => n || "Bajaj Finserv Loan");
                      setImageUrl("https://logo.clearbit.com/bajajfinserv.in");
                    }}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    💳 Bajaj Finserv EMI
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Bank Sender Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. HDFCBK, SBIINB"
                      value={paymentSmsSender}
                      onChange={(e) => setPaymentSmsSender(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Loan / Account Digits (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 7890"
                      value={paymentSmsDigits}
                      onChange={(e) => setPaymentSmsDigits(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Filter Keywords
                    </label>
                    <input
                      type="text"
                      placeholder="loan, emi, recovery, debited"
                      value={paymentSmsKeywords}
                      onChange={(e) => setPaymentSmsKeywords(e.target.value)}
                      className="mt-1 w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400">
                Manual reconciliation. Mark payment status directly from the dashboard.
              </div>
            )}

            {/* 3. Payment Parser Engine: Auto-Detect or Specific */}
            {(paymentSource === "EMAIL" || paymentSource === "SMS") && (
              <div className="rounded-xl border border-indigo-500/20 bg-slate-950/60 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-indigo-200">
                      Payment Parser Engine
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Select Auto-Detect or a dedicated parser for your bank/payment mode
                    </span>
                  </div>

                  {onOpenTestSandbox && (
                    <button
                      type="button"
                      onClick={onOpenTestSandbox}
                      className="text-[10px] font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      🧪 Test Sandbox
                    </button>
                  )}
                </div>

                <select
                  value={paymentParserModule}
                  onChange={(e) => handleSelectPaymentParser(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                >
                  <optgroup label="Auto Detection">
                    <option value="UniversalAutoParser">🪄 Universal Auto-Detect (Auto Cascading Rules)</option>
                  </optgroup>
                  <optgroup label="Specific Specialized Parsers">
                    <option value="UPIPaymentParser">⚡ UPI Payment Alert Parser - GPay/CRED/HDFC (UPIPaymentParser)</option>
                    <option value="HDFCCardParser">💳 HDFC Bank Card & UPI Alert (HDFCCardParser)</option>
                    <option value="AirtelPostpaidParser">📱 Airtel Payment Receipt (AirtelPostpaidParser)</option>
                    <option value="ICICICardParser">💳 ICICI Bank Payment Receipt (ICICICardParser)</option>
                    <option value="AxisCardParser">💳 Axis Bank Payment Alert (AxisCardParser)</option>
                    <option value="SBICardParser">💳 SBI Card Payment Confirmation (SBICardParser)</option>
                    <option value="HomefyParser">🏠 Homefy Water Payment Receipt (HomefyParser)</option>
                    <option value="JewellerySchemeParser">💍 Jewellery Scheme Receipt - GRT / Tanishq (JewellerySchemeParser)</option>
                    <option value="GenericUtilityParser">🛠️ Generic Telecom & Utility Receipt (GenericUtilityParser)</option>
                    <option value="CustomRegexParser">🧪 Custom Regex Pattern - Advanced (CustomRegexParser)</option>
                  </optgroup>
                </select>

                {/* Parser Description */}
                {(() => {
                  const selected = availableParsers.find((p) => p.id === paymentParserModule) || availableParsers[0];
                  return selected ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-xs">
                      <span className="text-[11px] text-slate-300 flex-1">{selected.description}</span>
                      {selected.samplePaymentQuery && paymentSource === "EMAIL" && (
                        <button
                          type="button"
                          onClick={() => setPaymentQuery(selected.samplePaymentQuery)}
                          className="text-[10px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer self-start sm:self-auto"
                        >
                          ⚡ Set Sample Query
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Dynamic Payment Parser Config Fields */}
                {(() => {
                  const selected = availableParsers.find((p) => p.id === paymentParserModule);
                  if (!selected?.configFields || selected.configFields.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-indigo-500/20 bg-indigo-950/40 p-2.5 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">
                        ⚙️ Additional Parser Configuration (e.g. VPA Filter)
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {selected.configFields.map((field) => (
                          <div key={field.key} className="space-y-0.5">
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                              {field.label}
                            </label>
                            <input
                              type="text"
                              placeholder={field.placeholder || ""}
                              value={paymentParserConfig[field.key] || ""}
                              onChange={(e) =>
                                setPaymentParserConfig((prev) => ({
                                  ...prev,
                                  [field.key]: e.target.value,
                                }))
                              }
                              className="w-full min-h-[34px] font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 focus:border-indigo-400 focus:outline-none"
                            />
                            {field.description && (
                              <span className="text-[9px] text-slate-400 block">{field.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Custom Regex Pattern for Payment */}
                {paymentParserModule === "CustomRegexParser" && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/40 p-2.5 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 block">
                      🧪 Custom Regex (Payment)
                    </span>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-300">Payment Amount Pattern</label>
                      <input
                        type="text"
                        placeholder='e.g. Paid amount:\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)'
                        value={customRegex.paymentAmountPattern || ""}
                        onChange={(e) => setCustomRegex((prev) => ({ ...prev, paymentAmountPattern: e.target.value }))}
                        className="w-full font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. Duplicate Prevention Setting */}
            {(paymentSource === "EMAIL" || paymentSource === "SMS") && (
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
