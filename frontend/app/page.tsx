'use client';

import React, { useState, useEffect } from 'react';
import { api, ErrorCluster, Config } from './api';
import { Sidebar } from './components/Sidebar';
import { ClusterList } from './components/ClusterList';
import { TerminalView } from './components/TerminalView';
import { DiffView } from './components/DiffView';
import { AlertTriangle, Wrench } from 'lucide-react';

export default function Home() {
  const [logContent, setLogContent] = useState('');
  const [uploadedFilePath, setUploadedFilePath] = useState('');
  const [repoName, setRepoName] = useState('');

  const [errors, setErrors] = useState<ErrorCluster[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [selectedError, setSelectedError] = useState<ErrorCluster | null>(null);

  // Fix State
  const [fixStatus, setFixStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [fixMsg, setFixMsg] = useState('');
  const [fixLogs, setFixLogs] = useState<string[]>([]);
  const [repoSyncStatus, setRepoSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [showReview, setShowReview] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [currentBranchName, setCurrentBranchName] = useState<string | null>(null);

  const [repoConfig, setRepoConfig] = useState<Config>({});

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await api.getConfig();
        setRepoConfig(config);
      } catch (err) {
        console.error("Failed to load config:", err);
      }
    };
    fetchConfig();
  }, []);

  // Helper to convert repo name to full path
  const getRepoPath = (name: string) => {
    return repoConfig[name] || '';
  };

  // Debug: Monitor uploadedFilePath changes
  useEffect(() => {
    console.log('[STATE CHANGE] uploadedFilePath changed to:', uploadedFilePath);
  }, [uploadedFilePath]);

  const handleAnalyze = async () => {
    console.log('=== Analyze Started ===');
    console.log('Log content length:', logContent?.length || 0);
    console.log('Uploaded file path STATE:', uploadedFilePath);
    console.log('Uploaded file path TYPE:', typeof uploadedFilePath);
    console.log('Uploaded file path LENGTH:', uploadedFilePath?.length);
    console.log('Input mode - using file upload:', !!uploadedFilePath);

    // Check if we have either uploaded file or pasted content
    if (!uploadedFilePath && (!logContent || logContent.length === 0)) {
      alert("Please upload a log file or paste log content");
      return;
    }

    setIsAnalyzing(true);
    try {
      let data: ErrorCluster[];

      // Use uploaded file path if available, otherwise use pasted content
      if (uploadedFilePath) {
        console.log('Analyzing uploaded file at path:', uploadedFilePath);
        data = await api.analyzeLogFile(uploadedFilePath);
        console.log('Analysis complete, found', data.length, 'error clusters');
      } else {
        console.log('Analyzing pasted content');
        data = await api.analyzeLogs(logContent);
        console.log('Analysis complete, found', data.length, 'error clusters');
      }

      setErrors(data);
      setSelectedError(null);
      setFixStatus('idle');
      setShowReview(false);

      console.log('State updated with errors');
      console.log('Uploaded file path after analysis:', uploadedFilePath);
      console.log('=== Analyze Complete ===');
    } catch (e: any) {
      console.error('Analysis error:', e);
      console.error('Error details:', e.response?.data);
      alert(`Failed to analyze logs: ${e.response?.data?.detail || e.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelectError = (error: ErrorCluster) => {
    setSelectedError(error);
    // Clear all fix-related state when selecting a new error
    setFixStatus('idle');
    setFixMsg('');
    setFixLogs([]);
    setRepoSyncStatus('idle');
    setShowReview(false);
  };

  const handleBackToList = () => {
    setSelectedError(null);
    // Clear all fix-related state when going back to list
    setFixStatus('idle');
    setFixMsg('');
    setFixLogs([]);
    setRepoSyncStatus('idle');
    setShowReview(false);
  };

  const handleStartFix = async () => {
    const repoPath = getRepoPath(repoName);
    if (!selectedError || !repoPath) {
      alert("Please select a repository");
      return;
    }

    // 1. Sync Repo
    setRepoSyncStatus('syncing');
    setFixLogs([]);
    setFixStatus('running');

    try {
        await api.syncRepo(repoPath);
        setRepoSyncStatus('success');
    } catch (e: any) {
        setRepoSyncStatus('error');
        setFixStatus('error');
        setFixMsg(`Repo sync failed: ${e.response?.data?.detail || e.message}`);
        return;
    }

    // 2. Start Streaming Fix
    try {
        const response = await fetch('http://localhost:8000/fix/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                repo_path: repoPath,
                error_trace: selectedError.trace
            })
        });

        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep incomplete part
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                   const content = line.slice(6);
                   setFixLogs(prev => [...prev, content]);
                } else if (line.startsWith('event: complete')) {
                   // actually the data line follows event: complete
                   // simplified parser for now assuming format `event: complete\ndata: {...}` in one chunk or close proximity
                   // But our server sends `event: complete\ndata: JSON\n\n`
                }
            }
            
            // Basic regex to find completion json since simple line split might be fragile with mixed events
            // We'll rely on our specific server format: last message indicates completion? 
            // Actually server sends `event: complete` then `data: {...}`.
            // Let's iterate lines.
        }
        
        // Re-implement robust SSE reader or simple check for now
        // For prototype, let's just check if we got a success message in logs?
        // No, `run_opencode_fix` yields a tuple at end which server sends as specific event.
        // Let's look for the JSON object in the logs array or parse properly?
        // Let's refine the parser loop above.
    } catch (e: any) {
        setFixStatus('error');
        setFixMsg(e.message);
    }
  };
  
  // Robust SSE Handler Replacement for handleStartFix
  const handleStartFixRobust = async () => {
      console.log('Auto-fix initiated');
      console.log('Selected error:', selectedError);
      console.log('Repo name:', repoName);

      const repoPath = getRepoPath(repoName);

      if (!selectedError) {
        alert("Please select an error to fix");
        return;
      }

      if (!repoPath || !repoName) {
        alert("Please select a repository");
        return;
      }

      console.log('Repo path:', repoPath);

      setRepoSyncStatus('syncing');
      setFixLogs([]);
      setFixStatus('running');
      setFixMsg('');
      setShowReview(false);
      setCurrentJobId(null);
      setCurrentBranchName(null);

      // Sync repo
      try {
          console.log('Syncing repo...');
          await api.syncRepo(repoPath);
          setRepoSyncStatus('success');
          console.log('Repo synced successfully');
      } catch (e: any) {
          console.error('Repo sync failed:', e);
          setRepoSyncStatus('error');
          setFixStatus('error');
          setFixMsg(`Repo sync failed: ${e.response?.data?.detail || e.message}`);
          return;
      }

      // Start streaming fix
      try {
          console.log('Starting OpenCode fix...');
          const response = await fetch('http://localhost:8000/fix/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repo_path: repoPath,
                    error_trace: selectedError.trace
                })
          });

          if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
          }

          if (!response.body) {
              throw new Error('No response body');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
              const { done, value } = await reader.read();
              if (done) {
                  console.log('Stream completed');
                  break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              let eventIndex;
              while ((eventIndex = buffer.indexOf('\n\n')) >= 0) {
                  const message = buffer.slice(0, eventIndex);
                  buffer = buffer.slice(eventIndex + 2);

                  if (message.startsWith('event: job_id')) {
                      // Extract job_id from the event for cancellation support
                      const dataLine = message.split('\n').find(l => l.startsWith('data: '));
                      if (dataLine) {
                          const jobId = dataLine.slice(6).trim();
                          console.log('Received job_id:', jobId);
                          setCurrentJobId(jobId);
                      }
                  } else if (message.startsWith('event: complete')) {
                      const dataLine = message.split('\n').find(l => l.startsWith('data: '));
                      if (dataLine) {
                          const jsonStr = dataLine.slice(6);
                          const result = JSON.parse(jsonStr);
                          console.log('Fix completed:', result);
                          if (result.success) {
                              setFixStatus('success');
                              setShowReview(true);
                              // Store branch name for PR creation
                              if (result.branch_name) {
                                  setCurrentBranchName(result.branch_name);
                                  console.log('Branch name stored:', result.branch_name);
                              }
                          } else {
                              setFixStatus('error');
                              setFixMsg(result.message);
                          }
                      }
                  } else if (message.startsWith('data: ')) {
                      const logLine = message.slice(6);
                      console.log('OpenCode log:', logLine);
                      setFixLogs(prev => [...prev, logLine]);
                  }
              }
          }
      } catch (e: any) {
          console.error('Fix failed:', e);
          setFixStatus('error');
          setFixMsg(`Fix failed: ${e.message}`);
      }
  };

  const handleCancelFix = async () => {
    if (!currentJobId) {
      console.error("Cannot cancel: no job_id available");
      return;
    }
    try {
      await api.cancelFix(currentJobId);
      setFixStatus('idle');
      setFixMsg('Cancelled by user.');
      setFixLogs(prev => [...prev, '--- CANCELLED ---']);
      setCurrentJobId(null);
    } catch (e: any) {
      console.error("Cancel failed:", e);
    }
  };

  const onCommitChanges = async (): Promise<boolean> => {
     const repoPath = getRepoPath(repoName);
     if (!repoPath) return false;

     try {
         await api.commitChanges(repoPath, `Fix: ${selectedError?.message.split('\n')[0]}`);
         return true;
     } catch (e: any) {
         alert(`Commit failed: ${e.response?.data?.detail}`);
         return false;
     }
  };

  const onCommitAndPush = async (): Promise<boolean> => {
     const repoPath = getRepoPath(repoName);
     if (!repoPath) return false;

     try {
         await api.commitAndPush(repoPath, `Fix: ${selectedError?.message.split('\n')[0]}`);
         return true;
     } catch (e: any) {
         alert(`Commit & Push failed: ${e.response?.data?.detail}`);
         return false;
     }
  };

  const onCommitPushAndPr = async (): Promise<{success: boolean, prUrl?: string}> => {
     const repoPath = getRepoPath(repoName);
     if (!repoPath) return {success: false};

     try {
         // Pass currentBranchName so PR is created for the correct branch
         // even if another user has changed the repo's current checkout
         const result = await api.commitPushAndPr(
             repoPath,
             `Fix: ${selectedError?.message.split('\n')[0]}`,
             currentBranchName || undefined
         );
         return {success: true, prUrl: result.pr_url};
     } catch (e: any) {
         alert(`Commit, Push & PR failed: ${e.response?.data?.detail}`);
         return {success: false};
     }
  };

  const onPushBranch = async (): Promise<boolean> => {
     const repoPath = getRepoPath(repoName);
     if (!repoPath) return false;

     try {
         await api.pushBranch(repoPath);
         return true;
     } catch (e: any) {
         alert(`Push failed: ${e.response?.data?.detail}`);
         return false;
     }
  };

  const onCreatePullRequest = async (): Promise<string | null> => {
     const repoPath = getRepoPath(repoName);
     if (!repoPath || !selectedError) return null;

     try {
         const prTitle = `Fix: ${selectedError.message.split('\n')[0].slice(0, 80)}`;
         const result = await api.createPullRequest(repoPath, prTitle);
         return result.pr_url;
     } catch (e: any) {
         alert(`PR creation failed: ${e.response?.data?.detail}`);
         return null;
     }
  };

  const onDiscardChanges = async () => {
    const repoPath = getRepoPath(repoName);
    if (!repoPath) return;

    try {
        await api.discardChanges(repoPath);
        alert("Changes discarded.");
        setShowReview(false);
        setFixStatus('idle');
    } catch (e: any) {
        alert("Discard failed");
        throw e;
    }
  };

  const [isRequestingChanges, setIsRequestingChanges] = useState(false);

  const handleRequestChanges = async (feedback: string) => {
    const repoPath = getRepoPath(repoName);
    if (!selectedError || !repoPath) return;

    setIsRequestingChanges(true);
    setFixLogs(prev => [...prev, `--- REQUESTING CHANGES: ${feedback} ---`]);

    // Construct a follow-up prompt with the feedback
    const followUpTrace = `${selectedError.trace}\n\n[USER FEEDBACK ON PREVIOUS FIX]\n${feedback}\n\nPlease apply the requested changes to the code.`;

    try {
      const response = await fetch('http://localhost:8000/fix/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path: repoPath,
          error_trace: followUpTrace
        })
      });
      
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        
        let eventIndex;
        while ((eventIndex = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, eventIndex);
          buffer = buffer.slice(eventIndex + 2);
          
          if (message.startsWith('event: complete')) {
            const dataLine = message.split('\n').find(l => l.startsWith('data: '));
            if (dataLine) {
              const result = JSON.parse(dataLine.slice(6));
              if (result.success) {
                setFixLogs(prev => [...prev, '--- CHANGES APPLIED ---']);
                // Refresh diff view by re-triggering showReview
                setShowReview(false);
                setTimeout(() => setShowReview(true), 100);
              } else {
                setFixLogs(prev => [...prev, `--- FAILED: ${result.message} ---`]);
              }
            }
          } else if (message.startsWith('data: ')) {
            setFixLogs(prev => [...prev, message.slice(6)]);
          }
        }
      }
    } catch (e: any) {
      setFixLogs(prev => [...prev, `--- ERROR: ${e.message} ---`]);
    } finally {
      setIsRequestingChanges(false);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50/30 text-slate-900 font-sans overflow-hidden">
      <Sidebar
          logContent={logContent} setLogContent={setLogContent}
          uploadedFilePath={uploadedFilePath} setUploadedFilePath={setUploadedFilePath}
          repoName={repoName} setRepoName={setRepoName}
          onAnalyze={handleAnalyze} isAnalyzing={isAnalyzing}
          repos={Object.keys(repoConfig)}
          currentRepoPath={getRepoPath(repoName)}
      />

      <main className="flex-1 flex flex-col min-w-0">
        {!selectedError ? (
          <div className="flex-1 p-6 overflow-hidden">
             <ClusterList
               errors={errors}
               selectedError={selectedError}
               onSelect={handleSelectError}
             />
          </div>
        ) : (
          <div className="flex-1 flex flex-col p-6 min-h-0 overflow-y-auto max-w-6xl mx-auto w-full gap-6">
             <div className="flex items-center gap-4">
               <button onClick={handleBackToList} className="text-sm text-slate-600 hover:text-[#451a03] font-medium transition-colors">← Back to List</button>
               <h2 className="text-xl font-bold truncate flex-1 text-slate-900">{selectedError.message.split('\n')[0]}</h2>
             </div>

             {/* Main Content - Vertical Stack */}
             <div className="flex flex-col gap-6">

                {/* Error Context - Full Width */}
                <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
                   <div className="px-5 py-3 border-b border-stone-200 bg-gradient-to-r from-[#451a03] to-[#5c2a0a] flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-white">Error Context</h3>
                      <span className="text-xs text-white/80 bg-white/20 px-2 py-1 rounded-full">{selectedError.count} occurrences</span>
                   </div>
                   <div className="p-5">
                      <pre className="text-xs font-mono text-slate-900 whitespace-pre-wrap break-all bg-slate-50 p-4 rounded-xl max-h-48 overflow-y-auto border border-slate-200">
                         {selectedError.trace}
                      </pre>
                   </div>
                </div>

                {/* Fix Action */}
                {!showReview && (
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 flex flex-col items-center text-center gap-3 shadow-sm">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#451a03]/10 to-[#5c2a0a]/10 rounded-xl flex items-center justify-center">
                          <Wrench className="w-6 h-6 text-[#451a03]" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900 mb-1">Automated Fix</h3>
                            <p className="text-sm text-slate-500">Delegate this error to OpenCode AI</p>
                        </div>
                        <div className="flex gap-2 w-full max-w-xs">
                          {fixStatus === 'running' ? (
                            <button
                              onClick={handleCancelFix}
                              className="flex-1 bg-red-700 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-xl transition-transform active:scale-95 shadow-lg shadow-red-700/25"
                            >
                              Stop
                            </button>
                          ) : (
                            <button
                              onClick={handleStartFixRobust}
                              className="flex-1 bg-gradient-to-r from-[#451a03] to-[#5c2a0a] hover:opacity-90 text-white font-medium py-2 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-[#451a03]/25"
                            >
                              Auto-Fix with OpenCode
                            </button>
                          )}
                        </div>
                        {fixStatus === 'idle' && fixMsg === 'Cancelled by user.' && (
                          <p className="text-xs text-slate-400">Previous run was cancelled. Click to retry.</p>
                        )}
                    </div>
                )}
                
                {/* Agent Output - Full Width */}
                <TerminalView 
                    logs={fixLogs} 
                    status={fixStatus} 
                    statusMessage={fixMsg} 
                    repoSyncStatus={repoSyncStatus}
                />
                
                {/* Changes Review - Full Width (hidden while requesting changes) */}
                {showReview && !isRequestingChanges && (
                    <DiffView
                        repoPath={getRepoPath(repoName)}
                        onCommit={onCommitChanges}
                        onDiscard={onDiscardChanges}
                        onPush={onPushBranch}
                        onCommitAndPush={onCommitAndPush}
                        onCommitPushAndPr={onCommitPushAndPr}
                        onCreatePR={onCreatePullRequest}
                        onRequestChanges={handleRequestChanges}
                        isRequestingChanges={isRequestingChanges}
                    />
                )}
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
