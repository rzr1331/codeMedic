
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Activity, Clock } from 'lucide-react';

interface Job {
    id: string;
    type: string;
    status: string;
    created_at: number;
    details: string;
}

interface QueueListProps {
    repoPath: string;
    repoName: string;
}

export const QueueList: React.FC<QueueListProps> = ({ repoPath, repoName }) => {
    const [jobs, setJobs] = useState<Job[]>([]);
    
    useEffect(() => {
        if (!repoPath) {
            setJobs([]);
            return;
        }

        const fetchQueue = async () => {
             try {
                 const data = await api.getQueue(repoPath);
                 if (data.jobs) {
                     setJobs(data.jobs);
                 }
             } catch (e) {
                 console.error("Failed to fetch queue", e);
             }
        };

        fetchQueue();
        const interval = setInterval(fetchQueue, 2000); // Poll every 2s
        return () => clearInterval(interval);
    }, [repoPath]);

    if (!repoPath) return null;
    if (jobs.length === 0) return null;

    return (
        <div className="bg-amber-50 border-b border-amber-200 p-2 text-xs">
            <div className="flex items-center gap-2 mb-2 px-2">
                <Activity className="w-3 h-3 text-amber-700 animate-pulse" />
                <span className="font-semibold text-amber-900">Active Jobs for {repoName}</span>
            </div>
            <div className="space-y-1">
                {jobs.map(job => (
                    <div key={job.id} className="bg-white border border-amber-100 rounded p-2 shadow-sm flex items-center justify-between">
                        <div className="flex flex-col">
                           <span className="font-medium text-slate-800 uppercase text-[10px] tracking-wider">{job.type}</span>
                           <span className="text-slate-600 truncate max-w-[200px]">{job.details}</span>
                        </div>
                        <div className="flex items-center text-slate-400 gap-1" title={new Date(job.created_at * 1000).toLocaleString()}>
                            <Clock className="w-3 h-3" />
                            <span>{Math.round(Date.now()/1000 - job.created_at)}s</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
