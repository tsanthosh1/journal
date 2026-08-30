"use client";

import React, { useState } from "react";
import { SubscriptionCategory } from "@/lib/subscriptionTypes";

interface SubscriptionAvatarProps {
  name: string;
  category?: SubscriptionCategory | string;
  imageUrl?: string | null;
  icon?: string | null;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const CATEGORY_GRADIENTS: Record<string, string> = {
  "Loans & EMIs": "from-teal-600 to-emerald-700 text-teal-100 font-bold",
  "Credit Cards": "from-indigo-600 to-purple-600 text-indigo-100",
  "Savings & Schemes": "from-amber-500 to-yellow-600 text-amber-950 font-black",
  Entertainment: "from-rose-500 to-pink-600 text-rose-100",
  Services: "from-emerald-600 to-teal-600 text-emerald-100",
  Utilities: "from-cyan-600 to-blue-600 text-cyan-100",
  Insurance: "from-violet-600 to-indigo-700 text-violet-100",
  "Software & Tools": "from-sky-500 to-cyan-600 text-sky-100",
  "Housing & Rent": "from-orange-500 to-amber-600 text-orange-100",
  Other: "from-slate-700 to-zinc-700 text-slate-200",
};

const SIZE_CLASSES = {
  sm: "h-9 w-9 text-xs rounded-xl",
  md: "h-12 w-12 text-sm rounded-2xl",
  lg: "h-14 w-14 text-base rounded-2xl",
  xl: "h-16 w-16 text-lg rounded-2xl",
  "2xl": "h-20 w-20 text-2xl rounded-3xl",
};

export function SubscriptionAvatar({
  name,
  category = "Other",
  imageUrl,
  icon,
  size = "lg",
  className = "",
}: SubscriptionAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const rawSource = imageUrl || icon;
  const isImageSrc =
    Boolean(rawSource) &&
    !imageError &&
    (rawSource!.startsWith("http://") ||
      rawSource!.startsWith("https://") ||
      rawSource!.startsWith("data:") ||
      rawSource!.startsWith("/"));

  // Initials generator (e.g. "GRT Gold Scheme" -> "GR", "Netflix" -> "NX")
  const words = (name || "").trim().split(/\s+/);
  let initials = "";
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words[0]?.length >= 2) {
    initials = words[0].slice(0, 2).toUpperCase();
  } else {
    initials = (words[0]?.[0] || "?").toUpperCase();
  }

  const gradient = CATEGORY_GRADIENTS[category] || CATEGORY_GRADIENTS.Other;
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.lg;

  if (isImageSrc) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden bg-white border border-white/20 shadow-xl flex items-center justify-center p-0 ${sizeClass} ${className}`}
      >
        <img
          src={rawSource!}
          alt={name}
          onError={() => setImageError(true)}
          className="h-full w-full object-cover rounded-[inherit]"
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback 1: Custom Emoji string if provided in icon
  if (icon && !icon.startsWith("http") && !icon.startsWith("data:")) {
    return (
      <div
        className={`shrink-0 flex items-center justify-center bg-slate-800 border border-white/10 shadow-sm ${sizeClass} ${className}`}
      >
        <span className="text-xl sm:text-2xl">{icon}</span>
      </div>
    );
  }

  // Fallback 2: Category gradient badge with crisp initials / emoji
  return (
    <div
      className={`shrink-0 flex items-center justify-center bg-gradient-to-br font-bold shadow-lg border border-white/15 ${gradient} ${sizeClass} ${className}`}
      title={name}
    >
      <span className="leading-none tracking-tight">{initials}</span>
    </div>
  );
}
