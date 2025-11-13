/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Plans Gallery page - displays all user plans in an organized grid layout
 * SRP and DRY check: Pass - dedicated page component for plans gallery routing
 */

'use client';

import React, { Suspense } from 'react';
import PlansGalleryClient from './PlansGalleryClient';
import { Card, CardContent } from '@/components/ui/card';

function LoadingState() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"></div>
          <span className="ml-3 text-slate-300">Loading plans gallery...</span>
        </div>
      </div>
    </div>
  );
}

export default function PlansGalleryPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PlansGalleryClient />
    </Suspense>
  );
}
