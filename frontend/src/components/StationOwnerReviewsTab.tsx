"use client";

import React, { useState } from "react";
import { Star, MessageSquare, ThumbsUp, ShieldCheck, CheckCircle2, Filter } from "lucide-react";

interface Review {
  id: string;
  driverName: string;
  driverVehicle: string;
  rating: number;
  date: string;
  bay: string;
  comment: string;
  helpfulCount: number;
  ownerReply?: string;
}

const REVIEWS_DATA: Review[] = [
  {
    id: "REV-101",
    driverName: "Rahul M.",
    driverVehicle: "Porsche Taycan GTS",
    rating: 5,
    date: "Today, 4:20 PM",
    bay: "Bay 01 (180 kW Ultra DC)",
    comment:
      "Hit 150+ kW constant DC speed right away. Reached 80% from 18% in just 22 minutes. Spot booking saved me from waiting during rush hour.",
    helpfulCount: 14,
    ownerReply: "Thank you Rahul! We keep Bay 01 thermally optimized for high-voltage fast architectures.",
  },
  {
    id: "REV-102",
    driverName: "Pooja S.",
    driverVehicle: "Tata Nexon EV Max",
    rating: 5,
    date: "Today, 1:45 PM",
    bay: "Bay 02 (120 kW Fast DC)",
    comment:
      "Very smooth barrier unlock with the 4-digit PIN. Food mall right next door. Easily the best maintained charging hub on the expressway.",
    helpfulCount: 8,
  },
  {
    id: "REV-103",
    driverName: "Vikram K.",
    driverVehicle: "Hyundai Ioniq 5",
    rating: 5,
    date: "Yesterday",
    bay: "Bay 01 (180 kW Ultra DC)",
    comment:
      "Super clean connectors and properly shaded stalls. Cable length was generous enough to reach my front port with zero strain.",
    helpfulCount: 19,
  },
  {
    id: "REV-104",
    driverName: "Aditya D.",
    driverVehicle: "BYD Atto 3",
    rating: 4,
    date: "2 days ago",
    bay: "Bay 03 (60 kW Fast DC)",
    comment:
      "Reliable charging and fair tariff. Screen was clear to read in sunlight. Would love a squeegee bucket for windshields.",
    helpfulCount: 5,
    ownerReply: "Great suggestion Aditya! We are installing a windshield cleaning stand next week.",
  },
];

export function StationOwnerReviewsTab({
  stationName,
  averageRating = 4.8,
  totalReviews = 142,
}: {
  stationName: string;
  averageRating?: number;
  totalReviews?: number;
}) {
  const [filterRating, setFilterRating] = useState<number | "all">("all");
  const [replyOpenId, setReplyOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string>("");
  const [reviews, setReviews] = useState<Review[]>(REVIEWS_DATA);

  const filteredReviews = reviews.filter((r) => {
    if (filterRating === "all") return true;
    return r.rating === filterRating;
  });

  const handlePostReply = (id: string) => {
    if (!replyText.trim()) return;
    setReviews((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ownerReply: replyText.trim() } : r
      )
    );
    setReplyOpenId(null);
    setReplyText("");
  };

  return (
    <div className="space-y-4">
      {/* ── OVERALL RATING HERO CARD ──────────────────────────────── */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-black/[0.08] shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-[#111312]">Driver Feedback</h3>
            <p className="text-[10px] text-black/50">Verified visits</p>
          </div>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
            {averageRating} Stars
          </span>
        </div>

        <div className="flex items-center gap-4 pt-1">
          {/* Big Rating Number */}
          <div className="text-center shrink-0 pr-3 border-r border-black/[0.06]">
            <div className="text-3xl sm:text-4xl font-bold text-[#111312] font-mono">
              {averageRating}
            </div>
            <div className="flex items-center justify-center gap-0.5 mt-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={12}
                  className="fill-[#F59E0B] text-[#F59E0B]"
                />
              ))}
            </div>
            <div className="text-[10px] text-[#767D78] mt-1 font-mono">
              {totalReviews} verified reviews
            </div>
          </div>

          {/* Star Percentage Bars */}
          <div className="flex-1 space-y-1 text-[10px] font-mono text-[#767D78]">
            {[
              { stars: 5, pct: 84 },
              { stars: 4, pct: 12 },
              { stars: 3, pct: 3 },
              { stars: 2, pct: 1 },
              { stars: 1, pct: 0 },
            ].map((row) => (
              <div key={row.stars} className="flex items-center gap-2">
                <span className="w-4 text-right">{row.stars}★</span>
                <div className="flex-1 h-1.5 bg-black/[0.05] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#F59E0B] rounded-full"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <span className="w-6 text-right">{row.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FILTER PILLS ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setFilterRating("all")}
          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all ${
            filterRating === "all"
              ? "bg-[#111312] text-white"
              : "bg-white text-[#525854] border border-black/[0.08]"
          }`}
        >
          All Reviews ({reviews.length})
        </button>
        {[5, 4].map((stars) => (
          <button
            key={stars}
            type="button"
            onClick={() => setFilterRating(stars)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
              filterRating === stars
                ? "bg-[#111312] text-white"
                : "bg-white text-[#525854] border border-black/[0.08]"
            }`}
          >
            <span>{stars} Stars</span>
            <Star size={11} className="fill-[#F59E0B] text-[#F59E0B]" />
          </button>
        ))}
      </div>

      {/* ── REVIEWS FEED ──────────────────────────────────────────── */}
      <div className="space-y-3">
        {filteredReviews.map((rev) => (
          <div
            key={rev.id}
            className="p-4 rounded-2xl bg-white border border-black/[0.08] shadow-xs space-y-2.5"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#111312]">
                    {rev.driverName}
                  </span>
                  <span className="text-[10px] font-mono text-[#15803D] bg-[#F0FDF4] px-1.5 py-0.2 rounded font-semibold">
                    Verified Driver
                  </span>
                </div>
                <div className="text-[10.5px] text-[#767D78] mt-0.5 font-mono">
                  {rev.driverVehicle} • {rev.bay}
                </div>
              </div>

              <div className="text-right">
                <div className="flex items-center gap-0.5 justify-end">
                  {[...Array(rev.rating)].map((_, i) => (
                    <Star
                      key={i}
                      size={11}
                      className="fill-[#F59E0B] text-[#F59E0B]"
                    />
                  ))}
                </div>
                <div className="text-[10px] text-[#767D78] mt-0.5 font-mono">
                  {rev.date}
                </div>
              </div>
            </div>

            <p className="text-xs text-[#333835] leading-relaxed">
              {rev.comment}
            </p>

            {/* Owner Reply if exists */}
            {rev.ownerReply && (
              <div className="p-3 bg-[#FAF9F6] rounded-xl border border-black/[0.05] text-xs space-y-1">
                <div className="text-[10px] font-bold text-[#111312] uppercase font-mono flex items-center gap-1">
                  <ShieldCheck size={12} className="text-[#16A34A]" />
                  <span>Station Owner Reply</span>
                </div>
                <p className="text-[11.5px] text-[#525854]">
                  {rev.ownerReply}
                </p>
              </div>
            )}

            {/* Reply Action */}
            {!rev.ownerReply && (
              <div>
                {replyOpenId === rev.id ? (
                  <div className="space-y-2 pt-1 animate-in fade-in">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write a response as the station operator..."
                      rows={2}
                      className="w-full text-xs p-2.5 rounded-xl border border-black/[0.1] bg-[#FAF9F6] focus:outline-2 focus:outline-[#111312]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyOpenId(null)}
                        className="py-1.5 px-3 bg-[#F4F3EE] text-[#525854] text-xs rounded-xl font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePostReply(rev.id)}
                        className="py-1.5 px-3 bg-[#111312] text-white text-xs rounded-xl font-bold cursor-pointer"
                      >
                        Send Reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReplyOpenId(rev.id)}
                    className="text-[11px] text-[#16A34A] hover:underline font-semibold flex items-center gap-1 cursor-pointer pt-1"
                  >
                    <MessageSquare size={11} />
                    <span>Reply as Operator</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
