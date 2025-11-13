/**
 * Author: Claude Sonnet 4.5
 * Date: 2025-11-13
 * PURPOSE: Filter and search controls for plans gallery
 * SRP and DRY check: Pass - dedicated to gallery filtering UI
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StatusFilter, SortOption } from '@/lib/hooks/useGalleryPlans';

interface GalleryFiltersProps {
  statusFilter: StatusFilter;
  searchQuery: string;
  sortOption: SortOption;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onSearchQueryChange: (query: string) => void;
  onSortOptionChange: (option: SortOption) => void;
}

export function GalleryFilters({
  statusFilter,
  searchQuery,
  sortOption,
  onStatusFilterChange,
  onSearchQueryChange,
  onSortOptionChange,
}: GalleryFiltersProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Debounce search input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearchQueryChange(localSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [localSearch, onSearchQueryChange]);

  const handleClearSearch = () => {
    setLocalSearch('');
    onSearchQueryChange('');
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          type="text"
          placeholder="Search plans by prompt, ID, or model..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-10 pr-10 bg-white/5 border-white/10 text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50"
        />
        {localSearch && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filter and sort controls */}
      <div className="flex flex-wrap gap-3">
        {/* Status filter */}
        <div className="flex-1 min-w-[200px]">
          <Select value={statusFilter} onValueChange={(value) => onStatusFilterChange(value as StatusFilter)}>
            <SelectTrigger className="bg-white/5 border-white/10 text-slate-200">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">✓ Completed</SelectItem>
              <SelectItem value="running">⏳ Running</SelectItem>
              <SelectItem value="pending">⏸ Pending</SelectItem>
              <SelectItem value="failed">✗ Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort option */}
        <div className="flex-1 min-w-[200px]">
          <Select value={sortOption} onValueChange={(value) => onSortOptionChange(value as SortOption)}>
            <SelectTrigger className="bg-white/5 border-white/10 text-slate-200">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="status">By Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active filters display */}
      {(statusFilter !== 'all' || searchQuery) && (
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="text-slate-400">Active filters:</span>
          {statusFilter !== 'all' && (
            <button
              onClick={() => onStatusFilterChange('all')}
              className="px-2 py-1 rounded bg-cyan-400/20 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/30 transition-colors flex items-center gap-1"
            >
              {statusFilter}
              <X className="h-3 w-3" />
            </button>
          )}
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="px-2 py-1 rounded bg-purple-400/20 text-purple-300 border border-purple-400/30 hover:bg-purple-400/30 transition-colors flex items-center gap-1"
            >
              &quot;{searchQuery.slice(0, 20)}{searchQuery.length > 20 ? '...' : ''}&quot;
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
