"use client";

import React, { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";
import { parseGcpCostTableCsv, ParsedGcpInvoice } from "@/lib/gcpBilling/csvParser";
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Receipt,
  Plus,
  Layers,
} from "lucide-react";

interface StagedBill {
  id: string;
  fileName: string;
  rawContent: string;
  parsed: ParsedGcpInvoice | null;
  error?: string;
}

interface GcpImportCsvModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onImportComplete: () => void;
}

export function GcpImportCsvModal({
  isOpen,
  onClose,
  user,
  onImportComplete,
}: GcpImportCsvModalProps) {
  const [stagedBills, setStagedBills] = useState<StagedBill[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing imported invoices from Firestore
  const [existingInvoices, setExistingInvoices] = useState<any[]>([]);
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchExistingInvoices();
      setStagedBills([]);
      setGlobalError(null);
      setSuccessMessage(null);
    }
  }, [isOpen, user]);

  const fetchExistingInvoices = async () => {
    setIsLoadingExisting(true);
    try {
      const res = await authFetch(user, "/api/gcp-billing/import-csv");
      const data = await res.json();
      if (res.ok && data.invoices) {
        setExistingInvoices(data.invoices);
      }
    } catch (err) {
      console.error("Failed to load existing imported invoices:", err);
    } finally {
      setIsLoadingExisting(false);
    }
  };

  if (!isOpen) return null;

  const processFiles = (files: FileList | File[]) => {
    setGlobalError(null);
    setSuccessMessage(null);

    const fileArray = Array.from(files).filter(
      (f) => f.name.endsWith(".csv") || f.type === "text/csv" || f.type === "application/vnd.ms-excel"
    );

    if (fileArray.length === 0) {
      setGlobalError("Please select or drop valid CSV files exported from Google Cloud Billing.");
      return;
    }

    const newStaged: StagedBill[] = [];

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawContent = event.target?.result as string;
        try {
          const parsed = parseGcpCostTableCsv(rawContent);
          if (!parsed.invoiceMonth) {
            newStaged.push({
              id: `${file.name}-${Date.now()}-${Math.random()}`,
              fileName: file.name,
              rawContent,
              parsed: null,
              error: "Missing invoice date or month in CSV",
            });
          } else {
            newStaged.push({
              id: `${file.name}-${Date.now()}-${Math.random()}`,
              fileName: file.name,
              rawContent,
              parsed,
            });
          }
        } catch (err: any) {
          newStaged.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            fileName: file.name,
            rawContent,
            parsed: null,
            error: err.message || "Failed to parse CSV",
          });
        }

        // When all files have been read, update state
        if (newStaged.length === fileArray.length) {
          setStagedBills((prev) => [...prev, ...newStaged]);
        }
      };
      reader.readAsText(file);
    });
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  const removeStagedBill = (id: string) => {
    setStagedBills((prev) => prev.filter((b) => b.id !== id));
  };

  const handleImportAll = async () => {
    const validBills = stagedBills.filter((b) => b.parsed !== null && b.rawContent);
    if (validBills.length === 0) return;

    setIsUploading(true);
    setGlobalError(null);

    try {
      const csvContents = validBills.map((b) => b.rawContent);
      const res = await authFetch(user, "/api/gcp-billing/import-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContents }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to import CSV bills");
      }

      setSuccessMessage(data.message || `Successfully imported ${validBills.length} bills!`);
      setStagedBills([]);
      fetchExistingInvoices();
      onImportComplete();
    } catch (err: any) {
      setGlobalError(err.message || "Failed to import CSV bills");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteInvoice = async (invoiceMonth: string, formattedMonth: string) => {
    if (!confirm(`Remove historical invoice for ${formattedMonth}?`)) return;

    try {
      const res = await authFetch(
        user,
        `/api/gcp-billing/import-csv?invoiceMonth=${encodeURIComponent(invoiceMonth)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        fetchExistingInvoices();
        onImportComplete();
      }
    } catch (err) {
      console.error("Failed to delete invoice:", err);
    }
  };

  const validCount = stagedBills.filter((b) => b.parsed !== null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Import Historical Bill CSVs</h2>
              <p className="text-xs text-slate-400">
                Drop multiple Google Cloud Cost Table CSVs to backfill past months all at once
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {globalError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Multi-file Drag and Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-5 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
            isDragging
              ? "border-cyan-400 bg-cyan-500/15 scale-[1.01]"
              : "border-white/15 bg-slate-800/40 hover:border-cyan-500/40 hover:bg-slate-800/60"
          }`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 mb-3 border border-cyan-500/20">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <span className="text-sm font-bold text-white">
            Drop multiple Cost Table CSVs here, or click to browse
          </span>
          <span className="text-xs text-slate-400 mt-1 max-w-sm">
            Select one or more monthly CSVs from Google Cloud Console → Billing → Cost Table
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Staged Bills Queue */}
        {stagedBills.length > 0 && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Staged for Import ({validCount} valid bills)
              </span>
              <button
                onClick={() => setStagedBills([])}
                className="text-xs text-slate-400 hover:text-rose-400 cursor-pointer"
              >
                Clear all
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {stagedBills.map((bill) => (
                <div
                  key={bill.id}
                  className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                    bill.error
                      ? "border-rose-500/30 bg-rose-500/10"
                      : "border-cyan-500/30 bg-cyan-500/5"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Receipt className={`h-5 w-5 shrink-0 ${bill.error ? "text-rose-400" : "text-cyan-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {bill.parsed ? (
                          <>
                            <span className="text-sm font-bold text-white">
                              {bill.parsed.formattedMonth}
                            </span>
                            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-mono px-2 py-0.5 rounded">
                              {bill.parsed.invoiceMonth}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-rose-300 truncate">
                            {bill.fileName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {bill.parsed ? (
                          <span>
                            Invoice #{bill.parsed.invoiceNumber || "N/A"} • {bill.parsed.serviceCount} services •{" "}
                            {bill.parsed.projectCount} projects
                          </span>
                        ) : (
                          <span className="text-rose-400">{bill.error}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    {bill.parsed && (
                      <span className="text-sm font-extrabold text-white">
                        {bill.parsed.currency} {bill.parsed.netCost.toFixed(2)}
                      </span>
                    )}
                    <button
                      onClick={() => removeStagedBill(bill.id)}
                      className="p-1 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      title="Remove from queue"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Import Button */}
            <button
              onClick={handleImportAll}
              disabled={isUploading || validCount === 0}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2.5 text-xs transition cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-500/20 mt-3"
            >
              {isUploading && <RefreshCw className="h-4 w-4 animate-spin" />}
              <span>Import {validCount} Bill{validCount > 1 ? "s" : ""}</span>
            </button>
          </div>
        )}

        {/* Existing Imported Invoices */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Historical Invoices ({existingInvoices.length})
            </h3>
            {existingInvoices.length > 0 && (
              <span className="text-[11px] text-emerald-400 font-medium">
                Integrated into Monthly Chart
              </span>
            )}
          </div>

          {isLoadingExisting ? (
            <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Loading imported invoices...</span>
            </div>
          ) : existingInvoices.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              No historical invoices imported yet. Drop multiple monthly CSVs above to backfill.
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {existingInvoices.map((inv) => (
                <div
                  key={inv.invoiceMonth}
                  className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-slate-800/40 hover:bg-slate-800/70 transition"
                >
                  <div className="flex items-center gap-3">
                    <Receipt className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{inv.formattedMonth}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({inv.invoiceMonth})</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {inv.serviceCount} services • {inv.projectCount} projects
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-extrabold text-xs text-white">
                      {inv.currency} {inv.netCost.toFixed(2)}
                    </span>
                    <button
                      onClick={() => handleDeleteInvoice(inv.invoiceMonth, inv.formattedMonth)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      title="Delete invoice"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
