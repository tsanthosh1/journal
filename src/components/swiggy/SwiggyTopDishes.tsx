"use client";

import React, { useState, useMemo } from "react";
import { SwiggyCuisine, SwiggyTopDish } from "@/lib/swiggy/types";
import { UtensilsCrossed, Search, Filter } from "lucide-react";

interface SwiggyTopDishesProps {
  dishes: SwiggyTopDish[];
}

export function SwiggyTopDishes({ dishes }: SwiggyTopDishesProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCuisine, setSelectedCuisine] = useState<string>("ALL");

  const cuisines = useMemo(() => {
    const set = new Set<string>();
    dishes.forEach((d) => set.add(d.cuisine));
    return ["ALL", ...Array.from(set)];
  }, [dishes]);

  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      const matchSearch =
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.cuisine.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCuisine =
        selectedCuisine === "ALL" || d.cuisine === selectedCuisine;
      return matchSearch && matchCuisine;
    });
  }, [dishes, searchTerm, selectedCuisine]);

  return (
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-slate-900/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
            <UtensilsCrossed className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              Favorite Dishes & Meals
            </h3>
            <p className="text-[11px] text-slate-400">
              Ranked by lifetime frequency & spend
            </p>
          </div>
        </div>

        {/* Search & Cuisine Filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 w-36 sm:w-44"
            />
          </div>

          <div className="relative">
            <select
              value={selectedCuisine}
              onChange={(e) => setSelectedCuisine(e.target.value)}
              className="appearance-none pl-2.5 pr-7 py-1.5 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white focus:outline-none focus:border-orange-500/50 cursor-pointer"
            >
              {cuisines.map((c) => (
                <option key={c} value={c} className="bg-slate-900 text-white">
                  {c === "ALL" ? "All Cuisines" : c}
                </option>
              ))}
            </select>
            <Filter className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Dishes Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/5 text-slate-400">
              <th className="pb-3 pl-1 font-semibold w-10">#</th>
              <th className="pb-3 font-semibold">Dish</th>
              <th className="pb-3 font-semibold">Cuisine</th>
              <th className="pb-3 font-semibold text-center">Orders</th>
              <th className="pb-3 font-semibold text-center">Qty</th>
              <th className="pb-3 font-semibold text-right">Avg Price</th>
              <th className="pb-3 pr-1 font-semibold text-right">Total Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {filteredDishes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No dishes match the filter
                </td>
              </tr>
            ) : (
              filteredDishes.map((dish, idx) => (
                <tr
                  key={dish.name}
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="py-2.5 pl-1 font-mono text-slate-500 text-[11px]">
                    {idx + 1}
                  </td>
                  <td className="py-2.5 font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                    {dish.name}
                  </td>
                  <td className="py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.05] text-slate-300 border border-white/5">
                      {dish.cuisine}
                    </span>
                  </td>
                  <td className="py-2.5 text-center font-mono text-slate-300">
                    {dish.orderCount}
                  </td>
                  <td className="py-2.5 text-center font-mono text-slate-400">
                    {dish.totalQuantity}
                  </td>
                  <td className="py-2.5 text-right font-mono text-slate-400">
                    ₹{Math.round(dish.avgPrice)}
                  </td>
                  <td className="py-2.5 pr-1 text-right font-mono font-bold text-white">
                    ₹{dish.totalSpend.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
