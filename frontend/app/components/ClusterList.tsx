import React, { useState, useMemo } from 'react';
import { ErrorCluster } from '../api';
import { AlertCircle, ChevronRight, Search, Filter } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface ClusterListProps {
  errors: ErrorCluster[];
  selectedError: ErrorCluster | null;
  onSelect: (error: ErrorCluster) => void;
}

// Helper to extract exception name from error message
// Format: Line 1 = "Could not post process the data" (description)
//         Line 2 = "com.ofb.cipher.commons.errors.NotFoundException: Linked Tender Not Found."
function parseException(message: string): { name: string; description: string; packageName: string } {
  const lines = message.split('\n');
  const logMessage = lines[0]?.trim() || '';
  const exceptionLine = lines[1]?.trim() || '';
  
  // Parse exception line: "com.example.SomeException: details"
  const colonIndex = exceptionLine.indexOf(':');
  let exceptionClassName = exceptionLine;
  if (colonIndex > 0) {
    exceptionClassName = exceptionLine.slice(0, colonIndex).trim();
  }
  
  // Extract package: everything before the last dot
  const lastDot = exceptionClassName.lastIndexOf('.');
  const packageName = lastDot > 0 ? exceptionClassName.slice(0, lastDot) : 'unknown';
  
  return { 
    name: exceptionClassName || logMessage,  // Exception class as title
    description: logMessage,                  // Log message as description
    packageName 
  };
}

export function ClusterList({ errors, selectedError, onSelect }: ClusterListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [packageFilter, setPackageFilter] = useState<string>('all');

  // Extract unique packages from all errors
  const packages = useMemo(() => {
    const pkgSet = new Set<string>();
    errors.forEach(e => {
      const { packageName } = parseException(e.message);
      pkgSet.add(packageName);
    });
    return Array.from(pkgSet).sort();
  }, [errors]);

  // Filtered errors
  const filteredErrors = useMemo(() => {
    return errors.filter(e => {
      const { name, description, packageName } = parseException(e.message);
      const matchesSearch = searchQuery === '' || 
        e.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPackage = packageFilter === 'all' || packageName === packageFilter;
      return matchesSearch && matchesPackage;
    });
  }, [errors, searchQuery, packageFilter]);

  if (errors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 border border-dashed border-slate-300 rounded-2xl bg-white">
        <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
        <p>No errors found. Analyze logs to begin.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#451a03] to-[#5c2a0a] px-5 py-3 border-b border-stone-200 flex justify-between items-center">
        <h2 className="font-semibold text-white">Error Clusters</h2>
        <span className="text-xs bg-white/20 text-white px-3 py-1 rounded-full">{filteredErrors.length} / {errors.length}</span>
      </div>

      {/* Filters */}
      <div className="p-4 border-b border-slate-200 space-y-2 bg-slate-50">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search errors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 text-slate-900 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#451a03] focus:border-transparent outline-none placeholder-slate-400"
          />
        </div>

        {/* Package Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="flex-1 bg-white border border-slate-200 text-slate-900 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#451a03] focus:border-transparent outline-none"
          >
            <option value="all">All Packages</option>
            {packages.map(pkg => (
              <option key={pkg} value={pkg}>{pkg}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error List */}
      <div className="overflow-y-auto flex-1 p-3 space-y-2">
        {filteredErrors.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No matching errors</div>
        ) : (
          filteredErrors.map((error, idx) => {
            const { name, description, packageName } = parseException(error.message);

            return (
              <button
                key={idx}
                onClick={() => onSelect(error)}
                className={twMerge(
                  "w-full text-left px-4 py-3 rounded-xl transition-all flex items-start gap-3 group",
                  selectedError === error
                    ? "bg-[#451a03]/5 border border-[#451a03]/20 shadow-sm"
                    : "hover:bg-slate-50 border border-transparent"
                )}
              >
                <div className={twMerge(
                  "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold",
                  selectedError === error ? "bg-stone-700 text-white" : "bg-stone-100 text-stone-600 group-hover:bg-stone-200"
                )}>
                  {error.count}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={twMerge(
                    "text-sm font-medium truncate",
                    selectedError === error ? "text-[#451a03]" : "text-slate-900 group-hover:text-[#451a03]"
                  )}>
                    {name}
                  </p>
                  {description && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {description}
                    </p>
                  )}
                  <span className="text-[10px] text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full mt-1.5 inline-block">
                    {packageName}
                  </span>
                </div>
                <ChevronRight className={twMerge(
                  "w-5 h-5 mt-1.5 transition-all flex-shrink-0",
                  selectedError === error ? "text-[#451a03]" : "text-slate-300 group-hover:text-[#451a03] group-hover:translate-x-1"
                )} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
