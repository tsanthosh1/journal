"use client";

import React, { useState, useEffect, useRef } from "react";
import { SubscriptionAvatar } from "./SubscriptionAvatar";
import { SubscriptionCategory } from "@/lib/subscriptionTypes";

interface ThumbnailPickerProps {
  name: string;
  category: SubscriptionCategory | string;
  imageUrl: string;
  onChange: (url: string) => void;
}

interface ImageCandidate {
  url: string;
  title: string;
  source: string;
  domain?: string;
}

const POPULAR_PRESETS: Array<{ name: string; domain: string; url: string }> = [
  { name: "GRT Gold", domain: "grtjewels.com", url: "https://logo.clearbit.com/grtjewels.com" },
  { name: "Tanishq", domain: "tanishq.co.in", url: "https://logo.clearbit.com/tanishq.co.in" },
  { name: "Netflix", domain: "netflix.com", url: "https://logo.clearbit.com/netflix.com" },
  { name: "Airtel", domain: "airtel.in", url: "https://logo.clearbit.com/airtel.in" },
  { name: "Amazon Prime", domain: "primevideo.com", url: "https://logo.clearbit.com/primevideo.com" },
  { name: "Spotify", domain: "spotify.com", url: "https://logo.clearbit.com/spotify.com" },
  { name: "YouTube", domain: "youtube.com", url: "https://logo.clearbit.com/youtube.com" },
  { name: "Apple", domain: "apple.com", url: "https://logo.clearbit.com/apple.com" },
  { name: "HDFC Bank", domain: "hdfcbank.com", url: "https://logo.clearbit.com/hdfcbank.com" },
  { name: "Axis Bank", domain: "axisbank.com", url: "https://logo.clearbit.com/axisbank.com" },
  { name: "ICICI Bank", domain: "icicibank.com", url: "https://logo.clearbit.com/icicibank.com" },
  { name: "SBI Card", domain: "sbicard.com", url: "https://logo.clearbit.com/sbicard.com" },
  { name: "Swiggy", domain: "swiggy.com", url: "https://logo.clearbit.com/swiggy.com" },
  { name: "Zomato", domain: "zomato.com", url: "https://logo.clearbit.com/zomato.com" },
];

export function ThumbnailPicker({
  name,
  category,
  imageUrl,
  onChange,
}: ThumbnailPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"search" | "upload" | "url">("search");
  const [searchQuery, setSearchQuery] = useState(name || "");
  const [searchResults, setSearchResults] = useState<ImageCandidate[]>([]);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync search query with subscription name when opening or changing name
  useEffect(() => {
    if (name && !searchQuery) {
      setSearchQuery(name);
    }
  }, [name]);

  const handleSearch = async (queryToSearch: string) => {
    setIsSearching(true);
    setFailedUrls(new Set());
    try {
      const q = encodeURIComponent(queryToSearch.trim());
      const res = await fetch(`/api/subscriptions/search-images?q=${q}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Error searching images:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleOpenModal = () => {
    setIsOpen(true);
    const q = (searchQuery || name || "").trim();
    if (q) {
      handleSearch(q);
    } else {
      handleSearch("");
    }
  };

  const handleSelectImage = (url: string) => {
    onChange(url);
    setIsOpen(false);
  };

  const handleRemoveImage = () => {
    onChange("");
  };

  // Handle client-side image compression to snappy Data URL
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/webp", 0.85);
          onChange(dataUrl);
          setIsOpen(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <label className="block text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
        Icon / Brand Thumbnail
      </label>

      <div className="flex items-center gap-4">
        {/* Live Preview Avatar */}
        <div className="relative group">
          <SubscriptionAvatar
            name={name || "Service"}
            category={category}
            imageUrl={imageUrl}
            size="xl"
            className="ring-2 ring-white/10 group-hover:ring-cyan-400/50 transition cursor-pointer shadow-xl"
          />
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleOpenModal}
            className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer flex items-center gap-2"
          >
            <span className="text-sm">🔍</span>
            {imageUrl ? "Change Logo" : "Choose / Search Logo"}
          </button>

          {imageUrl && (
            <button
              type="button"
              onClick={handleRemoveImage}
              className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition cursor-pointer"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Modal / Popover */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <span className="text-base">🖼️</span>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  Select Subscription Thumbnail
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center border-b border-white/10 bg-slate-950/20 px-5 gap-4">
              <button
                type="button"
                onClick={() => setActiveTab("search")}
                className={`py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === "search"
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🔍 Search Online
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === "upload"
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                📤 Upload Image
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("url")}
                className={`py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  activeTab === "url"
                    ? "border-cyan-400 text-cyan-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                🔗 Image URL
              </button>
            </div>

            {/* Tab Content */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Tab 1: Search Online */}
              {activeTab === "search" && (
                <div className="space-y-4">
                  {/* Search Bar */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search service name (e.g. GRT, Netflix, Airtel, HDFC)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSearch(searchQuery);
                        }
                      }}
                      className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleSearch(searchQuery)}
                      disabled={isSearching}
                      className="rounded-xl bg-cyan-500/20 border border-cyan-500/30 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/30 transition cursor-pointer"
                    >
                      {isSearching ? "Searching..." : "Search"}
                    </button>
                  </div>

                  {/* Quick Popular Brand Pills */}
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-slate-500 block mb-1.5">
                      Popular Brands:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {POPULAR_PRESETS.map((p) => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => {
                            setSearchQuery(p.name);
                            handleSearch(p.name);
                          }}
                          className="rounded-lg border border-white/10 bg-slate-800/80 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-white transition cursor-pointer flex items-center gap-1.5"
                        >
                          <img
                            src={p.url}
                            alt={p.name}
                            className="h-3.5 w-3.5 object-contain rounded"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                          {p.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Search Results Grid */}
                  <div>
                    {(() => {
                      const displayedResults = searchResults.filter((item) => !failedUrls.has(item.url));
                      return (
                        <>
                          <span className="text-xs font-semibold text-slate-300 block mb-2">
                            Results ({displayedResults.length})
                          </span>

                          {isSearching ? (
                            <div className="py-10 text-center text-slate-400 text-xs">
                              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-r-transparent mb-2" />
                              <p>Searching official logos & high-res icons...</p>
                            </div>
                          ) : displayedResults.length === 0 ? (
                            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-8 text-center text-xs text-slate-500">
                              No working logo results found for &ldquo;{searchQuery}&rdquo;. Try another keyword or upload an image directly.
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                              {displayedResults.map((item, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSelectImage(item.url)}
                                  className="group flex flex-col items-center justify-center p-4 rounded-2xl border border-white/10 bg-slate-800/60 hover:border-cyan-400 hover:bg-cyan-500/10 transition cursor-pointer shadow-md"
                                >
                                  <div className="h-20 w-20 rounded-2xl bg-white p-1 flex items-center justify-center border border-white/20 group-hover:scale-105 transition shadow-md overflow-hidden">
                                    <img
                                      src={item.url}
                                      alt={item.title}
                                      className="h-full w-full object-contain rounded-xl"
                                      loading="lazy"
                                      onError={() => {
                                        setFailedUrls((prev) => {
                                          const next = new Set(prev);
                                          next.add(item.url);
                                          return next;
                                        });
                                      }}
                                    />
                                  </div>
                                  <span className="mt-2.5 text-xs font-semibold text-slate-200 truncate max-w-full text-center group-hover:text-white">
                                    {item.title}
                                  </span>
                                  <span className="text-[10px] text-slate-500 uppercase mt-0.5 font-medium">
                                    {item.source}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Tab 2: Upload Image */}
              {activeTab === "upload" && (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 hover:border-cyan-400/60 rounded-2xl p-8 text-center cursor-pointer bg-white/[0.02] hover:bg-cyan-500/5 transition flex flex-col items-center justify-center gap-2"
                  >
                    <span className="text-3xl">📁</span>
                    <span className="text-sm font-bold text-white">Click or drag image here</span>
                    <span className="text-xs text-slate-400">
                      Supports PNG, JPG, WebP, SVG (Auto-compressed to 256x256)
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>
              )}

              {/* Tab 3: Paste Image URL */}
              {activeTab === "url" && (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-300">
                    Direct Image URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/logo.png"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 rounded-xl border border-white/10 bg-slate-800 px-3.5 py-2 text-xs text-white focus:border-cyan-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (urlInput.trim()) {
                          handleSelectImage(urlInput.trim());
                        }
                      }}
                      className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
                    >
                      Apply
                    </button>
                  </div>
                  {urlInput && (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-slate-800/50">
                      <img
                        src={urlInput}
                        alt="Preview"
                        className="h-10 w-10 object-contain rounded-lg bg-white/5 border border-white/10"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <span className="text-xs text-slate-300 truncate">{urlInput}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
