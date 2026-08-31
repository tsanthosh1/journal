"use client";

import React, { useState, useMemo } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { getAvailableParsers, testParserOnContent, ParserMetadata } from "@/lib/parsers";
import { ParserTestResult } from "@/lib/subscriptionTypes";

interface SampleItem {
  id: string;
  name: string;
  category: "Cards" | "UPI & Debits" | "Utilities" | "Gold & Schemes" | "SMS & Loans";
  parserModule: string;
  type: "STATEMENT" | "PAYMENT" | "SMS";
  subject: string;
  content: string;
  parserConfig?: Record<string, any>;
  description: string;
}

const SAMPLE_DATABASE: SampleItem[] = [
  {
    id: "airtel-postpaid-bill",
    name: "Airtel Postpaid Bill (Google Pay BBPS)",
    category: "Utilities",
    parserModule: "AirtelPostpaidParser",
    type: "STATEMENT",
    subject: "New bill from Airtel Postpaid Mobile. Pay now on Google Pay.",
    content: `Delivered-To: user@gmail.com
Subject: New bill from Airtel Postpaid Mobile. Pay now on Google Pay.
From: Google Pay <googlepay-noreply@google.com>

Hi User,
Here are your bill details:
Airtel Mobile Postpaid
For 9876543210
Total bill amount: ₹824.82
Bill date: 28 Aug 2026
Bill due date: 15 Sep 2026
Pay your bill instantly with Google Pay.`,
    description: "Extracts amount (₹824.82), due date (15 Sep 2026), and mobile number from Google Pay BBPS notifications.",
  },
  {
    id: "airtel-payment-receipt",
    name: "Airtel Official Payment Receipt",
    category: "Utilities",
    parserModule: "AirtelPostpaidParser",
    type: "PAYMENT",
    subject: "Here’s your Airtel payment receipt!",
    content: `Delivered-To: user@gmail.com
From: update@airtel.com
Subject: Here’s your Airtel payment receipt!

Dear Customer,
We have received your payment of Rs. 824.82 on 30-Aug-2026 for your Airtel Postpaid mobile number 9876543210.
Payment Mode: UPI
Transaction ID: AIRTEL8899112233
Thank you for choosing Airtel!`,
    description: "Extracts payment receipt amount (Rs. 824.82), payment date (30-Aug-2026), and transaction ID.",
  },
  {
    id: "hdfc-card-statement",
    name: "HDFC Bank Credit Card Statement",
    category: "Cards",
    parserModule: "HDFCCardParser",
    type: "STATEMENT",
    subject: "HDFC Bank Credit Card Statement for Card ending 4589",
    content: `Dear Cardmember,
Your HDFC Bank Credit Card e-Statement for the billing cycle ending 01/08/2026 is ready.

Card Number: XXXX-XXXX-XXXX-4589
Total Amount Due: Rs. 38,450.00
Minimum Amount Due: Rs. 1,920.00
Payment Due Date: 18/08/2026
Credit Limit: Rs. 3,00,000.00
Available Credit Limit: Rs. 2,61,550.00`,
    description: "Extracts total due (Rs. 38,450.00), due date (18/08/2026), and card last 4 digits (4589).",
  },
  {
    id: "hdfc-upi-gpay-alert",
    name: "HDFC Bank UPI Alert (GPay CC Payment)",
    category: "UPI & Debits",
    parserModule: "UPIPaymentParser",
    type: "PAYMENT",
    subject: "Debit Alert: HDFC Bank a/c XX6013",
    content: `Dear Customer,
Rs. 38,450.00 has been debited from your HDFC Bank account **6013 on 05-08-2026 towards VPA gpay-creditcard@okpayaxis (UPI Ref No: 421800998877).
If this was not you, call 1800-258-3838 immediately.`,
    parserConfig: { targetVpa: "gpay-creditcard@okpayaxis" },
    description: "Matches target VPA handle filter and extracts debited payment of Rs. 38,450.00 on 05-08-2026.",
  },
  {
    id: "icici-amazon-pay-statement",
    name: "Amazon Pay ICICI Card Statement",
    category: "Cards",
    parserModule: "ICICICardParser",
    type: "STATEMENT",
    subject: "Amazon Pay ICICI Bank Credit Card Statement for card ending 1004",
    content: `Dear Customer,
Please find below the summary of your Amazon Pay ICICI Bank Credit Card statement ending 1004 for July 2026:

Total Amount Due: INR 12,490.50
Minimum Amount Due: INR 650.00
Payment Due Date: 22-Aug-2026
Available Credit Limit: INR 1,87,509.50
Amazon Pay Cashback Earned: ₹374.00`,
    description: "Extracts Total Due (INR 12,490.50), Due Date (22-Aug-2026), and card number ending (1004).",
  },
  {
    id: "icici-card-payment-receipt",
    name: "ICICI Bank Payment Received Confirmation",
    category: "Cards",
    parserModule: "ICICICardParser",
    type: "PAYMENT",
    subject: "Payment received towards your ICICI Bank Credit Card ending 1004",
    content: `Dear Customer,
We have received payment of INR 12,490.50 towards your ICICI Bank Credit Card ending 1004 on 15-AUG-2026.
Payment Reference Number: 20260815998811.
Your available limit has been restored.`,
    description: "Extracts payment amount (INR 12,490.50), payment date (15-AUG-2026), and reference number.",
  },
  {
    id: "axis-credit-card-statement",
    name: "Axis Bank Credit Card Statement",
    category: "Cards",
    parserModule: "AxisCardParser",
    type: "STATEMENT",
    subject: "Axis Bank Credit Card Statement ending 3021",
    content: `Dear Cardholder,
Summary of your Axis Bank Credit Card statement for Card No: 4532XXXXXXXX3021:

Total Payment Due: Rs 24,990.00
Payment Due Date: 12-08-2026
Minimum Payment Due: Rs 1,250.00
Statement Period: 21 Jun 2026 - 20 Jul 2026`,
    description: "Extracts Total Payment Due (Rs 24,990.00), Due Date (12-08-2026), and Card Digits (3021).",
  },
  {
    id: "sbi-card-statement",
    name: "SBI Card e-Statement",
    category: "Cards",
    parserModule: "SBICardParser",
    type: "STATEMENT",
    subject: "SBI Card e-Statement for Card ending 8812",
    content: `Dear Cardholder,
Here is the e-Statement summary for your SBI Credit Card ending with 8812:

Total Amount Due: Rs. 18,340.00
Payment Due Date: 25-Aug-2026
Minimum Amount Due: Rs. 920.00
Total Credit Limit: Rs. 1,50,000.00`,
    description: "Extracts Total Amount Due (Rs. 18,340.00) and Due Date (25-Aug-2026).",
  },
  {
    id: "homefy-water-bill",
    name: "Homefy Community Water Bill",
    category: "Utilities",
    parserModule: "HomefyParser",
    type: "STATEMENT",
    subject: "Homefy Bill for Apartment Tower A - 402",
    content: `From: billing@homefy.community
Subject: Homefy Bill for Apartment Tower A - 402

Dear Resident,
Your monthly water & maintenance bill for Apartment Tower A - 402 has been generated.
Bill Amount: ₹1,250.00
Due Date: 09/08/2026
Meter Reading: 45.2 kL
Please make the payment before due date to avoid late fee.`,
    description: "Extracts community water bill amount (₹1,250.00), due date (09/08/2026), and apartment unit.",
  },
  {
    id: "grt-jewels-chit-receipt",
    name: "GRT Jewellers Gold Scheme Receipt",
    category: "Gold & Schemes",
    parserModule: "JewellerySchemeParser",
    type: "PAYMENT",
    subject: "GRT JPS Advance payment receipt for Scheme ID GRT-7721",
    content: `From: mail@grtjewels.com
Subject: GRT JPS Advance payment receipt for Scheme ID GRT-7721

Dear Customer,
We gratefully acknowledge receipt of your monthly chit installment payment of Rs. 5,000.00 on 12-08-2026 for GRT Golden 11 Scheme Plan (Acc: GRT-7721).
Next Installment Due Date: 31-Aug-2026.
Transaction ID: GRT99281736.`,
    description: "Extracts chit installment payment (Rs. 5,000.00), receipt date (12-08-2026), and scheme plan.",
  },
  {
    id: "boi-home-loan-sms",
    name: "Bank of India Home Loan SMS Alert",
    category: "SMS & Loans",
    parserModule: "LoanSmsParser",
    type: "SMS",
    subject: "BOI",
    content: `BOI - Rs 34550.00 debited from A/C ...6013 on 05-08-2026 towards Loan Rec TRF to Loan A/C ...7890. Ref: 4218001122.`,
    description: "Parses bank SMS debits for home loans & EMI deductions, capturing amount, debit date, and loan account.",
  },
  {
    id: "hdfc-home-loan-sms",
    name: "HDFC Bank Home Loan Recovery SMS",
    category: "SMS & Loans",
    parserModule: "LoanSmsParser",
    type: "SMS",
    subject: "HDFCBK",
    content: `Rs. 42100.00 debited from HDFC Bank A/c 5010001234 on 07-AUG-26 towards LN RECOVERY HDFC Home Loan A/c 6123456789.`,
    description: "Extracts loan recovery debits and EMI deductions from HDFC Bank SMS companion alerts.",
  },
  {
    id: "bescom-electricity-bill",
    name: "BESCOM Electricity Utility Bill",
    category: "Utilities",
    parserModule: "GenericUtilityParser",
    type: "STATEMENT",
    subject: "Electricity Bill for Account 9918273645",
    content: `From: billing@bescom.karnataka.gov.in
Subject: Electricity Bill for Account 9918273645

BESCOM Monthly Electricity Bill
Consumer No: 9918273645
Bill Amount: Rs. 2,340.00
Due Date: 16-Aug-2026
Units Consumed: 218 kWh`,
    description: "Generic utility parser extracting bill amounts and due dates from telecom & electricity invoices.",
  },
];

export default function ParsersPage() {
  const parsers = useMemo(() => getAvailableParsers(), []);
  const [selectedParserId, setSelectedParserId] = useState<string>("AirtelPostpaidParser");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"PLAYGROUND" | "SAMPLES" | "ARCHITECTURE">("PLAYGROUND");

  // Playground state
  const [testSubject, setTestSubject] = useState(
    "New bill from Airtel Postpaid Mobile. Pay now on Google Pay.",
  );
  const [testContent, setTestContent] = useState(SAMPLE_DATABASE[0].content);
  const [testConfig, setTestConfig] = useState<Record<string, any>>({});
  const [testRegex, setTestRegex] = useState({
    statementAmountPattern: "",
    statementDueDatePattern: "",
    paymentAmountPattern: "",
  });

  const [activeTestResult, setActiveTestResult] = useState<ParserTestResult | null>(() => {
    return testParserOnContent("AirtelPostpaidParser", SAMPLE_DATABASE[0].content, SAMPLE_DATABASE[0].subject);
  });

  const selectedParser = useMemo(() => {
    return parsers.find((p) => p.id === selectedParserId) || parsers[0];
  }, [parsers, selectedParserId]);

  const filteredParsers = useMemo(() => {
    return parsers.filter((p) => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.id.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;
      if (selectedCategory === "All") return true;
      if (selectedCategory === "Cards" && (p.id.includes("Card") || p.id.includes("Axis") || p.id.includes("SBI") || p.id.includes("ICICI") || p.id.includes("HDFC"))) return true;
      if (selectedCategory === "UPI & Debits" && p.id.includes("UPI")) return true;
      if (selectedCategory === "Utilities" && (p.id.includes("Airtel") || p.id.includes("Homefy") || p.id.includes("Utility"))) return true;
      if (selectedCategory === "Gold & Schemes" && p.id.includes("Jewellery")) return true;
      if (selectedCategory === "SMS & Loans" && p.id.includes("Loan")) return true;
      if (selectedCategory === "Advanced" && (p.id.includes("Universal") || p.id.includes("Custom"))) return true;

      return true;
    });
  }, [parsers, searchQuery, selectedCategory]);

  const filteredSamples = useMemo(() => {
    return SAMPLE_DATABASE.filter((s) => {
      if (selectedCategory !== "All" && s.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.subject.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.parserModule.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  const handleSelectParser = (parser: ParserMetadata) => {
    setSelectedParserId(parser.id);
    // Find matching sample if any
    const matchingSample = SAMPLE_DATABASE.find((s) => s.parserModule === parser.id);
    if (matchingSample) {
      setTestSubject(matchingSample.subject);
      setTestContent(matchingSample.content);
      setTestConfig(matchingSample.parserConfig || {});
      const result = testParserOnContent(parser.id, matchingSample.content, matchingSample.subject, testRegex, matchingSample.parserConfig);
      setActiveTestResult(result);
    } else {
      const result = testParserOnContent(parser.id, testContent, testSubject, testRegex, testConfig);
      setActiveTestResult(result);
    }
  };

  const handleLoadSample = (sample: SampleItem) => {
    setSelectedParserId(sample.parserModule);
    setTestSubject(sample.subject);
    setTestContent(sample.content);
    setTestConfig(sample.parserConfig || {});
    setActiveTab("PLAYGROUND");

    const result = testParserOnContent(sample.parserModule, sample.content, sample.subject, testRegex, sample.parserConfig);
    setActiveTestResult(result);
  };

  const handleRunTest = () => {
    const result = testParserOnContent(selectedParserId, testContent, testSubject, testRegex, testConfig);
    setActiveTestResult(result);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      <FinanceTopBar title="Parser Laboratory" />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-400 text-xs">
                🧩
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                Specialized Extraction Laboratory
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Statement & Payment Parsers
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-3xl">
              Inspect, test, and debug all 12 dedicated parser engines across Indian bank credit cards, UPI alerts, telecom bills, community water meters, and loan recovery SMS messages.
            </p>
          </div>

          {/* Quick Stats Badges */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/40 px-3.5 py-2 text-center">
              <span className="text-xs font-medium text-slate-400 block">Engines</span>
              <span className="text-base font-extrabold text-cyan-300">{parsers.length} Active</span>
            </div>
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/40 px-3.5 py-2 text-center">
              <span className="text-xs font-medium text-slate-400 block">Curated Samples</span>
              <span className="text-base font-extrabold text-indigo-300">{SAMPLE_DATABASE.length} Ready</span>
            </div>
          </div>
        </div>

        {/* Category Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-white/10 backdrop-blur-sm">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {["All", "Cards", "UPI & Debits", "Utilities", "Gold & Schemes", "SMS & Loans", "Advanced"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search parsers & samples..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[36px] rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-white/10">
          <button
            type="button"
            onClick={() => setActiveTab("PLAYGROUND")}
            className={`flex items-center gap-2 pb-3 px-2 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === "PLAYGROUND"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>⚡</span> Interactive Playground & Live Inspector
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("SAMPLES")}
            className={`flex items-center gap-2 pb-3 px-2 text-xs font-bold transition border-b-2 cursor-pointer ${
              activeTab === "SAMPLES"
                ? "border-cyan-400 text-cyan-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📚</span> Sample Library & EML Showcase ({SAMPLE_DATABASE.length})
          </button>
        </div>

        {/* TAB 1: PLAYGROUND & INSPECTOR */}
        {activeTab === "PLAYGROUND" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Parser Catalog List (4 cols) */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Select Engine ({filteredParsers.length})
                </span>
                <span className="text-[10px] text-cyan-400 font-medium">Click to inspect</span>
              </div>

              <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                {filteredParsers.map((parser) => {
                  const isSelected = parser.id === selectedParserId;
                  return (
                    <button
                      key={parser.id}
                      type="button"
                      onClick={() => handleSelectParser(parser)}
                      className={`w-full text-left p-3.5 rounded-2xl border transition cursor-pointer ${
                        isSelected
                          ? "border-cyan-500/50 bg-gradient-to-r from-cyan-950/50 to-slate-900 shadow-md shadow-cyan-950/20"
                          : "border-white/10 bg-slate-900/60 hover:bg-slate-900 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-bold ${isSelected ? "text-cyan-300" : "text-white"}`}>
                          {parser.name}
                        </span>
                        {parser.id === "UniversalAutoParser" && (
                          <span className="rounded-full bg-cyan-500/20 px-1.5 py-0.2 text-[9px] font-extrabold text-cyan-300 shrink-0">
                            Auto Cascade
                          </span>
                        )}
                        {parser.id === "LoanSmsParser" && (
                          <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.2 text-[9px] font-extrabold text-emerald-300 shrink-0">
                            SMS
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {parser.description}
                      </p>
                      <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px] text-slate-500">
                        <span className="bg-white/5 px-1.5 py-0.5 rounded border border-white/5 truncate max-w-[200px]">
                          {parser.id}
                        </span>
                        {parser.configFields && parser.configFields.length > 0 && (
                          <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {parser.configFields.length} config {parser.configFields.length === 1 ? "field" : "fields"}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Live Playground & Output (8 cols) */}
            <div className="lg:col-span-8 space-y-5">
              {/* Selected Parser Card Header */}
              <div className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/30 via-slate-900 to-indigo-950/30 p-4 sm:p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                      Active Parser Engine
                    </span>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <span>{selectedParser.name}</span>
                    </h2>
                  </div>
                  <span className="self-start sm:self-auto font-mono text-xs text-slate-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl">
                    {selectedParser.id}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{selectedParser.description}</p>

                {/* Sample Queries */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                  {selectedParser.sampleStatementQuery && (
                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/40 p-2.5">
                      <span className="text-[10px] font-bold uppercase text-cyan-300 block mb-0.5">
                        📄 Statement Query
                      </span>
                      <code className="font-mono text-slate-300 break-all text-[10px]">
                        {selectedParser.sampleStatementQuery}
                      </code>
                    </div>
                  )}
                  {selectedParser.samplePaymentQuery && (
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/40 p-2.5">
                      <span className="text-[10px] font-bold uppercase text-indigo-300 block mb-0.5">
                        💳 Payment / Alert Query
                      </span>
                      <code className="font-mono text-slate-300 break-all text-[10px]">
                        {selectedParser.samplePaymentQuery}
                      </code>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Config Fields if applicable */}
              {selectedParser.configFields && selectedParser.configFields.length > 0 && (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <span>⚙️</span> Parser Configuration Options
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedParser.configFields.map((field) => (
                      <div key={field.key} className="space-y-1">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          placeholder={field.placeholder || ""}
                          value={testConfig[field.key] || ""}
                          onChange={(e) =>
                            setTestConfig((prev) => ({
                              ...prev,
                              [field.key]: e.target.value,
                            }))
                          }
                          className="w-full min-h-[36px] font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        />
                        {field.description && (
                          <span className="text-[10px] text-slate-400 block">{field.description}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Regex Inputs if CustomRegexParser */}
              {selectedParserId === "CustomRegexParser" && (
                <div className="rounded-2xl border border-purple-500/30 bg-purple-950/20 p-4 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                    <span>🧪</span> Custom Regex Patterns
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Statement Amount Pattern
                      </label>
                      <input
                        type="text"
                        placeholder='e.g. Total Due:\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)'
                        value={testRegex.statementAmountPattern}
                        onChange={(e) =>
                          setTestRegex((r) => ({ ...r, statementAmountPattern: e.target.value }))
                        }
                        className="mt-1 w-full font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300">
                        Payment Amount Pattern
                      </label>
                      <input
                        type="text"
                        placeholder='e.g. Paid amount:\s*(?:Rs\.?|₹)?\s*([\d,]+(?:\.\d{2})?)'
                        value={testRegex.paymentAmountPattern}
                        onChange={(e) =>
                          setTestRegex((r) => ({ ...r, paymentAmountPattern: e.target.value }))
                        }
                        className="mt-1 w-full font-mono text-xs rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-white placeholder-slate-500 focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Playground Inputs */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Input Subject / SMS Sender
                  </label>
                  <span className="text-[10px] text-slate-400">Passed as email subject or sender header</span>
                </div>
                <input
                  type="text"
                  value={testSubject}
                  onChange={(e) => setTestSubject(e.target.value)}
                  placeholder="e.g. New bill from Airtel Postpaid Mobile or BOI"
                  className="w-full min-h-[40px] font-mono text-xs rounded-xl border border-white/10 bg-slate-950 px-3.5 py-2 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                />

                <div className="flex items-center justify-between pt-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Email Raw Body / EML Content / SMS Message
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {testContent.length} characters
                  </span>
                </div>

                <textarea
                  rows={8}
                  value={testContent}
                  onChange={(e) => setTestContent(e.target.value)}
                  placeholder="Paste raw email body, MIME/EML, or SMS text here..."
                  className="w-full font-mono text-xs rounded-xl border border-white/10 bg-slate-950 p-3.5 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none resize-y leading-relaxed"
                />

                {/* Run Parser Action */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Quick Samples:</span>
                    {SAMPLE_DATABASE.slice(0, 3).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => handleLoadSample(s)}
                        className="text-[10px] text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 px-2 py-0.5 rounded-lg transition cursor-pointer"
                      >
                        {s.name.split(" ")[0]}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleRunTest}
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-5 py-2 text-xs font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 transition active:scale-95 cursor-pointer"
                  >
                    <span>▶</span> Run {selectedParser.name.split(" ")[0]}
                  </button>
                </div>
              </div>

              {/* Live Test Output Cards */}
              {activeTestResult && (
                <div className="rounded-2xl border border-white/15 bg-slate-900/80 p-4 sm:p-5 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-white">Extraction Results</span>
                      <span className="font-mono text-[10px] text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                        {activeTestResult.parserModule}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeTestResult.statementResult.success && (
                        <span className="rounded-full bg-cyan-500/20 border border-cyan-500/30 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
                          ✓ Statement Matched
                        </span>
                      )}
                      {activeTestResult.paymentResult.success && (
                        <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                          ✓ Payment Matched
                        </span>
                      )}
                      {!activeTestResult.statementResult.success && !activeTestResult.paymentResult.success && (
                        <span className="rounded-full bg-rose-500/20 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold text-rose-300">
                          ✕ No Match
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dual Grid: Statement vs Payment Output */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Statement Card */}
                    <div
                      className={`p-4 rounded-2xl border transition ${
                        activeTestResult.statementResult.success
                          ? "border-cyan-500/30 bg-cyan-950/20"
                          : "border-white/5 bg-white/[0.01]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                          <span>📄</span> Statement / Bill Invoice
                        </span>
                        {activeTestResult.statementResult.success ? (
                          <span className="text-[10px] font-bold text-cyan-400">SUCCESS</span>
                        ) : (
                          <span className="text-[10px] text-slate-500">NOT EXTRACTED</span>
                        )}
                      </div>

                      {activeTestResult.statementResult.success ? (
                        <div className="space-y-2.5 text-xs">
                          <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                            <span className="text-slate-400">Bill Total Due:</span>
                            <span className="font-extrabold text-base text-cyan-300">
                              ₹{activeTestResult.statementResult.statementTotal?.toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                            <span className="text-slate-400">Payment Due Date:</span>
                            <span className="font-semibold text-white font-mono">
                              {activeTestResult.statementResult.dueDate || "N/A"}
                            </span>
                          </div>
                          {activeTestResult.statementResult.statementDate && (
                            <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                              <span className="text-slate-400">Statement Date:</span>
                              <span className="font-semibold text-slate-300 font-mono">
                                {activeTestResult.statementResult.statementDate}
                              </span>
                            </div>
                          )}
                          {activeTestResult.statementResult.accountOrCardDigits && (
                            <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                              <span className="text-slate-400">Account / Card:</span>
                              <span className="font-mono text-slate-200">
                                {activeTestResult.statementResult.accountOrCardDigits}
                              </span>
                            </div>
                          )}
                          {activeTestResult.statementResult.referenceId && (
                            <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                              <span className="text-slate-400">Reference / Bill ID:</span>
                              <span className="font-mono text-slate-200">
                                {activeTestResult.statementResult.referenceId}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">
                          {activeTestResult.statementResult.error || "No statement dues detected in this message."}
                        </p>
                      )}
                    </div>

                    {/* Payment Card */}
                    <div
                      className={`p-4 rounded-2xl border transition ${
                        activeTestResult.paymentResult.success
                          ? "border-emerald-500/30 bg-emerald-950/20"
                          : "border-white/5 bg-white/[0.01]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                          <span>💳</span> Payment Confirmation / Debit
                        </span>
                        {activeTestResult.paymentResult.success ? (
                          <span className="text-[10px] font-bold text-emerald-400">SUCCESS</span>
                        ) : (
                          <span className="text-[10px] text-slate-500">NOT EXTRACTED</span>
                        )}
                      </div>

                      {activeTestResult.paymentResult.success ? (
                        <div className="space-y-2.5 text-xs">
                          <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                            <span className="text-slate-400">Amount Paid:</span>
                            <span className="font-extrabold text-base text-emerald-300">
                              ₹{activeTestResult.paymentResult.paidAmount?.toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                            <span className="text-slate-400">Payment Date:</span>
                            <span className="font-semibold text-white font-mono">
                              {activeTestResult.paymentResult.paymentDate || "N/A"}
                            </span>
                          </div>
                          {activeTestResult.paymentResult.accountOrCardDigits && (
                            <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                              <span className="text-slate-400">Account / Card:</span>
                              <span className="font-mono text-slate-200">
                                {activeTestResult.paymentResult.accountOrCardDigits}
                              </span>
                            </div>
                          )}
                          {activeTestResult.paymentResult.referenceId && (
                            <div className="flex justify-between items-baseline border-b border-white/5 pb-1.5">
                              <span className="text-slate-400">Ref / UTR Number:</span>
                              <span className="font-mono text-slate-200">
                                {activeTestResult.paymentResult.referenceId}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-500 italic">
                          {activeTestResult.paymentResult.error || "No payment confirmation detected in this message."}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Execution Logs */}
                  {activeTestResult.logs && activeTestResult.logs.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-slate-950 p-3.5 space-y-1.5 font-mono text-[11px]">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Execution Diagnostic Logs:
                      </span>
                      <div className="space-y-1 text-slate-300 max-h-36 overflow-y-auto">
                        {activeTestResult.logs.map((log, i) => (
                          <div key={i} className="leading-relaxed">
                            {log}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw JSON Result Toggle */}
                  <details className="text-xs">
                    <summary className="text-slate-400 hover:text-white cursor-pointer font-semibold select-none">
                      🔍 View Raw Parser JSON Output
                    </summary>
                    <pre className="mt-2 p-3 rounded-xl bg-slate-950 border border-white/10 font-mono text-[11px] text-cyan-200 overflow-x-auto">
                      {JSON.stringify(activeTestResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: SAMPLES LIBRARY */}
        {activeTab === "SAMPLES" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Realistic Curated Sample Messages</h2>
                <p className="text-xs text-slate-400">
                  Pre-configured sample emails, BBPS receipts, and bank loan SMS alerts across Indian providers. Click <strong>Load into Playground</strong> to test live.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSamples.map((sample) => (
                <div
                  key={sample.id}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-slate-900/60 p-4 space-y-3 hover:border-cyan-500/30 transition group"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-bold text-white group-hover:text-cyan-300 transition">
                        {sample.name}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold shrink-0 ${
                          sample.type === "STATEMENT"
                            ? "bg-cyan-500/20 text-cyan-300"
                            : sample.type === "PAYMENT"
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-teal-500/20 text-teal-300"
                        }`}
                      >
                        {sample.type}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {sample.description}
                    </p>

                    <div className="rounded-xl border border-white/5 bg-slate-950 p-2.5 font-mono text-[10px] text-slate-300 line-clamp-3 leading-relaxed">
                      <span className="text-slate-500 font-bold block mb-0.5">Subject: {sample.subject}</span>
                      {sample.content}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <span className="text-[10px] font-mono text-slate-500 bg-white/5 px-2 py-0.5 rounded">
                      {sample.parserModule}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleLoadSample(sample)}
                      className="rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 px-3 py-1.5 text-xs font-bold text-cyan-300 hover:text-cyan-200 transition cursor-pointer"
                    >
                      ⚡ Test in Playground
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
