import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Check, X, Loader2, FileCode, MessageSquare, Send } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

interface DiffViewProps {
  repoPath: string;
  onCommit: () => void;
  onDiscard: () => void;
  onRequestChanges?: (feedback: string) => void;
  isRequestingChanges?: boolean;
}

interface DiffFile {
  path: string;
  hunks: DiffHunk[];
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'add' | 'remove' | 'context' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diff.split('\n');
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      if (currentFile) files.push(currentFile);
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      currentFile = { path: match ? match[2] : 'unknown', hunks: [] };
      currentHunk = null;
    } else if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      oldLine = match ? parseInt(match[1]) : 0;
      newLine = match ? parseInt(match[2]) : 0;
      currentHunk = { header: line, lines: [] };
      if (currentFile) currentFile.hunks.push(currentHunk);
    } else if (currentHunk) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentHunk.lines.push({ type: 'add', content: line.slice(1), newLineNum: newLine++ });
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.lines.push({ type: 'remove', content: line.slice(1), oldLineNum: oldLine++ });
      } else if (line.startsWith(' ')) {
        currentHunk.lines.push({ type: 'context', content: line.slice(1), oldLineNum: oldLine++, newLineNum: newLine++ });
      }
    }
  }
  if (currentFile) files.push(currentFile);
  return files;
}

export function DiffView({ repoPath, onCommit, onDiscard, onRequestChanges, isRequestingChanges }: DiffViewProps) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionStatus, setActionStatus] = useState<'idle' | 'committing' | 'discarding'>('idle');
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    loadDiff();
  }, [repoPath]);

  const loadDiff = async () => {
    setLoading(true);
    try {
      const data = await api.getDiff(repoPath);
      setDiff(data.diff);
    } catch (e) {
      console.error(e);
      setDiff("Error loading diff.");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setActionStatus('committing');
    try { await onCommit(); } finally { setActionStatus('idle'); }
  };

  const handleDiscard = async () => {
    setActionStatus('discarding');
    try { await onDiscard(); } finally { setActionStatus('idle'); }
  };

  if (loading) return <div className="p-4 flex items-center gap-2 text-gray-400"><Loader2 className="animate-spin w-4 h-4"/> Loading diff...</div>;

  if (!diff || !diff.trim()) {
    return <div className="p-4 text-gray-400 bg-gray-900 rounded-lg border border-gray-800">No changes detected.</div>;
  }

  const files = parseDiff(diff);

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-200">Changes Review</h3>
          <span className="text-xs text-gray-500">{files.length} file(s) changed</span>
        </div>
        
        <div className="divide-y divide-gray-800 max-h-[400px] overflow-y-auto">
          {files.map((file, fi) => (
            <div key={fi}>
              {/* File Header */}
              <div className="px-4 py-2 bg-gray-900/80 flex items-center gap-2 sticky top-0 border-b border-gray-800">
                <FileCode className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-mono text-gray-300">{file.path}</span>
              </div>
              
              {/* Hunks */}
              {file.hunks.map((hunk, hi) => (
                <div key={hi} className="font-mono text-xs">
                  {/* Hunk header */}
                  <div className="px-4 py-1 bg-blue-950/30 text-blue-300 border-y border-blue-900/30">
                    {hunk.header}
                  </div>
                  
                  {/* Lines */}
                  <div>
                    {hunk.lines.map((line, li) => (
                      <div
                        key={li}
                        className={twMerge(
                          "flex",
                          line.type === 'add' && "bg-green-950/40",
                          line.type === 'remove' && "bg-red-950/40"
                        )}
                      >
                        {/* Line numbers */}
                        <div className="w-10 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800 shrink-0">
                          {line.type !== 'add' ? line.oldLineNum : ''}
                        </div>
                        <div className="w-10 px-2 py-0.5 text-right text-gray-600 select-none border-r border-gray-800 shrink-0">
                          {line.type !== 'remove' ? line.newLineNum : ''}
                        </div>
                        
                        {/* Sign */}
                        <div className={twMerge(
                          "w-5 text-center py-0.5 shrink-0",
                          line.type === 'add' && "text-green-400",
                          line.type === 'remove' && "text-red-400"
                        )}>
                          {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                        </div>
                        
                        {/* Content */}
                        <pre className={twMerge(
                          "flex-1 py-0.5 pr-4 whitespace-pre-wrap break-all",
                          line.type === 'add' && "text-green-200",
                          line.type === 'remove' && "text-red-200",
                          line.type === 'context' && "text-gray-400"
                        )}>
                          {line.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      
      {/* Request Changes Section */}
      {onRequestChanges && (
        <div className="bg-amber-950/20 border border-amber-900/50 rounded-lg overflow-hidden">
          <button 
            onClick={() => setShowFeedback(!showFeedback)}
            className="w-full px-4 py-3 flex items-center gap-2 text-left hover:bg-amber-950/30 transition-colors"
          >
            <MessageSquare className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-amber-200">Request Changes</span>
            <span className="text-xs text-amber-400/60 ml-auto">{showFeedback ? 'Collapse' : 'Expand'}</span>
          </button>
          
          {showFeedback && (
            <div className="p-4 border-t border-amber-900/30 space-y-3">
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what changes you'd like to make... e.g., 'Use a different exception type', 'Add null check before this line', 'Rename the variable to something more descriptive'"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm h-24 resize-none focus:ring-1 focus:ring-amber-500 outline-none placeholder-gray-600"
              />
              <button
                onClick={() => {
                  if (feedback.trim()) {
                    onRequestChanges(feedback);
                    setFeedback('');
                    setShowFeedback(false);
                  }
                }}
                disabled={!feedback.trim() || isRequestingChanges}
                className="w-full bg-amber-700 hover:bg-amber-600 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 font-medium transition-colors"
              >
                {isRequestingChanges ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Applying Changes...</>
                ) : (
                  <><Send className="w-4 h-4" /> Send to OpenCode</>
                )}
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="flex gap-3">
        <button 
          onClick={handleCommit}
          disabled={actionStatus !== 'idle' || isRequestingChanges}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 font-medium transition-colors"
        >
          {actionStatus === 'committing' ? <Loader2 className="w-4 h-4 animate-spin"/> : <Check className="w-4 h-4"/>}
          Approve & Commit
        </button>
        
        <button 
          onClick={handleDiscard}
          disabled={actionStatus !== 'idle' || isRequestingChanges}
          className="flex-1 bg-gray-800 hover:bg-gray-700 border border-red-900/50 text-red-200 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 font-medium transition-colors"
        >
          {actionStatus === 'discarding' ? <Loader2 className="w-4 h-4 animate-spin"/> : <X className="w-4 h-4"/>}
          Discard Changes
        </button>
      </div>
    </div>
  );
}
