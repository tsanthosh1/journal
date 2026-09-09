"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
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
import { ParserConfigFields } from "./modal/ParserConfigFields";
import { useAuth } from "@/context/AuthContext";
import { authFetch } from "@/lib/authFetch";
import {
  Calendar,
  Zap,
  FileText,
  CreditCard,
  Building2,
  Droplets,
  Lock,
  Hand,
  FlaskConical,
  Lightbulb,
  Shield,
  Target,
  Plus,
  Landmark,
} from "lucide-react";

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
  const { user } = useAuth();
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
  const [statementDayOfMonth, setStatementDayOfMonth] = useState<number | string>("");
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
  // Statement Source: "EMAIL" | "SMS" | "FIXED" | "MANUAL" | "TNEB" | "APARTMENT" | "APARTMENT_MAINTENANCE" | "APARTMENT_WATER" | "CHENNAI_WATER"
  const [statementSource, setStatementSource] = useState<
    | "EMAIL"
    | "SMS"
    | "FIXED"
    | "MANUAL"
    | "TNEB"
    | "APARTMENT"
    | "APARTMENT_MAINTENANCE"
    | "APARTMENT_WATER"
    | "CHENNAI_WATER"
  >("EMAIL");
  const [statementQuery, setStatementQuery] = useState("");
  const [apartmentCategory, setApartmentCategory] = useState("Maintenance Bill");
  const [chennaiWaterBillNo, setChennaiWaterBillNo] = useState("");
  const [statementSmsSender, setStatementSmsSender] = useState("");
  const [statementSmsKeywords, setStatementSmsKeywords] = useState("bill, due, statement");
  const [statementSmsDigits, setStatementSmsDigits] = useState("");

  // TNEB Integration State
  const [tnebConsumerNo, setTnebConsumerNo] = useState("");
  const [tnebTrackedList, setTnebTrackedList] = useState<Array<{ consumerNumber: string; nickname?: string; name?: string }>>([]);

  // Payment Source: "EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL" | "APARTMENT" | "TNEB" | "CHENNAI_WATER"
  const [paymentSource, setPaymentSource] = useState<
    "EMAIL" | "SMS" | "PREPAID_INVOICE" | "MANUAL" | "APARTMENT" | "TNEB" | "CHENNAI_WATER"
  >("EMAIL");
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
      const initStmtDay =
        typeof initialData.statementDayOfMonth === "number"
          ? initialData.statementDayOfMonth
          : typeof initialData.statementDate === "number"
          ? initialData.statementDate
          : initialData.statementDate || "";
      setStatementDayOfMonth(initStmtDay);
      setIsEndOfMonthDue(Boolean(initialData.isEndOfMonthDue));
      setAllowSkip(Boolean(initialData.allowSkip));
      setDedupStrategy(
        (initialData.dedupStrategy as DedupStrategy) ||
          (initialData.emailConfig?.dedupStrategy as DedupStrategy) ||
          (initialData.smsConfig?.dedupStrategy as DedupStrategy) ||
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

      if (initialData.source === "APARTMENT_MODULE" || initialData.apartmentConfig) {
        let catFilter = initialData.apartmentConfig?.categoryFilter;
        if (!catFilter) {
          if ((initialData.name || "").toLowerCase().includes("water") || (initialData.name || "").toLowerCase().includes("corpus")) {
            catFilter = "Water Bill";
          } else {
            catFilter = "Maintenance Bill";
          }
        }
        if (catFilter.toLowerCase().includes("water") || catFilter.toLowerCase().includes("corpus")) {
          setStatementSource("APARTMENT_WATER");
        } else {
          setStatementSource("APARTMENT_MAINTENANCE");
        }
        setApartmentCategory(catFilter);
        if (ec?.paymentQuery && ec.paymentQuery.trim().length > 0) {
          setPaymentSource("EMAIL");
          setPaymentQuery(ec.paymentQuery);
        } else if (sc?.senderQuery && sc.senderQuery.trim().length > 0) {
          setPaymentSource("SMS");
        } else {
          setPaymentSource("APARTMENT");
        }
      } else if (initialData.source === "CHENNAI_WATER_MODULE" || initialData.chennaiWaterConfig) {
        setStatementSource("CHENNAI_WATER");
        setChennaiWaterBillNo(initialData.chennaiWaterConfig?.billNumber || "");
        if (ec?.paymentQuery && ec.paymentQuery.trim().length > 0) {
          setPaymentSource("EMAIL");
          setPaymentQuery(ec.paymentQuery);
        } else if (sc?.senderQuery && sc.senderQuery.trim().length > 0) {
          setPaymentSource("SMS");
        } else {
          setPaymentSource("CHENNAI_WATER");
        }
      } else if (initialData.source === "TNEB_MODULE" || initialData.tnebConfig?.consumerNumber) {
        setStatementSource("TNEB");
        setTnebConsumerNo(initialData.tnebConfig?.consumerNumber || "");
        if (ec?.paymentQuery && ec.paymentQuery.trim().length > 0) {
          setPaymentSource("EMAIL");
          setPaymentQuery(ec.paymentQuery);
        } else if (sc?.senderQuery && sc.senderQuery.trim().length > 0) {
          setPaymentSource("SMS");
        } else {
          setPaymentSource("TNEB");
        }
      } else {
        const isFixedTenure =
          initialData.billingType === "FIXED_TENURE" ||
          initialData.category === "Loans & EMIs" ||
          (!ec?.statementQuery && initialData.defaultAmount && initialData.defaultAmount > 0);

        if (isFixedTenure && !ec?.statementQuery) {
          setStatementSource("FIXED");
          setStatementQuery("");
        } else if (ec && ec.enabled && ec.statementQuery && ec.statementQuery.trim().length > 0) {
          setStatementSource("EMAIL");
          setStatementQuery(ec.statementQuery);
        } else {
          setStatementSource("MANUAL");
          setStatementQuery("");
        }

        if (sc && (sc.enabled || initialData.source === "SMS_AUTOMATED")) {
          setPaymentSource("SMS");
          setPaymentSmsSender(sc.senderQuery || "");
          setPaymentSmsKeywords(sc.filterKeywords?.join(", ") || "loan, emi, recovery, debited");
          setPaymentSmsDigits(sc.accountOrLoanDigits || "");
        } else if (ec && ec.enabled && ec.paymentQuery && ec.paymentQuery.trim().length > 0) {
          setPaymentSource("EMAIL");
          setPaymentQuery(ec.paymentQuery);
        } else if (isPre) {
          setPaymentSource("PREPAID_INVOICE");
          setPaymentQuery("");
        } else {
          setPaymentSource("MANUAL");
          setPaymentQuery("");
        }
      }
    } else {
      setName("");
      setCategory("Credit Cards");
      setImageUrl("");
      setBillingCycle("MONTHLY");
      setDefaultAmount(0);
      setIsPrepaid(false);
      setDueDayOfMonth(5);
      setStatementDayOfMonth("");
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

    // Fetch TNEB tracked consumers for dropdown
    authFetch(user, "/api/tneb/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.config?.trackedConsumers) {
          setTnebTrackedList(data.config.trackedConsumers);
          if (!initialData?.tnebConfig?.consumerNumber && data.config.trackedConsumers.length > 0) {
            setTnebConsumerNo(data.config.trackedConsumers[0].consumerNumber);
          }
        }
      })
      .catch(() => {});
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleTimingModelChange = (prepaid: boolean) => {
    setIsPrepaid(prepaid);
    if (prepaid) {
      if (
        paymentSource !== "EMAIL" &&
        paymentSource !== "APARTMENT" &&
        paymentSource !== "TNEB" &&
        paymentSource !== "CHENNAI_WATER"
      ) {
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
      setStatementQuery('from:google-pay-noreply@google.com "Airtel Mobile Postpaid"');
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
      const isApartmentMaintenance = statementSource === "APARTMENT_MAINTENANCE";
      const isApartmentWater = statementSource === "APARTMENT_WATER";
      const isApartmentSource = isApartmentMaintenance || isApartmentWater || statementSource === "APARTMENT" || paymentSource === "APARTMENT";
      const isChennaiWaterSource = statementSource === "CHENNAI_WATER" || paymentSource === "CHENNAI_WATER";
      const isTnebSource = statementSource === "TNEB" || paymentSource === "TNEB";
      const isSmsAutomated = statementSource === "SMS" || paymentSource === "SMS";
      const isEmailAutomated = statementSource === "EMAIL" || paymentSource === "EMAIL" || paymentSource === "PREPAID_INVOICE";

      const billingType: BillingType =
        statementSource === "FIXED" || category === "Loans & EMIs"
          ? "FIXED_TENURE"
          : "BILL_GENERATED";

      const source: SourceType = isApartmentSource
        ? "APARTMENT_MODULE"
        : isChennaiWaterSource
        ? "CHENNAI_WATER_MODULE"
        : isTnebSource
        ? "TNEB_MODULE"
        : isEmailAutomated && isSmsAutomated
        ? "EMAIL_AUTOMATED"
        : isSmsAutomated
        ? "SMS_AUTOMATED"
        : isEmailAutomated
        ? "EMAIL_AUTOMATED"
        : "MANUAL";

      const apartmentConfig = isApartmentSource
        ? {
            categoryFilter: isApartmentWater
              ? (apartmentCategory || "Water Bill")
              : (apartmentCategory || "Maintenance Bill"),
            autoSyncWithApartmentModule: true,
          }
        : undefined;

      const chennaiWaterConfig = isChennaiWaterSource
        ? {
            billNumber: chennaiWaterBillNo.trim(),
            existingBillNumber: "",
            componentType: "TAX_AND_CHARGES" as const,
            autoSyncWithMetroWaterModule: true,
          }
        : undefined;

      const tnebConfig = isTnebSource
        ? {
            consumerNumber: tnebConsumerNo.trim(),
            nickname: name.trim(),
            autoSyncWithEbModule: true,
          }
        : undefined;

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
        billingCycle: isChennaiWaterSource ? "HALF_YEARLY" : isTnebSource ? "CUSTOM" : billingCycle,
        isPrepaid: isTnebSource || isChennaiWaterSource ? false : isPrepaid,
        dueDayOfMonth: isPrepaid ? undefined : isEndOfMonthDue ? undefined : Number(dueDayOfMonth) || 5,
        statementDayOfMonth:
          statementDayOfMonth !== "" && !isNaN(Number(statementDayOfMonth))
            ? Math.min(31, Math.max(1, Number(statementDayOfMonth)))
            : undefined,
        isEndOfMonthDue: isPrepaid ? false : isEndOfMonthDue,
        allowSkip,
        dedupStrategy,
        emailConfig,
        smsConfig,
        tnebConfig,
        apartmentConfig,
        chennaiWaterConfig,
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
                  <option value="Loans & EMIs">Loans & EMIs (Home Loan, Auto, Personal, Recovery)</option>
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
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Postpaid / Due Date Driven</span>
                  </span>
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
                  <span className="inline-flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Prepaid / Instant Renewal</span>
                  </span>
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

                {/* Statement Date (Optional Day of Month) */}
                <div className="mt-3 pt-3 border-t border-white/5">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Statement Date (Optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    placeholder="e.g. 15 (Day of Month 1-31)"
                    value={statementDayOfMonth}
                    onChange={(e) => setStatementDayOfMonth(e.target.value ? parseInt(e.target.value, 10) : "")}
                    className="mt-1 w-full min-h-[40px] rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Day of month bill arrives. Displays &ldquo;Next statement in n days&rdquo; on the home tab when previous cycle has ended.
                  </span>
                </div>
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
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Due on last day of month (28th-31st)</span>
                      </span>
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
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>Prepaid Service</span>
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
                  <FileText className="w-3.5 h-3.5 text-cyan-300" />
                  <span>2. Statement / Bill Invoice</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Where does the billing invoice or statement come from?
                </span>
              </div>

              {/* 1. Source Dropdown */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <label className="text-xs text-slate-300 font-semibold">Source:</label>
                <select
                  value={statementSource}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setStatementSource(val);
                    if (val === "APARTMENT_MAINTENANCE") {
                      setCategory("Housing & Rent");
                      setBillingCycle("QUARTERLY");
                      setApartmentCategory("Maintenance Bill");
                      setName((curr) => (!curr || curr.includes("Apartment") ? "Apartment Maintenance" : curr));
                      setPaymentSource("APARTMENT");
                    } else if (val === "APARTMENT_WATER") {
                      setCategory("Housing & Rent");
                      setBillingCycle("MONTHLY");
                      setApartmentCategory("Water Bill");
                      setName((curr) => (!curr || curr.includes("Apartment") ? "Apartment Water & Corpus" : curr));
                      setPaymentSource("APARTMENT");
                    } else if (val === "APARTMENT") {
                      setCategory("Housing & Rent");
                      setName((curr) => curr || "Apartment Maintenance");
                      setPaymentSource("APARTMENT");
                    } else if (val === "CHENNAI_WATER") {
                      setCategory("Utilities");
                      setBillingCycle("HALF_YEARLY");
                      setName((curr) => curr || "Chennai Metro Water (CMWSSB)");
                      setImageUrl("https://upload.wikimedia.org/wikipedia/commons/8/81/TamilNadu_Logo.svg");
                      setPaymentSource("CHENNAI_WATER");
                    } else if (val === "TNEB") {
                      setCategory("Utilities");
                      setBillingCycle("CUSTOM");
                      setName((curr) => curr || "Tamil Nadu Electricity Board (TNEB)");
                      setImageUrl("https://upload.wikimedia.org/wikipedia/commons/8/81/TamilNadu_Logo.svg");
                      setPaymentSource("TNEB");
                    } else if (val === "FIXED") {
                      setStatementQuery("");
                    } else if (val === "MANUAL") {
                      setStatementQuery("");
                    }
                  }}
                  className="min-h-[38px] rounded-xl border border-cyan-500/30 bg-slate-950 px-3.5 py-1.5 text-xs font-bold text-cyan-300 focus:border-cyan-400 focus:outline-none cursor-pointer shadow-lg shadow-cyan-950/20"
                >
                  <option value="APARTMENT_MAINTENANCE">Apartment Maintenance (Quarterly)</option>
                  <option value="APARTMENT_WATER">Apartment Water & Corpus (Monthly)</option>
                  <option value="CHENNAI_WATER">Metro Water (CMWSSB)</option>
                  <option value="TNEB">TNEB Portal (EB Bills)</option>
                  <option value="EMAIL">Gmail (E-Statement Query)</option>
                  <option value="SMS">SMS (Bill / Debit SMS)</option>
                  <option value="FIXED">Fixed Amount (Loans / EMIs)</option>
                  <option value="MANUAL">Manual (No External Statement)</option>
                </select>
              </div>
            </div>

            {/* 2. Query Filters based on Source */}
            {statementSource === "APARTMENT_MAINTENANCE" ? (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs">
                      <Building2 className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-indigo-300 text-xs">
                      Apartment Maintenance Source (Homefy)
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-400/80 font-mono">Quarterly Maintenance</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Linked to your active flat community maintenance bills in Homefy. Automatically syncs society quarterly maintenance charges, due dates, paid proofs, and receipts.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Bill Category *
                    </label>
                    <select
                      value={apartmentCategory}
                      onChange={(e) => {
                        setApartmentCategory(e.target.value);
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                    >
                      <option value="Maintenance Bill">Maintenance Bill (Quarterly)</option>
                      <option value="ALL">All Bills Combined</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/apartment"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline pb-2"
                    >
                      <span>Open Apartment Dashboard ↗</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : statementSource === "APARTMENT_WATER" ? (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 font-bold text-xs">
                      <Droplets className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-cyan-300 text-xs">
                      Apartment Water & Corpus Source (Homefy)
                    </span>
                  </div>
                  <span className="text-[10px] text-cyan-400/80 font-mono">Monthly Water & Sinking Fund</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Linked to your flat monthly water meter reading bills and corpus fund dues in Homefy. Reconciles usage charges, due dates, paid proofs, and receipts.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Bill Category *
                    </label>
                    <select
                      value={apartmentCategory}
                      onChange={(e) => {
                        setApartmentCategory(e.target.value);
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                    >
                      <option value="Water Bill">Water & Corpus Combined</option>
                      <option value="Corpus Fund">Corpus Fund Only</option>
                      <option value="ALL">All Bills Combined</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/apartment"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 underline pb-2"
                    >
                      <span>Open Apartment Dashboard ↗</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : statementSource === "APARTMENT" ? (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs">
                      <Building2 className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-indigo-300 text-xs">
                      Homefy Apartment Management Source
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-400/80 font-mono">Society Bills</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Linked to your active flat community bills in the Apartment Management module. Automatically retrieves bills, charges, due dates, paid proofs, and receipts in real time.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Bill Category *
                    </label>
                    <select
                      value={apartmentCategory}
                      onChange={(e) => {
                        setApartmentCategory(e.target.value);
                        if (!name || name.includes("Apartment")) {
                          setName(e.target.value === "ALL" ? "Apartment - All Bills" : `Apartment - ${e.target.value}`);
                        }
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                    >
                      <option value="Maintenance Bill">Maintenance Bill (Quarterly)</option>
                      <option value="Water Bill">Water Bill (Monthly)</option>
                      <option value="Corpus Fund">Corpus Fund</option>
                      <option value="ALL">All Bills Combined</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/apartment"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline pb-2"
                    >
                      <span>Open Apartment Dashboard ↗</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : statementSource === "CHENNAI_WATER" ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 font-bold text-xs">
                      <Droplets className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-sky-300 text-xs">
                      Chennai Metro Water (CMWSSB) Module Source
                    </span>
                  </div>
                  <span className="text-[10px] text-sky-400/80 font-mono">Half-Yearly Assessment</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Linked directly to your Chennai Metro Water & Sewerage Board property profile. Automatically retrieves half-yearly water tax assessments, usage charges, and payment receipts from the portal.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      New Bill Number (Area-Division-Bill) *
                    </label>
                    <input
                      type="text"
                      value={chennaiWaterBillNo}
                      onChange={(e) => setChennaiWaterBillNo(e.target.value)}
                      placeholder="15-193-097538"
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/chennai-water"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 underline pb-2"
                    >
                      <span>Open Metro Water Dashboard ↗</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : statementSource === "TNEB" ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs">
                      <Zap className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-amber-300 text-xs">
                      Tamil Nadu Electricity Board (TNEB) Module Source
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-400/80 font-mono">Bi-Monthly Assessment</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Linked directly to your TNEB consumer electricity profile. Automatically updates bi-monthly meter readings, units consumed, CC charges, taxes, payment due date, and collection receipts from the TNEB module.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Select Tracked Consumer Number *
                    </label>
                    <select
                      value={tnebConsumerNo}
                      onChange={(e) => {
                        setTnebConsumerNo(e.target.value);
                        const match = tnebTrackedList.find((t) => t.consumerNumber === e.target.value);
                        if (match && match.nickname) {
                          setName(`TNEB - ${match.nickname}`);
                        } else {
                          setName(`TNEB EB #${e.target.value}`);
                        }
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white focus:border-amber-400 focus:outline-none cursor-pointer"
                    >
                      {tnebTrackedList.map((t) => (
                        <option key={t.consumerNumber} value={t.consumerNumber}>
                          #{t.consumerNumber} {t.nickname ? `(${t.nickname})` : ""}
                        </option>
                      ))}
                      {!tnebTrackedList.some((t) => t.consumerNumber === tnebConsumerNo) && (
                        <option value={tnebConsumerNo}>
                          {tnebConsumerNo ? `#${tnebConsumerNo} (Custom)` : "-- Select or enter consumer number --"}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Or Enter Consumer Number
                    </label>
                    <input
                      type="text"
                      value={tnebConsumerNo}
                      onChange={(e) => setTnebConsumerNo(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="e.g. 09299011890"
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : statementSource === "FIXED" ? (
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-xs">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Fixed Commitment / Loan EMI</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  The statement amount is constant every cycle (e.g. Home Loan EMI). The system automatically uses the set{" "}
                  <strong className="text-white">Amount per Cycle (₹{defaultAmount || 0})</strong> as the exact due amount for every billing cycle without needing an external bill search.
                </p>
              </div>
            ) : statementSource === "MANUAL" ? (
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs">
                  <Hand className="w-3.5 h-3.5 text-slate-300" />
                  <span>Variable / No External Statement</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  No automated statement email. The system prompts you to &quot;Pay your due&quot; by the due date each cycle, and automatically settles the cycle as soon as your payment confirmation email arrives.
                </p>
              </div>
            ) : null}
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
                    { id: "AIRTEL_POSTPAID", label: "Airtel Postpaid" },
                    { id: "GRT_JEWELS", label: "GRT Gold Scheme" },
                    { id: "TANISHQ_GOLD", label: "Tanishq Gold" },
                    { id: "HOMEFY_WATER", label: "Homefy Water" },
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
                {defaultAmount && Number(defaultAmount) > 0 ? (
                  <>No automated statement search. Expected amount will use the <strong>Amount per Cycle (₹{defaultAmount})</strong>.</>
                ) : (
                  <>No automated statement search. The card will show <strong>&quot;Pay your due&quot;</strong> until reconciled by your payment receipt.</>
                )}
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
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      <FlaskConical className="w-3 h-3 text-cyan-300" />
                      <span>Test Sandbox</span>
                    </button>
                  )}
                </div>

                <select
                  value={statementParserModule}
                  onChange={(e) => handleSelectStatementParser(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-cyan-400 focus:outline-none cursor-pointer"
                >
                  <optgroup label="Auto Detection">
                    <option value="UniversalAutoParser">Universal Auto-Detect (Auto Cascading Rules)</option>
                  </optgroup>
                  <optgroup label="Specific Specialized Parsers">
                    <option value="AirtelPostpaidParser">Google Pay BBPS / Airtel Postpaid (AirtelPostpaidParser)</option>
                    <option value="AxisCardParser">Axis Bank Credit Card (AxisCardParser)</option>
                    <option value="HDFCCardParser">HDFC Bank Credit Card (HDFCCardParser)</option>
                    <option value="ICICICardParser">ICICI Bank & Amazon Pay Card (ICICICardParser)</option>
                    <option value="SBICardParser">SBI Credit Card (SBICardParser)</option>
                    <option value="HomefyParser">Homefy Community Water & Maintenance (HomefyParser)</option>
                    <option value="JewellerySchemeParser">Jewellery Scheme - GRT / Tanishq (JewellerySchemeParser)</option>
                    <option value="GenericUtilityParser">Generic Telecom & Utility (GenericUtilityParser)</option>
                    <option value="CustomRegexParser">Custom Regex Pattern - Advanced (CustomRegexParser)</option>
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
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-300 hover:text-cyan-200 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer self-start sm:self-auto"
                        >
                          <Zap className="w-3 h-3 text-cyan-300" />
                          <span>Set Sample Query</span>
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Dynamic Statement Parser Config Fields */}
                <ParserConfigFields
                  title="Additional Parser Configuration & Filters"
                  accentColor="cyan"
                  fields={availableParsers.find((p) => p.id === statementParserModule)?.configFields}
                  values={statementParserConfig}
                  onChange={(key, val) =>
                    setStatementParserConfig((prev) => ({ ...prev, [key]: val }))
                  }
                />

                {/* Custom Regex Pattern for Statement */}
                {statementParserModule === "CustomRegexParser" && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/40 p-2.5 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <FlaskConical className="w-3.5 h-3.5" /> Custom Regex (Statement)
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
                  <CreditCard className="w-3.5 h-3.5" /> 3. Payment Confirmation
                </span>
                <span className="text-[11px] text-slate-400">
                  How should debits & payments be matched and reconciled?
                </span>
              </div>

              {/* 1. Payment Method Dropdown */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <label className="text-xs text-slate-300 font-semibold">Method:</label>
                <select
                  value={paymentSource}
                  onChange={(e) => {
                    const val = e.target.value as any;
                    setPaymentSource(val);
                    if (val !== "EMAIL") setPaymentQuery("");
                  }}
                  className="min-h-[38px] rounded-xl border border-indigo-500/30 bg-slate-950 px-3.5 py-1.5 text-xs font-bold text-indigo-300 focus:border-indigo-400 focus:outline-none cursor-pointer shadow-lg shadow-indigo-950/20"
                >
                  {(statementSource === "APARTMENT" ||
                    statementSource === "APARTMENT_MAINTENANCE" ||
                    statementSource === "APARTMENT_WATER") && (
                    <option value="APARTMENT">Apartment Portal (Homefy Auto Reconcile)</option>
                  )}
                  {statementSource === "TNEB" && (
                    <option value="TNEB">TNEB Portal (EB Receipts Auto Reconcile)</option>
                  )}
                  {statementSource === "CHENNAI_WATER" && (
                    <option value="CHENNAI_WATER">Metro Water Portal (CMWSSB Auto Reconcile)</option>
                  )}
                  {isPrepaid && (
                    <option value="PREPAID_INVOICE">Prepaid / Invoice (Auto-Settled)</option>
                  )}
                  <option value="EMAIL">Gmail (Debit Alerts & Receipts)</option>
                  <option value="SMS">SMS (Bank Account Debit Alerts)</option>
                  <option value="MANUAL">Manual (Mark Paid & Ledger Overrides)</option>
                </select>
              </div>
            </div>

            {/* 2. Query Filters based on Source */}
            {paymentSource === "APARTMENT" ? (
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 font-bold text-xs">
                      <Building2 className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-indigo-300 text-xs">
                      Apartment Portal (Homefy) Auto-Reconciliation Active
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    Automatic Settlement
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Homefy tracks both billing dues and payment approval status. When your maintenance or water bill is marked as <strong className="text-emerald-300 font-semibold">PAID</strong> or <strong className="text-emerald-300 font-semibold">APPROVAL_PENDING</strong> in Homefy, this subscription cycle is automatically reconciled as <strong className="text-emerald-300 font-semibold">FULLY PAID</strong> with payment date and receipt proof.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Reconcile Category *
                    </label>
                    <select
                      value={apartmentCategory}
                      onChange={(e) => {
                        setApartmentCategory(e.target.value);
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                    >
                      <option value="Maintenance Bill">Maintenance Bill (Quarterly)</option>
                      <option value="Water Bill">Water & Corpus Combined</option>
                      <option value="Corpus Fund">Corpus Fund Only</option>
                      <option value="ALL">All Bills Combined</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/apartment"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 underline pb-2"
                    >
                      <span>Open Apartment Dashboard ↗</span>
                    </Link>
                  </div>
                </div>

                <div className="rounded-lg border border-white/5 bg-slate-900/60 p-2.5 text-[10px] text-slate-400 flex items-start gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Want Email/SMS tracking instead?</strong> If you prefer cross-matching your bank debit receipt email (e.g. from <span className="font-mono text-cyan-300">contact@homefy.co.in</span>) or bank SMS debit alerts, simply switch the <strong>Method</strong> dropdown above to <strong>Gmail</strong> or <strong>SMS</strong>.
                  </span>
                </div>
              </div>
            ) : paymentSource === "TNEB" ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-xs">
                      <Zap className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-amber-300 text-xs">
                      TNEB Portal Collection Receipts Active
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    Automatic Settlement
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  TNEB portal tracks bill payments and online collection receipts automatically. Synced cycles are settled directly from the official TNEB database.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Reconcile Receipts for Consumer *
                    </label>
                    <select
                      value={tnebConsumerNo}
                      onChange={(e) => {
                        setTnebConsumerNo(e.target.value);
                        if (!name || name.startsWith("TNEB")) {
                          const match = tnebTrackedList.find((t) => t.consumerNumber === e.target.value);
                          if (match && match.nickname) {
                            setName(`TNEB - ${match.nickname}`);
                          } else {
                            setName(`TNEB EB #${e.target.value}`);
                          }
                        }
                      }}
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white focus:border-amber-400 focus:outline-none cursor-pointer"
                    >
                      {tnebTrackedList.map((t) => (
                        <option key={t.consumerNumber} value={t.consumerNumber}>
                          #{t.consumerNumber} {t.nickname ? `(${t.nickname})` : ""}
                        </option>
                      ))}
                      {!tnebTrackedList.some((t) => t.consumerNumber === tnebConsumerNo) && (
                        <option value={tnebConsumerNo}>
                          {tnebConsumerNo ? `#${tnebConsumerNo} (Custom)` : "-- Select or enter consumer number --"}
                        </option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Consumer Number
                    </label>
                    <input
                      type="text"
                      value={tnebConsumerNo}
                      onChange={(e) => setTnebConsumerNo(e.target.value)}
                      placeholder="09299011890"
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-amber-500/20 bg-slate-900/60 p-2.5 flex items-center justify-between text-[11px] text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold font-mono">#{tnebConsumerNo}</span>
                    <span className="text-slate-400">matching collection receipts will settle the cycle directly</span>
                  </span>
                  <Link
                    href="/tneb"
                    target="_blank"
                    className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 underline"
                  >
                    <span>View Receipts ↗</span>
                  </Link>
                </div>
              </div>
            ) : paymentSource === "CHENNAI_WATER" ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 font-bold text-xs">
                      <Droplets className="w-3.5 h-3.5" />
                    </span>
                    <span className="font-bold text-sky-300 text-xs">
                      Chennai Metro Water Portal Receipts Active
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                    Automatic Settlement
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  CMWSSB portal records payment receipts against your property assessment. Synced cycles are settled directly from the Metro Water ledger.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
                      Reconcile Receipts for Bill Number *
                    </label>
                    <input
                      type="text"
                      value={chennaiWaterBillNo}
                      onChange={(e) => setChennaiWaterBillNo(e.target.value)}
                      placeholder="15-193-097538"
                      className="mt-1 w-full min-h-[38px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <Link
                      href="/chennai-water"
                      target="_blank"
                      className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 underline pb-2"
                    >
                      <span>Open Metro Water Dashboard ↗</span>
                    </Link>
                  </div>
                </div>
              </div>
            ) : paymentSource === "PREPAID_INVOICE" ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                <span className="font-bold flex items-center gap-1 mb-0.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> Auto-Settled Upon Invoice Receipt
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
                    { id: "AIRTEL_RECEIPT", label: "Airtel Receipt" },
                    { id: "HOMEFY_WATER", label: "Homefy Water Bill" },
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
                    className="inline-flex items-center gap-1 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-[11px] text-teal-300 hover:bg-teal-500/20 cursor-pointer"
                  >
                    <Landmark className="w-3 h-3" /> BOI Home Loan
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
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <Landmark className="w-3 h-3" /> HDFC Home Loan
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
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <Landmark className="w-3 h-3" /> SBI Home Loan
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
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <Landmark className="w-3 h-3" /> ICICI Home Loan
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
                    className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer"
                  >
                    <CreditCard className="w-3 h-3" /> Bajaj Finserv EMI
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
                      className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-lg cursor-pointer"
                    >
                      <FlaskConical className="w-3 h-3" /> Test Sandbox
                    </button>
                  )}
                </div>

                <select
                  value={paymentParserModule}
                  onChange={(e) => handleSelectPaymentParser(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white focus:border-indigo-400 focus:outline-none cursor-pointer"
                >
                  <optgroup label="Auto Detection">
                    <option value="UniversalAutoParser">Universal Auto-Detect (Auto Cascading Rules)</option>
                  </optgroup>
                  <optgroup label="Specific Specialized Parsers">
                    <option value="UPIPaymentParser">UPI Payment Alert Parser - GPay/CRED/HDFC (UPIPaymentParser)</option>
                    <option value="HDFCCardParser">HDFC Bank Card & UPI Alert (HDFCCardParser)</option>
                    <option value="AirtelPostpaidParser">Airtel Payment Receipt (AirtelPostpaidParser)</option>
                    <option value="ICICICardParser">ICICI Bank Payment Receipt (ICICICardParser)</option>
                    <option value="AxisCardParser">Axis Bank Payment Alert (AxisCardParser)</option>
                    <option value="SBICardParser">SBI Card Payment Confirmation (SBICardParser)</option>
                    <option value="HomefyParser">Homefy Water Payment Receipt (HomefyParser)</option>
                    <option value="JewellerySchemeParser">Jewellery Scheme Receipt - GRT / Tanishq (JewellerySchemeParser)</option>
                    <option value="GenericUtilityParser">Generic Telecom & Utility Receipt (GenericUtilityParser)</option>
                    <option value="CustomRegexParser">Custom Regex Pattern - Advanced (CustomRegexParser)</option>
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
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 rounded-lg shrink-0 cursor-pointer self-start sm:self-auto"
                        >
                          <Zap className="w-3 h-3" /> Set Sample Query
                        </button>
                      )}
                    </div>
                  ) : null;
                })()}

                {/* Dynamic Payment Parser Config Fields */}
                <ParserConfigFields
                  title="Additional Parser Configuration (e.g. VPA Filter)"
                  accentColor="indigo"
                  fields={availableParsers.find((p) => p.id === paymentParserModule)?.configFields}
                  values={paymentParserConfig}
                  onChange={(key, val) =>
                    setPaymentParserConfig((prev) => ({ ...prev, [key]: val }))
                  }
                />

                {/* Custom Regex Pattern for Payment */}
                {paymentParserModule === "CustomRegexParser" && (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-950/40 p-2.5 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <FlaskConical className="w-3.5 h-3.5" /> Custom Regex (Payment)
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
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-indigo-400" /> Duplicate Prevention Strategy
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
                    <span className="font-semibold flex items-center gap-1 text-white text-xs">
                      <Shield className="w-3.5 h-3.5 text-indigo-400" /> Same Day & Amount
                    </span>
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
                    <span className="font-semibold flex items-center gap-1 text-white text-xs">
                      <Target className="w-3.5 h-3.5 text-indigo-400" /> 1 Payment / Month
                    </span>
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
                    <span className="font-semibold flex items-center gap-1 text-white text-xs">
                      <Plus className="w-3.5 h-3.5 text-indigo-400" /> Sum All Emails
                    </span>
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
                <FlaskConical className="w-3.5 h-3.5" /> Open Live Regex Sandbox →
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
