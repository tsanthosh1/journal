"use client";

import React from "react";
import { ParserConfigField } from "@/lib/subscriptionTypes";

interface ParserConfigFieldsProps {
  title: string;
  accentColor: "cyan" | "indigo";
  fields?: ParserConfigField[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
}

export function ParserConfigFields({
  title,
  accentColor,
  fields,
  values,
  onChange,
}: ParserConfigFieldsProps) {
  if (!fields || fields.length === 0) return null;

  const isCyan = accentColor === "cyan";
  const borderBg = isCyan
    ? "border-cyan-500/20 bg-cyan-950/40"
    : "border-indigo-500/20 bg-indigo-950/40";
  const titleColor = isCyan ? "text-cyan-300" : "text-indigo-300";
  const focusBorder = isCyan ? "focus:border-cyan-400" : "focus:border-indigo-400";

  return (
    <div className={`rounded-lg border ${borderBg} p-2.5 space-y-2`}>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${titleColor} block`}>
        ⚙️ {title}
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {fields.map((field) => (
          <div key={field.key} className="space-y-0.5">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              {field.label}
            </label>
            {field.type === "select" && field.options ? (
              <select
                value={values[field.key] ?? field.defaultValue ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                className={`w-full min-h-[34px] text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white ${focusBorder} focus:outline-none cursor-pointer`}
              >
                {field.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "number" ? "number" : "text"}
                placeholder={field.placeholder || ""}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  onChange(
                    field.key,
                    field.type === "number" ? Number(e.target.value) : e.target.value,
                  )
                }
                className={`w-full min-h-[34px] font-mono text-xs rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1 text-white placeholder-slate-500 ${focusBorder} focus:outline-none`}
              />
            )}
            {field.description && (
              <span className="text-[9px] text-slate-400 block">{field.description}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
