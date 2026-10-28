import React from "react";
import type { LiveStation } from "@/types/api";

export interface ParkingBooking {
  bookingId: string;
  stationId: string;
  bayNumber: number;
  stationName?: string;
  pinCode?: string;
}

interface ParkingBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  station?: LiveStation | null;
  [key: string]: unknown;
}

export function ParkingBookingModal({ isOpen, onClose }: ParkingBookingModalProps) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2zl p-6 max-w-sm w-full text-center space-y-4">
        <h3 className="text-base font-bold text-[#111312]">Station Reservation</h3>
        <p className="text-xs text-[#525854]">
          Spot reservation is disabled in the standalone "Will I Make It?" journey planner demo.
        </p>
        <button
          onClick={onClose}
          className="w-full py-2 bg-[#111312] text-white text-xs font-semibold rounded-xl"
        >
          Close
        </button>
      </div>
    </div>
  );
}
