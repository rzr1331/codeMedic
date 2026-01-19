import axios from 'axios';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  // In browser, use current hostname with backend port 8000
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }
  // SSR fallback - will be replaced client-side
  return 'http://localhost:8000';
};

// Config is a map of RepoName -> RepoPath
export type Config = Record<string, string>;

export interface ErrorCluster {
  message: string;
  count: number;
  trace: string;
}

export const api = {
  getConfig: async () => {
    const res = await axios.get<Config>(`${getApiBase()}/config`);
    return res.data;
  },

  getModels: async () => {
    const res = await axios.get<string[]>(`${getApiBase()}/models`);
    return res.data;
  },

  uploadLogFile: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await axios.post<{ temp_path: string; original_filename: string; size: number }>(
      `${getApiBase()}/logs/upload`,
      formData,
      {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            onProgress(percentCompleted);
          }
        }
      }
    );
    return res.data;
  },

  analyzeLogFile: async (filePath: string) => {
    console.log('[API] analyzeLogFile called with path:', filePath);
    console.log('[API] Sending request to:', `${getApiBase()}/logs/analyze_file`);
    const res = await axios.post<ErrorCluster[]>(`${getApiBase()}/logs/analyze_file`, { file_path: filePath });
    console.log('[API] Response received, status:', res.status);
    return res.data;
  },

  analyzeLogs: async (logContent: string) => {
    const res = await axios.post<ErrorCluster[]>(`${getApiBase()}/logs/analyze`, { log_content: logContent });
    return res.data;
  },

  cleanupTempFile: async (filePath: string) => {
    const res = await axios.post(`${getApiBase()}/logs/cleanup`, { file_path: filePath });
    return res.data;
  },
  
  syncRepo: async (repoPath: string) => {
    const res = await axios.post(`${getApiBase()}/repo/sync`, { repo_path: repoPath });
    return res.data;
  },
  
  getDiff: async (repoPath: string) => {
    const res = await axios.get<{diff: string}>(`${getApiBase()}/repo/diff?repo_path=${encodeURIComponent(repoPath)}`);
    return res.data;
  },
  
  discardChanges: async (repoPath: string) => {
     const res = await axios.post(`${getApiBase()}/repo/discard`, { repo_path: repoPath });
     return res.data;
  },
  
  commitChanges: async (repoPath: string, message: string) => {
      const res = await axios.post(`${getApiBase()}/repo/commit`, { repo_path: repoPath, message });
      return res.data;
  },

  pushBranch: async (repoPath: string) => {
      const res = await axios.post<{message: string}>(`${getApiBase()}/repo/push`, { repo_path: repoPath });
      return res.data;
  },

  commitAndPush: async (repoPath: string, message: string) => {
      const res = await axios.post<{message: string; commit_message: string; push_message: string}>(`${getApiBase()}/repo/commit-and-push`, { repo_path: repoPath, message });
      return res.data;
  },

  commitPushAndPr: async (repoPath: string, message: string, branchName?: string) => {
      const res = await axios.post<{message: string; commit_message: string; push_message: string; pr_message: string; pr_url: string}>(`${getApiBase()}/repo/commit-push-and-pr`, {
          repo_path: repoPath,
          message,
          branch_name: branchName
      });
      return res.data;
  },

  createPullRequest: async (repoPath: string, title: string, body?: string) => {
      const res = await axios.post<{message: string; pr_url: string}>(`${getApiBase()}/repo/create-pr`, {
          repo_path: repoPath,
          title,
          body
      });
      return res.data;
  },
  
  getQueue: async (repoPath?: string) => {
      const url = repoPath ? `${getApiBase()}/queue?repo_path=${encodeURIComponent(repoPath)}` : `${getApiBase()}/queue`;
      const res = await axios.get(url);
      // Returns { repo: repo_path, jobs: [] } OR { queues: { ... } }
      return res.data;
  },

  cancelFix: async (jobId: string) => {
      const res = await axios.post(`${getApiBase()}/fix/cancel`, { job_id: jobId });
      return res.data;
  }
};
