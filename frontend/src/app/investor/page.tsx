'use client';

import React from 'react';
import { InvestorDashboard } from '@/components/InvestorDashboard';

export default function InvestorPage() {
  return (
    <InvestorDashboard
      mapHref="/investor/map"
      homeHref="/"
      driverHref="/users"
    />
  );
}
