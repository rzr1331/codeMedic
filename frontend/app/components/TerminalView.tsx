import React, { useEffect, useRef } from 'react';
import { Terminal, Maximize2, XCircle, CheckCircle, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

interface TerminalViewProps {
  logs: string[];
  status: 'idle' | 'running' | 'success' | 'error';
  statusMessage?: string;
  repoSyncStatus?: 'idle' | 'syncing' | 'success' | 'error';
}

export function TerminalView({ logs, status, statusMessage, repoSyncStatus }: TerminalViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Only hide if truly empty: no logs and all statuses are idle
  if (status === 'idle' && repoSyncStatus === 'idle' && logs.length === 0) return null;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[500px]">
      <div className="px-5 py-3 border-b border-stone-200 bg-gradient-to-r from-[#451a03] to-[#5c2a0a] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          Agent Output
        </h3>
        <div className="flex items-center gap-3 text-xs">
           {repoSyncStatus === 'syncing' && <span className="text-white/90 bg-white/20 px-2 py-1 rounded-full flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> Syncing Repo...</span>}
           {status === 'running' && <span className="text-white/90 bg-white/20 px-2 py-1 rounded-full flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin"/> OpenCode Running...</span>}
           {status === 'success' && <span className="text-emerald-300 bg-emerald-500/20 px-2 py-1 rounded-full flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Complete</span>}
           {status === 'error' && <span className="text-red-300 bg-red-500/20 px-2 py-1 rounded-full flex items-center gap-1"><XCircle className="w-3 h-3"/> Failed</span>}
        </div>
      </div>

      <div className="p-4 font-mono text-xs text-slate-900 bg-slate-50 flex-1 overflow-y-auto">
        {repoSyncStatus === 'success' && (
           <div className="mb-2 text-emerald-600 bg-emerald-50 px-2 py-1 rounded border-l-2 border-emerald-500">✅ Repository synced (git checkout master && git pull)</div>
        )}

        {logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap break-all border-l-2 border-transparent hover:border-[#451a03]/20 hover:bg-white/50 pl-2 py-0.5 transition-colors">
            {log}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {statusMessage && status !== 'running' && (
          <div className={clsx("px-5 py-3 border-t border-stone-200 text-sm font-medium",
             status === 'success' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          )}>
             {statusMessage}
          </div>
      )}
    </div>
  );
}
