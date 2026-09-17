"use client";

import React, { useState, useMemo } from "react";
import { InstamartTopItem } from "@/lib/instamart/types";
import { Award, Search, Filter } from "lucide-react";

interface InstamartTopItemsProps {
  items: InstamartTopItem[];
}

export function InstamartTopItems({ items }: InstamartTopItemsProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => set.add(it.category));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const matchCat =
        selectedCategory === "ALL" || it.category === selectedCategory;
      const matchSearch =
        !search.trim() ||
        it.name.toLowerCase().includes(search.toLowerCase().trim());
      return matchCat && matchSearch;
    });
  }, [items, selectedCategory, search]);

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Award className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Most Frequently Ordered Items
            </h3>
            <p className="text-xs text-slate-400">
              Your grocery essentials and recurring household staples
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <div className="relative">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search staples..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-cyan-400 focus:outline-none"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>
        </div>
      </div>

      {/* Items Leaderboard Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
              <th className="pb-2.5 pl-2">Rank</th>
              <th className="pb-2.5">Item Name</th>
              <th className="pb-2.5">Category</th>
              <th className="pb-2.5 text-center">Orders</th>
              <th className="pb-2.5 text-center">Total Qty</th>
              <th className="pb-2.5 text-right">Avg Unit Price</th>
              <th className="pb-2.5 pr-2 text-right">Total Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-sans">
            {filteredItems.map((it, idx) => {
              const isTop3 = idx < 3 && selectedCategory === "ALL" && !search;

              return (
                <tr
                  key={it.name}
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="py-3 pl-2">
                    <span
                      className={`inline-flex items-center justify-center h-5 w-5 rounded-md text-[11px] font-bold ${
                        isTop3
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono"
                          : "text-slate-500 font-mono"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="font-semibold text-white group-hover:text-cyan-300 transition">
                      {it.name}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className="inline-flex rounded-lg bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {it.category}
                    </span>
                  </td>
                  <td className="py-3 text-center font-mono text-slate-300">
                    <span className="font-bold text-white">{it.orderCount}</span> times
                  </td>
                  <td className="py-3 text-center font-mono text-slate-400">
                    {it.totalQuantity} units
                  </td>
                  <td className="py-3 text-right font-mono text-slate-300">
                    ₹{it.avgPrice}
                  </td>
                  <td className="py-3 pr-2 text-right font-mono font-bold text-white">
                    ₹{it.totalSpend.toLocaleString("en-IN")}
                  </td>
                </tr>
              );
            })}

            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No grocery items found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
