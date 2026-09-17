"use client";

import React, { useState } from "react";
import type { User } from "firebase/auth";
import { authFetch } from "@/lib/authFetch";
import { GcpBillingDatasetConfig } from "@/lib/gcpBilling/types";
import { X, Plus, Trash2, Check, Settings, Database, AlertCircle, RefreshCw } from "lucide-react";

interface GcpAccountManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  configs: GcpBillingDatasetConfig[];
  currentConfigId: string;
  onSelectConfig: (configId: string) => void;
  onConfigsUpdated: () => void;
}

export function GcpAccountManagerModal({
  isOpen,
  onClose,
  user,
  configs,
  currentConfigId,
  onSelectConfig,
  onConfigsUpdated,
}: GcpAccountManagerModalProps) {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [editingConfig, setEditingConfig] = useState<GcpBillingDatasetConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    projectId: "",
    datasetId: "cloud_billing",
    tableId: "",
    location: "asia-south1",
    currency: "INR",
    isDefault: false,
  });

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormData({
      id: `config_${Date.now()}`,
      name: "New GCP Account",
      projectId: "track-everything-ai",
      datasetId: "cloud_billing",
      tableId: "gcp_billing_export_resource_v1_",
      location: "asia-south1",
      currency: "INR",
      isDefault: configs.length === 0,
    });
    setEditingConfig(null);
    setIsAddingNew(true);
    setError(null);
  };

  const handleStartEdit = (config: GcpBillingDatasetConfig) => {
    setFormData({
      id: config.id,
      name: config.name,
      projectId: config.projectId,
      datasetId: config.datasetId,
      tableId: config.tableId,
      location: config.location,
      currency: config.currency || "INR",
      isDefault: Boolean(config.isDefault),
    });
    setEditingConfig(config);
    setIsAddingNew(true);
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(user, "/api/gcp-billing/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save configuration");
      }

      setIsAddingNew(false);
      setEditingConfig(null);
      onConfigsUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}"?`)) return;
    setLoading(true);
    setError(null);

    try {
      const res = await authFetch(user, `/api/gcp-billing/accounts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete configuration");
      }

      onConfigsUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to delete configuration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">GCP Billing Datasets</h2>
              <p className="text-xs text-slate-400">
                Manage BigQuery billing export tables and switch between accounts
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

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body content */}
        {!isAddingNew ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Configured Datasets ({configs.length})
              </span>
              <button
                onClick={handleStartAdd}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Dataset</span>
              </button>
            </div>

            <div className="space-y-2">
              {configs.map((config) => {
                const isSelected = config.id === currentConfigId;
                return (
                  <div
                    key={config.id}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition ${
                      isSelected
                        ? "border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/5"
                        : "border-white/10 bg-slate-800/40 hover:bg-slate-800/80"
                    }`}
                  >
                    <div
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        onSelectConfig(config.id);
                        onClose();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{config.name}</span>
                        {config.isDefault && (
                          <span className="text-[10px] bg-slate-700/80 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/20">
                            Default
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                            <Check className="h-3 w-3" /> Active
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs font-mono text-slate-400">
                        {config.projectId}.{config.datasetId}.{config.tableId ? config.tableId.slice(0, 32) : ""}...
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Location: {config.location}</span>
                        <span>•</span>
                        <span>Currency: {config.currency || "INR"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEdit(config)}
                        className="rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-white transition cursor-pointer"
                        title="Edit dataset config"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(config.id, config.name)}
                        className="rounded-xl p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition cursor-pointer"
                        title="Delete dataset config"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Add / Edit Form */
          <form onSubmit={handleSave} className="mt-6 space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h3 className="text-sm font-bold text-white">
                {editingConfig ? "Edit Dataset Configuration" : "Add GCP Billing Dataset"}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Back to list
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Account / Dataset Display Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Production GCP, Personal Projects"
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  GCP Project ID (Where BQ dataset is hosted)
                </label>
                <input
                  type="text"
                  required
                  value={formData.projectId}
                  onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                  placeholder="track-everything-ai"
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  BigQuery Dataset Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.datasetId}
                  onChange={(e) => setFormData({ ...formData, datasetId: e.target.value })}
                  placeholder="cloud_billing"
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  BigQuery Table ID
                </label>
                <input
                  type="text"
                  required
                  value={formData.tableId}
                  onChange={(e) => setFormData({ ...formData, tableId: e.target.value })}
                  placeholder="gcp_billing_export_resource_v1_..."
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Dataset Location
                </label>
                <input
                  type="text"
                  required
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="asia-south1, US, EU, etc."
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Currency Symbol / Code
                </label>
                <input
                  type="text"
                  required
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  placeholder="INR, USD, EUR"
                  className="w-full rounded-xl bg-slate-800 border border-white/10 px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                className="rounded border-white/20 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="isDefault" className="text-xs text-slate-300">
                Set as default dataset for Cloud Billing dashboard
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsAddingNew(false)}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2 text-xs transition disabled:opacity-50"
              >
                {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Save Dataset</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
