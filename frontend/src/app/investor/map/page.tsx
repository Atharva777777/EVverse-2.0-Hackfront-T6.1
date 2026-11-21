'use client';

import React from 'react';
import { InvestorMap } from '@/components/InvestorMap';

export default function InvestorMapPage() {
  return <InvestorMap backHref="/investor" knowledgeHref="/users/knowledge" />;
}

