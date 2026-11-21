'use client';

import React from 'react';
import { InvestorMap } from '@/components/InvestorMap';

export default function MapPage() {
  return <InvestorMap backHref="/investor" knowledgeHref="/users/knowledge" />;
}

