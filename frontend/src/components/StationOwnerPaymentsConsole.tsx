'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  Car,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
  ChevronRight,
  ArrowDownLeft,
  Building2,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  Coins,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  getStationOwnerBookings,
  type BookingResponseItem,
} from '@/lib/driverApi';

interface Receipt {
  id: string;
  type: 'charging' | 'parking';
  bay: string;
  energyOrDuration: string;
  grossAmount: string;
  netPayout: string;
  timeAgo: string;
  paymentMethod: string;
}

const RECENT_RECEIPTS: Receipt[] = [
  {
    id: 'TXN-9842',
    type: 'charging',
    bay: 'Bay 1 (180kW DC)',
    energyOrDuration: '42.5 kWh • 32 min',
    grossAmount: '₹786',
    netPayout: '₹765',
    timeAgo: '8m ago',
    paymentMethod: 'UPI'
  },
  {
    id: 'TXN-9841',
    type: 'parking',
    bay: 'Bay 2 (Hold)',
    energyOrDuration: '45 min reservation hold',
    grossAmount: '₹60',
    netPayout: '₹58',
    timeAgo: '24m ago',
    paymentMethod: 'Card'
  },
  {
    id: 'TXN-9840',
    type: 'charging',
    bay: 'Bay 4 (120kW DC)',
    energyOrDuration: '58.0 kWh • 44 min',
    grossAmount: '₹1,073',
    netPayout: '₹1,048',
    timeAgo: '51m ago',
    paymentMethod: 'UPI'
  },
  {
    id: 'TXN-9839',
    type: 'parking',
    bay: 'Bay 3 (Hold)',
    energyOrDuration: '60 min reservation hold',
    grossAmount: '₹80',
    netPayout: '₹78',
    timeAgo: '1h ago',
    paymentMethod: 'UPI'
  },
  {
    id: 'TXN-9838',
    type: 'charging',
    bay: 'Bay 2 (22kW AC)',
    energyOrDuration: '18.4 kWh • 55 min',
    grossAmount: '₹340',
    netPayout: '₹332',
    timeAgo: '2h ago',
    paymentMethod: 'EVverse Pay'
  },
];

const WEEKLY_DATA = [
  { day: 'Mon', revenue: 19400, height: '62%' },
  { day: 'Tue', revenue: 21200, height: '70%' },
  { day: 'Wed', revenue: 18900, height: '58%' },
  { day: 'Thu', revenue: 23100, height: '78%' },
  { day: 'Fri', revenue: 26800, height: '88%' },
  { day: 'Sat', revenue: 31200, height: '100%', isPeak: true },
  { day: 'Sun', revenue: 24850, height: '82%', isToday: true },
];

export function StationOwnerPaymentsConsole() {
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month'>('today');
  const [payoutSent, setPayoutSent] = useState(false);
  const [showTariffSheet, setShowTariffSheet] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'charging' | 'parking'>('all');

  // Live on-chain bookings from SQLite persistence
  const [onChainBookings, setOnChainBookings] = useState<BookingResponseItem[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedTxHash, setCopiedTxHash] = useState<string | null>(null);

  // Interactive rates
  const [ratePerKwh, setRatePerKwh] = useState(18.5);
  const [parkingRatePerHour, setParkingRatePerHour] = useState(50);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const fetchBookings = useCallback(() => {
    setIsLoadingBookings(true);
    setLoadError(null);
    getStationOwnerBookings()
      .then((res) => {
        setOnChainBookings(res.items || []);
      })
      .catch((err) => {
        console.warn("[StationOwner] Failed to load on-chain bookings:", err);
        setLoadError(
          err?.message || "Unable to reach EVverse backend server."
        );
      })
      .finally(() => {
        setIsLoadingBookings(false);
      });
  }, []);

  useEffect(() => {
    let ignore = false;
    getStationOwnerBookings()
      .then((res) => {
        if (!ignore) {
          setOnChainBookings(res.items || []);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn("[StationOwner] Failed to load on-chain bookings:", err);
          setLoadError(
            err?.message || "Unable to reach EVverse backend server."
          );
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoadingBookings(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleCopyTx = (txHash: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(txHash);
      setCopiedTxHash(txHash);
      setTimeout(() => setCopiedTxHash(null), 2000);
    }
  };

  const truncateTx = (hash: string) => {
    if (!hash || hash.length < 14) return hash || '';
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const handleInstantPayout = () => {
    setPayoutSent(true);
    setTimeout(() => {
      setPayoutSent(false);
    }, 3500);
  };

  const handleSaveRates = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      setShowTariffSheet(false);
    }, 1200);
  };

  const filteredReceipts = RECENT_RECEIPTS.filter((r) => {
    if (activeFilter === 'all') return true;
    return r.type === activeFilter;
  });

  return (
    <div className="space-y-4">
      {/* ── Minimalist Hero Balance Card ── */}
      <div className="rounded-3xl bg-[#111312] text-white p-5 shadow-lg relative overflow-hidden">
        {/* Soft background radial highlight */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-[#C8F369]/10 rounded-full blur-2xl pointer-events-none" />

        {/* Top bar with time switcher */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium tracking-wide uppercase text-white/50">
              Total Revenue
            </span>
            <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10">
              Simulated Telemetry
            </span>
          </div>
          <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-full">
            {(['today', 'week', 'month'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full transition-all capitalize ${
                  timeRange === range
                    ? 'bg-[#C8F369] text-[#111312] shadow-xs'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Amount Display */}
        <div className="pt-4 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-white font-mono">
              {timeRange === 'today' ? '₹24,850' : timeRange === 'week' ? '₹1,65,450' : '₹6,84,200'}
            </span>
            <span className="text-xs font-semibold text-[#C8F369] flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" />
              +18.4%
            </span>
          </div>
          <p className="text-[11px] text-white/50 mt-1">
            {timeRange === 'today' ? '38 driver sessions completed today' : 'Consistent growth across all 6 bays'}
          </p>
        </div>

        {/* Split Bar: Energy vs Parking */}
        <div className="space-y-1.5 pt-3 border-t border-white/10">
          <div className="flex justify-between text-[11px] text-white/70">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#C8F369]" />
              Energy: ₹21,450 (86%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-sky-400" />
              Parking Holds: ₹3,400 (14%)
            </span>
          </div>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden flex">
            <div className="h-full bg-[#C8F369] rounded-l-full" style={{ width: '86%' }} />
            <div className="h-full bg-sky-400 rounded-r-full" style={{ width: '14%' }} />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleInstantPayout}
            disabled={payoutSent}
            className="w-full py-2.5 px-3 rounded-2xl bg-[#C8F369] text-[#111312] text-xs font-bold flex items-center justify-center gap-1.5 active:scale-98 transition-all disabled:opacity-70"
          >
            {payoutSent ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800" />
                <span>Transferred</span>
              </>
            ) : (
              <>
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Transfer to Bank</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowTariffSheet(!showTariffSheet)}
            className="w-full py-2.5 px-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Set Tariffs</span>
          </button>
        </div>
      </div>

      {/* ── Slide-down Tariff & Rate Setting Form ── */}
      {showTariffSheet && (
        <form
          onSubmit={handleSaveRates}
          className="rounded-2xl bg-white p-4 border border-black/[0.08] shadow-sm space-y-3 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
            <span className="text-xs font-bold text-[#111312]">Station Rates & Tariffs</span>
            <span className="text-[10px] text-black/50">Applies immediately to new drivers</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-black/60 block mb-1">
                Electricity Rate (₹/kWh)
              </label>
              <input
                type="number"
                step="0.5"
                value={ratePerKwh}
                onChange={(e) => setRatePerKwh(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-black/[0.03] border border-black/10 focus:border-black focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-semibold text-black/60 block mb-1">
                Parking Hold (₹/hour)
              </label>
              <input
                type="number"
                step="5"
                value={parkingRatePerHour}
                onChange={(e) => setParkingRatePerHour(parseFloat(e.target.value) || 0)}
                className="w-full text-xs font-semibold px-3 py-2 rounded-xl bg-black/[0.03] border border-black/10 focus:border-black focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 rounded-xl bg-[#111312] text-white text-xs font-bold flex items-center justify-center gap-1.5"
          >
            {savedSuccess ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#C8F369]" />
                <span>Rates Updated</span>
              </>
            ) : (
              <span>Save Rates</span>
            )}
          </button>
        </form>
      )}

      {/* ── 7-Day Revenue Trend ── */}
      <div className="rounded-2xl bg-white p-4 border border-black/[0.06] shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-[#111312]">7-Day Revenue History</h3>
            <p className="text-[10px] text-black/40">Daily earnings trajectory</p>
          </div>
          <span className="text-[11px] font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
            Avg ₹23.8k/day
          </span>
        </div>

        {/* Minimal Bar Visualization */}
        <div className="h-28 flex items-end justify-between gap-1.5 pt-4 pb-1 border-b border-black/[0.05]">
          {WEEKLY_DATA.map((item) => (
            <div key={item.day} className="flex-1 flex flex-col items-center gap-1 group">
              <div className="w-full max-w-[20px] bg-black/[0.04] rounded-t-sm h-20 flex items-end">
                <div
                  style={{ height: item.height }}
                  className={`w-full rounded-t-sm transition-all ${
                    item.isToday
                      ? 'bg-[#111312]'
                      : item.isPeak
                      ? 'bg-[#111312]/80'
                      : 'bg-[#111312]/30 group-hover:bg-[#111312]/60'
                  }`}
                />
              </div>
              <span className={`text-[9px] font-medium ${item.isToday ? 'font-bold text-black' : 'text-black/40'}`}>
                {item.day}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2.5 text-[10px] text-black/50">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-black/40" />
            <span>Bank Destination: HDFC (•••• 4092)</span>
          </div>
          <span className="font-semibold text-black/70">Auto-deposit: Friday</span>
        </div>
      </div>

      {/* ── Recent Driver Bookings ── */}
      <div className="rounded-2xl bg-white p-4 border border-black/[0.06] shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-[#2563EB]" />
            <h3 className="text-xs font-bold text-[#111312]">
              Driver Parking Reservations
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={fetchBookings}
              disabled={isLoadingBookings}
              title="Refresh reservations"
              aria-label="Refresh reservations"
              className="p-1 rounded-md text-[#767D78] hover:text-[#111312] hover:bg-black/[0.05] transition-colors cursor-pointer disabled:opacity-40"
            >
              <RefreshCw size={12} className={isLoadingBookings ? "animate-spin" : ""} />
            </button>
            <span className="text-[10px] font-mono text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full border border-[#BFDBFE] font-semibold">
              Live
            </span>
          </div>
        </div>

        {/* Bookings List */}
        {isLoadingBookings ? (
          <div className="py-5 flex items-center justify-center gap-2 text-xs text-[#767D78]">
            <Loader2 className="w-4 h-4 animate-spin text-[#2563EB]" />
            <span>Loading reservations...</span>
          </div>
        ) : loadError ? (
          <div className="p-3 bg-[#FEF2F2] rounded-xl border border-[#FECACA] text-center space-y-1.5">
            <p className="text-xs font-semibold text-[#991B1B]">Could not load bookings</p>
            <button
              type="button"
              onClick={fetchBookings}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#111312] text-white rounded-lg text-[11px] font-semibold hover:bg-[#252826] cursor-pointer"
            >
              <RefreshCw size={10} />
              <span>Retry</span>
            </button>
          </div>
        ) : onChainBookings.length === 0 ? (
          <div className="p-4 bg-[#FAF9F6] rounded-xl border border-dashed border-black/[0.1] text-center space-y-1">
            <Coins className="w-5 h-5 text-[#767D78] mx-auto opacity-50" />
            <p className="text-xs font-semibold text-[#111312]">No Reservations Yet</p>
            <p className="text-[10px] text-[#767D78]">
              Driver parking spot holds will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.05]">
            {onChainBookings.map((b) => (
              <div key={b.id} className="py-3 first:pt-0 last:pb-0 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#111312]">
                        {b.bay_number} ({b.connector_type})
                      </span>
                      <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded-sm bg-[#DCFCE7] text-[#15803D] font-semibold border border-[#86EFAC]">
                        Confirmed ✓
                      </span>
                    </div>
                    <p className="text-[10.5px] text-[#767D78]">
                      {b.station_name} • {b.duration_minutes}m hold • PIN {b.pin_code}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold font-mono text-[#16A34A] block">
                      {b.mon_amount}
                    </span>
                    <span className="text-[10px] font-mono text-[#767D78]">
                      {b.total_cost}
                    </span>
                  </div>
                </div>

                {/* On-Chain Transaction & Explorer Link */}
                {b.tx_hash && (
                  <div className="flex items-center justify-between pt-1 text-[10.5px] text-[#525854]">
                    <div className="flex items-center gap-1 font-mono">
                      <span>Tx: {truncateTx(b.tx_hash)}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyTx(b.tx_hash || "")}
                        aria-label="Copy transaction hash"
                        className="p-1 hover:bg-black/[0.05] rounded-sm text-[#767D78]"
                      >
                        {copiedTxHash === b.tx_hash ? (
                          <Check size={11} className="text-[#16A34A]" />
                        ) : (
                          <Copy size={11} />
                        )}
                      </button>
                      {b.block_number && (
                        <span className="text-[10px] text-[#767D78]">
                          • Block #{b.block_number}
                        </span>
                      )}
                    </div>

                    <a
                      href={b.explorer_url || `https://testnet.monadexplorer.com/tx/${b.tx_hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[#2563EB] hover:underline font-semibold"
                    >
                      <span>Explorer</span>
                      <ExternalLink size={10} />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Clean Recent Activity List (Mobile Ledger) ── */}
      <div className="rounded-2xl bg-white p-4 border border-black/[0.06] shadow-2xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#111312]">Recent Sessions</span>
            <span className="text-[9.5px] font-mono px-2 py-0.5 rounded-full bg-black/[0.04] text-black/50 border border-black/[0.06]">
              Simulated History
            </span>
          </div>
          {/* Quick filter pills */}
          <div className="flex items-center gap-1 bg-black/[0.04] p-0.5 rounded-full">
            {(['all', 'charging', 'parking'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className={`text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize transition-all ${
                  activeFilter === f ? 'bg-white text-black shadow-2xs' : 'text-black/40'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-black/[0.04]">
          {filteredReceipts.map((rcpt) => (
            <div key={rcpt.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                    rcpt.type === 'charging'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-sky-50 text-sky-600'
                  }`}
                >
                  {rcpt.type === 'charging' ? (
                    <Zap className="w-3.5 h-3.5" />
                  ) : (
                    <Car className="w-3.5 h-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#111312] truncate">{rcpt.bay}</p>
                  <p className="text-[10px] text-black/40 truncate">{rcpt.energyOrDuration}</p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs font-bold text-[#111312] font-mono block">
                  +{rcpt.netPayout}
                </span>
                <span className="text-[9px] text-black/40">
                  {rcpt.timeAgo} • {rcpt.paymentMethod}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
