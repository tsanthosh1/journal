"use client";

import React, { useState, DragEvent } from "react";
import { Upload, X, FileCode, CheckCircle2, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { AmazonImportResult } from "@/lib/amazon/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (result: AmazonImportResult) => void;
  uploadEndpoint: (jsonContents: string[], truncateFirst: boolean) => Promise<AmazonImportResult>;
}

export function AmazonUploadModal({
  isOpen,
  onClose,
  onImportSuccess,
  uploadEndpoint,
}: Props) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [truncateFirst, setTruncateFirst] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = () => {
    setIsDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.name.toLowerCase().endsWith(".json"),
    );
    if (files.length > 0) {
      setSelectedFiles(files);
      setErrorMessage(null);
    } else {
      setErrorMessage("Please drop valid .json Amazon order export files.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
      ? Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith(".json"))
      : [];
    if (files.length > 0) {
      setSelectedFiles(files);
      setErrorMessage(null);
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage("Select at least one Amazon JSON file to upload.");
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const contents = await Promise.all(selectedFiles.map((f) => f.text()));
      const result = await uploadEndpoint(contents, truncateFirst);
      onImportSuccess(result);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to upload and process Amazon JSON file.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-4xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-md">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">
                Upload Amazon Orders JSON
              </h3>
              <p className="text-xs text-slate-400">
                Supports new JSON export with product images & statuses
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="mt-5 flex flex-col gap-4">
          <label
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition ${
              isDragActive
                ? "border-amber-400 bg-amber-400/10"
                : "border-white/10 bg-white/2 hover:border-white/20 hover:bg-white/4"
            }`}
          >
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={handleFileChange}
              className="sr-only"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-amber-400">
              <FileCode className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-semibold text-white">
              Drag & drop JSON export here, or click to browse
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Select your exported Amazon orders file (e.g. <code>amazon-orders-*.json</code>)
            </p>
          </label>

          {/* Selected files list */}
          {selectedFiles.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <span className="text-xs font-semibold text-slate-400">
                Selected {selectedFiles.length} file{selectedFiles.length === 1 ? "" : "s"}:
              </span>
              <div className="max-h-32 overflow-y-auto">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs text-slate-200 py-1"
                  >
                    <span className="font-mono truncate max-w-[280px]">
                      {file.name}
                    </span>
                    <span className="text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Truncate option checkbox */}
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/2 p-3 text-xs cursor-pointer hover:bg-white/4">
            <input
              type="checkbox"
              checked={truncateFirst}
              onChange={(e) => setTruncateFirst(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-slate-950 text-amber-400 focus:ring-amber-400 focus:ring-offset-slate-900"
            />
            <div className="flex flex-col">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                Clear existing data before uploading
              </span>
              <span className="text-slate-400 text-[11px]">
                Truncates existing Amazon records and replaces them completely with this new export.
              </span>
            </div>
          </label>

          {/* Error message */}
          {errorMessage ? (
            <div className="flex items-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          {/* Duplicate detection guarantee note */}
          <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-3 text-xs text-slate-400">
            <span className="font-semibold text-amber-300">⚡ Smart Duplicate Detection:</span>{" "}
            Orders are uniquely identified by Amazon Order ID. Any duplicate entries in the source file or database are detected and de-duplicated automatically.
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="cursor-pointer rounded-2xl px-4 py-2 text-sm font-semibold text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={selectedFiles.length === 0 || isUploading}
            className="inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-amber-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing Orders...
              </>
            ) : (
              `Process ${selectedFiles.length > 0 ? selectedFiles.length : ""} JSON`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
