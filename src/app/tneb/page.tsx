"use client";

import React, { useEffect, useState, useMemo } from "react";
import { FinanceTopBar } from "@/components/FinanceTopBar";
import { TnebBillRecord, TnebConsumerAccount, TnebConfig, TnebTrackedConsumer } from "@/lib/tneb/types";

export default function TnebPage() {
  const [accounts, setAccounts] = useState<TnebConsumerAccount[]>([]);
  const [selectedConsumerNo, setSelectedConsumerNo] = useState<string | null>(null);
  const [bills, setBills] = useState<TnebBillRecord[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Config State
  const [config, setConfig] = useState<TnebConfig | null>(null);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configStatus, setConfigStatus] = useState<string | null>(null);

  // New Consumer Form inside Config Modal
  const [newConsumerNo, setNewConsumerNo] = useState("");
  const [newNickname, setNewNickname] = useState("");
  const [newAddressSnippet, setNewAddressSnippet] = useState("");

  // Sync Modal & Logs
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncUsername, setSyncUsername] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [syncModeAll, setSyncModeAll] = useState(false);
  const [selectedSyncTargets, setSelectedSyncTargets] = useState<string[]>([]);
  const [syncLogs, setSyncLogs] = useState<Array<{ level: string; message: string; timestamp: string }>>([]);

  // Import Modal
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importHtmlText, setImportHtmlText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Load Accounts
  const fetchAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch("/api/tneb/accounts");
      const data = await res.json();
      if (data.success && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
        if (data.accounts.length > 0 && !selectedConsumerNo) {
          setSelectedConsumerNo(data.accounts[0].consumerNumber);
        }
      }
    } catch (err) {
      console.error("Failed to load TNEB accounts:", err);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // Load Config
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/tneb/config");
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
        setSyncModeAll(Boolean(data.config.syncAllFound));
        const activeTargets = (data.config.trackedConsumers || [])
          .filter((c: TnebTrackedConsumer) => c.enabled !== false)
          .map((c: TnebTrackedConsumer) => c.consumerNumber);
        setSelectedSyncTargets(activeTargets);
      }
    } catch (err) {
      console.error("Failed to load TNEB config:", err);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchConfig();
  }, []);

  // Load Bills for selected consumer
  useEffect(() => {
    if (!selectedConsumerNo) {
      setBills([]);
      return;
    }

    const fetchBills = async () => {
      setIsLoadingBills(true);
      try {
        const res = await fetch(`/api/tneb/accounts/${selectedConsumerNo}/bills`);
        const data = await res.json();
        if (data.success && Array.isArray(data.bills)) {
          setBills(data.bills);
        } else {
          setBills([]);
        }
      } catch (err) {
        console.error("Failed to load TNEB bills:", err);
        setBills([]);
      } finally {
        setIsLoadingBills(false);
      }
    };

    fetchBills();
  }, [selectedConsumerNo]);

  const selectedAccount = useMemo(() => {
    return accounts.find((a) => a.consumerNumber === selectedConsumerNo) || accounts[0] || null;
  }, [accounts, selectedConsumerNo]);

  // Filter bills
  const filteredBills = useMemo(() => {
    if (!searchQuery.trim()) return bills;
    const q = searchQuery.toLowerCase();
    return bills.filter(
      (b) =>
        b.cycleMonth.toLowerCase().includes(q) ||
        b.rawAssessmentDate.includes(q) ||
        (b.receiptNo && b.receiptNo.toLowerCase().includes(q)) ||
        (b.status && b.status.toLowerCase().includes(q)) ||
        String(b.unitsConsumed).includes(q) ||
        String(b.totalCharges).includes(q),
    );
  }, [bills, searchQuery]);

  // Overall Stats
  const totalTrackedUnits = useMemo(() => {
    return accounts.reduce((sum, a) => sum + (a.totalUnitsConsumed || 0), 0);
  }, [accounts]);

  const totalOutstandingDues = useMemo(() => {
    return accounts.reduce((sum, a) => {
      if (typeof a.duesToBePaid === "number") return sum + a.duesToBePaid;
      return sum;
    }, 0);
  }, [accounts]);

  // Config Handlers
  const handleAddConsumer = () => {
    if (!newConsumerNo.trim()) return;
    const cleanNo = newConsumerNo.trim().replace(/[^0-9]/g, "");
    if (!cleanNo) return;

    const currentList = config?.trackedConsumers || [];
    if (currentList.some((c) => c.consumerNumber === cleanNo)) {
      alert(`Consumer #${cleanNo} is already in your tracked list.`);
      return;
    }

    const updatedList: TnebTrackedConsumer[] = [
      ...currentList,
      {
        consumerNumber: cleanNo,
        nickname: newNickname.trim() || undefined,
        addressSnippet: newAddressSnippet.trim() || undefined,
        enabled: true,
        addedAt: new Date().toISOString(),
      },
    ];

    setConfig((prev) => (prev ? { ...prev, trackedConsumers: updatedList } : null));
    setSelectedSyncTargets((prev) => (prev.includes(cleanNo) ? prev : [...prev, cleanNo]));
    setNewConsumerNo("");
    setNewNickname("");
    setNewAddressSnippet("");
  };

  const handleToggleConsumer = (consumerNo: string) => {
    if (!config) return;
    const updated = config.trackedConsumers.map((c) =>
      c.consumerNumber === consumerNo ? { ...c, enabled: !c.enabled } : c,
    );
    setConfig({ ...config, trackedConsumers: updated });
    setSelectedSyncTargets((prev) =>
      prev.includes(consumerNo) ? prev.filter((n) => n !== consumerNo) : [...prev, consumerNo],
    );
  };

  const handleRemoveConsumer = (consumerNo: string) => {
    if (!config) return;
    const updated = config.trackedConsumers.filter((c) => c.consumerNumber !== consumerNo);
    setConfig({ ...config, trackedConsumers: updated });
    setSelectedSyncTargets((prev) => prev.filter((n) => n !== consumerNo));
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    setIsSavingConfig(true);
    setConfigStatus(null);
    try {
      const res = await fetch("/api/tneb/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setConfigStatus("✅ Configuration saved successfully!");
        setTimeout(() => {
          setIsConfigModalOpen(false);
          setConfigStatus(null);
        }, 1200);
      } else {
        setConfigStatus(`❌ ${data.error || "Failed to save"}`);
      }
    } catch (err: any) {
      setConfigStatus(`❌ ${err.message || "Network error"}`);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Live SSE Sync
  const handleStartSync = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSyncing(true);
    setSyncLogs([
      {
        level: "info",
        message: "Connecting to TNEB Portal scraper stream...",
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      const response = await fetch("/api/tneb/sync?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: syncUsername || undefined,
          password: syncPassword || undefined,
          syncAllFound: syncModeAll,
          targetConsumerNumbers: syncModeAll ? undefined : selectedSyncTargets,
        }),
      });

      if (!response.body) {
        throw new Error("No readable stream response from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            try {
              const event = JSON.parse(trimmed.slice(5).trim());
              if (event.type === "LOG") {
                setSyncLogs((prev) => [
                  ...prev,
                  {
                    level: event.level,
                    message: event.message,
                    timestamp: new Date(event.timestamp).toLocaleTimeString(),
                  },
                ]);
              } else if (event.type === "COMPLETE") {
                setSyncLogs((prev) => [
                  ...prev,
                  {
                    level: "success",
                    message: "Sync Finished! Refreshing accounts...",
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ]);
                await fetchAccounts();
              } else if (event.type === "ERROR") {
                setSyncLogs((prev) => [
                  ...prev,
                  {
                    level: "error",
                    message: event.error,
                    timestamp: new Date().toLocaleTimeString(),
                  },
                ]);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: any) {
      setSyncLogs((prev) => [
        ...prev,
        {
          level: "error",
          message: err.message || "Failed to execute sync",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsSyncing(false);
    }
  };

  // Import HTML Handler
  const handleImportHtml = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importHtmlText.trim()) return;

    setIsImporting(true);
    setImportStatus(null);

    try {
      const res = await fetch("/api/tneb/import-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: importHtmlText }),
      });

      const data = await res.json();
      if (data.success) {
        setImportStatus(`✅ ${data.message}`);
        setImportHtmlText("");
        await fetchAccounts();
        if (data.account?.consumerNumber) {
          setSelectedConsumerNo(data.account.consumerNumber);
        }
        setTimeout(() => setIsImportModalOpen(false), 1500);
      } else {
        setImportStatus(`❌ ${data.error || "Failed to import"}`);
      }
    } catch (err: any) {
      setImportStatus(`❌ ${err.message || "Network error"}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setImportHtmlText(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
      <FinanceTopBar title="Tamil Nadu EB Bills ⚡" />

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Top Header & Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 font-bold">
                ⚡
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                Tamil Nadu Electricity Board (TNEB)
              </h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Configurable multi-consumer sync, consumption metrics, slab rates, and bi-monthly ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsConfigModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer shadow-sm"
              title="Configure tracked consumer numbers"
            >
              <span>⚙️</span>
              <span>
                Consumers ({config?.trackedConsumers?.length || 0})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition cursor-pointer shadow-sm"
            >
              <span>📄</span>
              <span>Import MHTML</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 hover:from-amber-400 hover:to-amber-500 transition active:scale-95 cursor-pointer shadow-lg shadow-amber-500/20"
            >
              <span>⚡</span>
              <span>Sync Portal</span>
            </button>
          </div>
        </div>

        {/* Global Stats Summary Bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 sm:p-4 backdrop-blur-md">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Tracked Accounts
            </span>
            <div className="mt-1 text-xl sm:text-2xl font-extrabold text-white">
              {accounts.length}{" "}
              <span className="text-xs text-slate-400 font-normal">
                / {config?.trackedConsumers?.length || 0} configured
              </span>
            </div>
            <span className="text-[10px] text-slate-500">Live consumers tracked</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 sm:p-4 backdrop-blur-md">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Total Units Recorded
            </span>
            <div className="mt-1 text-xl sm:text-2xl font-extrabold text-cyan-400 font-mono">
              {totalTrackedUnits.toLocaleString("en-IN", { maximumFractionDigits: 1 })}{" "}
              <span className="text-xs text-slate-400">kWh</span>
            </div>
            <span className="text-[10px] text-slate-500">Across all billing cycles</span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 sm:p-4 backdrop-blur-md">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Outstanding Dues
            </span>
            <div
              className={`mt-1 text-xl sm:text-2xl font-extrabold ${
                totalOutstandingDues > 0 ? "text-rose-400" : "text-emerald-400"
              }`}
            >
              {totalOutstandingDues > 0 ? `₹${totalOutstandingDues.toLocaleString("en-IN")}` : "NIL"}
            </div>
            <span className="text-[10px] text-slate-500">
              {totalOutstandingDues > 0 ? "Action required" : "All accounts up to date"}
            </span>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3.5 sm:p-4 backdrop-blur-md">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Active Tariff & Phase
            </span>
            <div className="mt-1 text-base sm:text-lg font-bold text-slate-200 truncate">
              {selectedAccount ? `${selectedAccount.tariffCode} (${selectedAccount.phase} Phase)` : "—"}
            </div>
            <span className="text-[10px] text-slate-500 truncate block">
              {selectedAccount ? `Load: ${selectedAccount.sanctionedLoad}` : "Select account"}
            </span>
          </div>
        </div>

        {/* Consumer Accounts Selector Tabs */}
        {accounts.length > 0 ? (
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {accounts.map((acc) => {
              const isSelected = acc.consumerNumber === selectedConsumerNo;
              const trackedMeta = config?.trackedConsumers?.find((c) => c.consumerNumber === acc.consumerNumber);

              return (
                <button
                  key={acc.consumerNumber}
                  type="button"
                  onClick={() => setSelectedConsumerNo(acc.consumerNumber)}
                  className={`shrink-0 rounded-2xl border p-3 text-left transition cursor-pointer ${
                    isSelected
                      ? "border-cyan-500/50 bg-cyan-950/30 text-white shadow-md shadow-cyan-950/20"
                      : "border-white/10 bg-slate-900/60 text-slate-300 hover:border-white/20 hover:bg-slate-900/90"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-bold text-amber-300">
                      #{acc.consumerNumber}
                    </span>
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        acc.hasDue ? "bg-rose-500 animate-pulse" : "bg-emerald-400"
                      }`}
                      title={acc.hasDue ? "Payment Due" : "Settled"}
                    />
                  </div>
                  <div className="mt-1 text-xs font-semibold text-white truncate max-w-[180px]">
                    {trackedMeta?.nickname || acc.consumerName}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                    {acc.section || acc.region}
                  </div>
                </button>
              );
            })}
          </div>
        ) : !isLoadingAccounts ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/30 p-8 text-center">
            <span className="text-3xl">⚡</span>
            <h3 className="mt-2 text-base font-bold text-white">No TNEB Accounts Loaded Yet</h3>
            <p className="mt-1 text-xs text-slate-400 max-w-md mx-auto">
              Configure your required consumer numbers in Settings, or sync directly from the portal with your login.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 cursor-pointer"
              >
                ⚙️ Configure Consumers
              </button>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(true)}
                className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer shadow-md"
              >
                Sync with Portal
              </button>
            </div>
          </div>
        ) : null}

        {/* Selected Account Detail Bento */}
        {selectedAccount && (
          <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 backdrop-blur-md space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold text-white">
                    {selectedAccount.consumerName}
                  </h2>
                  <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg">
                    #{selectedAccount.consumerNumber}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
                    {selectedAccount.serviceStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{selectedAccount.address}</p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2 text-right">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Current Dues
                  </span>
                  <span
                    className={`text-base font-extrabold ${
                      selectedAccount.hasDue ? "text-rose-400 font-mono" : "text-emerald-400"
                    }`}
                  >
                    {typeof selectedAccount.duesToBePaid === "number"
                      ? `₹${selectedAccount.duesToBePaid.toLocaleString("en-IN")}`
                      : selectedAccount.duesToBePaid}
                  </span>
                </div>
              </div>
            </div>

            {/* Account Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">Region / Circle</span>
                <span className="font-medium text-slate-200 truncate block">
                  {selectedAccount.region || "—"} / {selectedAccount.circle || "—"}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">Section</span>
                <span
                  className="font-medium text-slate-200 truncate block cursor-help"
                  title={selectedAccount.sectionAddress || selectedAccount.section}
                >
                  {selectedAccount.section || "—"}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">Distribution</span>
                <span className="font-medium text-slate-200 truncate block">
                  {selectedAccount.distribution || "—"}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">Meter / Service No</span>
                <span className="font-medium text-slate-200 font-mono truncate block">
                  {selectedAccount.meterNumber || "—"} / {selectedAccount.serviceNumber || "—"}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">Tariff / Load</span>
                <span className="font-medium text-cyan-300 truncate block">
                  {selectedAccount.tariffCode} • {selectedAccount.sanctionedLoad}
                </span>
              </div>

              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
                <span className="text-[10px] text-slate-500 block">ACCD / MCD Deposit</span>
                <span className="font-medium text-slate-200 font-mono truncate block">
                  ₹{selectedAccount.accdAsOnDate.split("/")[0]?.trim() || 0} / ₹
                  {selectedAccount.mcdAsOnDate.split("/")[0]?.trim() || 0}
                </span>
              </div>
            </div>

            {/* Slab Rates Pill */}
            {selectedAccount.slabRates && selectedAccount.slabRates.length > 0 && (
              <details className="group rounded-xl border border-white/5 bg-white/[0.01] p-3 text-xs">
                <summary className="font-semibold text-slate-300 cursor-pointer flex items-center justify-between">
                  <span>⚡ Domestic Tariff Slab Rates ({selectedAccount.tariffCode})</span>
                  <span className="text-[10px] text-cyan-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-2 border-t border-white/5">
                  {selectedAccount.slabRates.map((sr, idx) => (
                    <div key={idx} className="rounded-lg bg-slate-950/60 p-2 text-center border border-white/5">
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {sr.fromUnit} - {sr.toUnit} units
                      </span>
                      <span className="text-xs font-bold text-amber-300 font-mono">
                        ₹{sr.rateRs} / unit
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Bi-Monthly Consumption & Payment Ledger Table */}
        <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 backdrop-blur-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>📊</span>
                <span>Consumption Charges & Collection Ledger</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                  {filteredBills.length} cycles
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Official bi-monthly assessment records, electricity taxes, and bank collection receipts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cycle, receipt, amount..."
                className="min-h-[36px] w-48 sm:w-64 rounded-xl border border-white/10 bg-slate-950 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10 scrollbar-thin">
            <table className="min-w-full divide-y divide-white/10 text-left text-xs">
              <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-3">Assessment Date</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">KWH Reading</th>
                  <th className="py-3 px-3 text-right">Units (kWh)</th>
                  <th className="py-3 px-3 text-right">CC Charges</th>
                  <th className="py-3 px-3 text-right">Total Bill</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3 text-right">Paid Amount</th>
                  <th className="py-3 px-3">Receipt No</th>
                  <th className="py-3 px-3">Payment Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                {isLoadingBills ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                      Loading consumption records...
                    </td>
                  </tr>
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-500 font-sans">
                      No billing records found matching query.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {bill.rawAssessmentDate}
                        <span className="text-[10px] text-slate-500 block font-sans font-normal">
                          {bill.cycleMonth}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 font-sans">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
                          {bill.status}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right text-slate-300">
                        {bill.kwh !== undefined && bill.kwh > 0 ? bill.kwh.toLocaleString("en-IN") : "—"}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                        {bill.unitsConsumed.toLocaleString("en-IN")}
                      </td>

                      <td className="py-2.5 px-3 text-right text-slate-300">
                        ₹{bill.ccCharges.toLocaleString("en-IN")}
                      </td>

                      <td className="py-2.5 px-3 text-right font-extrabold text-amber-300">
                        ₹{bill.totalCharges.toLocaleString("en-IN")}
                      </td>

                      <td className="py-2.5 px-3 text-slate-300">
                        {bill.rawDueDate || "—"}
                      </td>

                      <td className="py-2.5 px-3 text-right font-bold text-emerald-300">
                        ₹{bill.amountPaid.toLocaleString("en-IN")}
                      </td>

                      <td className="py-2.5 px-3 text-slate-400 font-sans truncate max-w-[140px]">
                        {bill.receiptNo || "—"}
                      </td>

                      <td className="py-2.5 px-3 text-slate-300 font-sans">
                        {bill.rawPaymentDate || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Consumer Configuration Modal */}
      {isConfigModalOpen && config && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 font-bold text-sm">
                  ⚙️
                </span>
                <h3 className="text-base font-bold text-white">Configure Tracked Consumer Numbers</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1 scrollbar-thin">
              {/* Sync Mode Toggle */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-xs font-bold text-white">Auto-Sync All Registered Accounts in Portal</div>
                    <p className="text-[11px] text-slate-400">
                      When enabled, syncs all consumer accounts found in your TNEB login across all pagination pages.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.syncAllFound}
                    onChange={(e) => setConfig({ ...config, syncAllFound: e.target.checked })}
                    className="h-4 w-4 rounded accent-cyan-500 cursor-pointer"
                  />
                </label>
              </div>

              {/* Add New Consumer Form */}
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-3.5 space-y-3">
                <div className="text-xs font-bold text-slate-200">➕ Add Consumer Number to Track</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Consumer No *
                    </label>
                    <input
                      type="text"
                      value={newConsumerNo}
                      onChange={(e) => setNewConsumerNo(e.target.value)}
                      placeholder="e.g. 09299011890"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Nickname / Label
                    </label>
                    <input
                      type="text"
                      value={newNickname}
                      onChange={(e) => setNewNickname(e.target.value)}
                      placeholder="e.g. Home, Farm, Shop"
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Location / Notes
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newAddressSnippet}
                        onChange={(e) => setNewAddressSnippet(e.target.value)}
                        placeholder="e.g. Thoraipakkam"
                        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddConsumer}
                        disabled={!newConsumerNo.trim()}
                        className="rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 shrink-0 cursor-pointer shadow-sm"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Add from Discovered/Loaded Accounts */}
                {accounts.some((a) => !config.trackedConsumers.some((c) => c.consumerNumber === a.consumerNumber)) && (
                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[10px] text-slate-400 block mb-1.5">Quick add from discovered accounts:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {accounts
                        .filter((a) => !config.trackedConsumers.some((c) => c.consumerNumber === a.consumerNumber))
                        .map((a) => (
                          <button
                            key={a.consumerNumber}
                            type="button"
                            onClick={() => {
                              setConfig({
                                ...config,
                                trackedConsumers: [
                                  ...config.trackedConsumers,
                                  {
                                    consumerNumber: a.consumerNumber,
                                    nickname: a.consumerName,
                                    addressSnippet: a.address,
                                    enabled: true,
                                    addedAt: new Date().toISOString(),
                                  },
                                ],
                              });
                              setSelectedSyncTargets((prev) => [...prev, a.consumerNumber]);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                          >
                            <span>+</span>
                            <span>{a.consumerNumber} ({a.consumerName})</span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Tracked Consumers List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Tracked Consumer Accounts ({config.trackedConsumers.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Toggle checkbox to enable/disable for auto-sync</span>
                </div>

                {config.trackedConsumers.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 text-center text-xs text-slate-500">
                    No consumer numbers configured yet. Add your consumer number above.
                  </div>
                ) : (
                  config.trackedConsumers.map((c) => (
                    <div
                      key={c.consumerNumber}
                      className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/70 p-3 text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={c.enabled !== false}
                          onChange={() => handleToggleConsumer(c.consumerNumber)}
                          className="h-4 w-4 rounded accent-cyan-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-amber-300">
                              #{c.consumerNumber}
                            </span>
                            {c.nickname && (
                              <span className="font-semibold text-white">
                                {c.nickname}
                              </span>
                            )}
                          </div>
                          {c.addressSnippet && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {c.addressSnippet}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveConsumer(c.consumerNumber)}
                          className="text-rose-400 hover:text-rose-300 p-1 cursor-pointer"
                          title="Remove consumer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {configStatus && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold ${
                    configStatus.startsWith("✅")
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {configStatus}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfigModalOpen(false)}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className="rounded-xl bg-cyan-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer shadow-md"
              >
                {isSavingConfig ? "Saving..." : "Save Consumer Settings"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync from Portal Modal */}
      {isSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 font-bold text-sm">
                  ⚡
                </span>
                <h3 className="text-base font-bold text-white">TNEB Portal Automated Scraper</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSyncModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStartSync} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                    TNEB Username / User ID
                  </label>
                  <input
                    type="text"
                    value={syncUsername}
                    onChange={(e) => setSyncUsername(e.target.value)}
                    placeholder="Leave empty to use TNEB_USERNAME env"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                    TNEB Password
                  </label>
                  <input
                    type="password"
                    value={syncPassword}
                    onChange={(e) => setSyncPassword(e.target.value)}
                    placeholder="Leave empty to use TNEB_PASSWORD env"
                    className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Target Consumer Selection */}
              <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold uppercase tracking-wider text-slate-300 text-[10px]">
                    Target Consumers to Sync
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                    <input
                      type="checkbox"
                      checked={syncModeAll}
                      onChange={(e) => setSyncModeAll(e.target.checked)}
                      className="rounded accent-amber-400"
                    />
                    <span>Sync All Found in Account</span>
                  </label>
                </div>

                {!syncModeAll && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(config?.trackedConsumers || []).map((c) => {
                      const isChecked = selectedSyncTargets.includes(c.consumerNumber);
                      return (
                        <label
                          key={c.consumerNumber}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs cursor-pointer transition ${
                            isChecked
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold"
                              : "border-white/10 bg-slate-900 text-slate-400"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedSyncTargets((prev) =>
                                prev.includes(c.consumerNumber)
                                  ? prev.filter((n) => n !== c.consumerNumber)
                                  : [...prev, c.consumerNumber],
                              );
                            }}
                            className="hidden"
                          />
                          <span>#{c.consumerNumber}</span>
                          {c.nickname && <span className="text-[10px] text-slate-400">({c.nickname})</span>}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Console Logs Box */}
              <div className="rounded-xl border border-white/10 bg-slate-950 p-3 h-48 overflow-y-auto font-mono text-[11px] space-y-1 scrollbar-thin">
                {syncLogs.length === 0 ? (
                  <div className="text-slate-600 text-center pt-16">
                    Telemetry logs will appear here during captcha solving and statement scraping...
                  </div>
                ) : (
                  syncLogs.map((lg, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed ${
                        lg.level === "error"
                          ? "text-rose-400"
                          : lg.level === "warn"
                          ? "text-amber-400"
                          : lg.level === "success"
                          ? "text-emerald-400"
                          : "text-slate-300"
                      }`}
                    >
                      <span className="text-slate-500 mr-2">[{lg.timestamp}]</span>
                      <span>{lg.message}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="rounded-xl bg-amber-500 px-5 py-2 font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isSyncing ? "Running Live Scraper..." : "Start Portal Sync"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import MHTML / HTML Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 font-bold text-sm">
                  📄
                </span>
                <h3 className="text-base font-bold text-white">Import TNEB Service Details (MHTML / HTML)</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleImportHtml} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                  Upload <code>.mhtml</code> or <code>.html</code> file
                </label>
                <input
                  type="file"
                  accept=".mhtml,.html,.htm"
                  onChange={handleFileUpload}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-white file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-500/20 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-cyan-300 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-semibold uppercase tracking-wider text-slate-400 text-[10px]">
                  Or Paste Raw HTML Content
                </label>
                <textarea
                  rows={6}
                  value={importHtmlText}
                  onChange={(e) => setImportHtmlText(e.target.value)}
                  placeholder="Paste <html> content from detconws.php or SERVICE DETAILS.mhtml here..."
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[11px] text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
                />
              </div>

              {importStatus && (
                <div
                  className={`rounded-xl p-3 text-xs font-semibold ${
                    importStatus.startsWith("✅")
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}
                >
                  {importStatus}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importHtmlText.trim()}
                  className="rounded-xl bg-cyan-500 px-5 py-2 font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 cursor-pointer shadow-md"
                >
                  {isImporting ? "Parsing & Storing..." : "Import Account & Bills"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
