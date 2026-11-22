"use client";

import React from "react";
import { StationOwnerMobileApp } from "@/components/StationOwnerMobileApp";

export default function StationOwnersPage() {
  return (
    <StationOwnerMobileApp
      homeHref="/"
      driverHref="/users/stations"
      investorHref="/investor"
      defaultFramed={true}
    />
  );
}
