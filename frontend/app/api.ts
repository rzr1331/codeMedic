import axios from 'axios';

const API_BASE = 'http://localhost:8000';

export interface Config {
  log_file_path: string;
  repo_path: string;
}

export interface ErrorCluster {
  message: string;
  count: number;
  trace: string;
}

export const api = {
  getConfig: async () => {
    const res = await axios.get<Config>(`${API_BASE}/config`);
    return res.data;
  },

  getModels: async () => {
    const res = await axios.get<string[]>(`${API_BASE}/models`);
    return res.data;
  },

  uploadLogFile: async (file: File, onProgress?: (progress: number) => void) => {
    const formData = new FormData();
    formData.append('file', file);

    const res = await axios.post<{ temp_path: string; original_filename: string; size: number }>(
      `${API_BASE}/logs/upload`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
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
    console.log('[API] Sending request to:', `${API_BASE}/logs/analyze_file`);
    const res = await axios.post<ErrorCluster[]>(`${API_BASE}/logs/analyze_file`, { file_path: filePath });
    console.log('[API] Response received, status:', res.status);
    return res.data;
  },

  analyzeLogs: async (logContent: string) => {
    const res = await axios.post<ErrorCluster[]>(`${API_BASE}/logs/analyze`, { log_content: logContent });
    return res.data;
  },

  cleanupTempFile: async (filePath: string) => {
    const res = await axios.post(`${API_BASE}/logs/cleanup`, { file_path: filePath });
    return res.data;
  },
  
  syncRepo: async (repoPath: string) => {
    const res = await axios.post(`${API_BASE}/repo/sync`, { repo_path: repoPath });
    return res.data;
  },
  
  getDiff: async (repoPath: string) => {
    const res = await axios.get<{diff: string}>(`${API_BASE}/repo/diff?repo_path=${encodeURIComponent(repoPath)}`);
    return res.data;
  },
  
  discardChanges: async (repoPath: string) => {
     const res = await axios.post(`${API_BASE}/repo/discard`, { repo_path: repoPath });
     return res.data;
  },
  
  commitChanges: async (repoPath: string, message: string) => {
      const res = await axios.post(`${API_BASE}/repo/commit`, { repo_path: repoPath, message });
      return res.data;
  },
  
  cancelFix: async () => {
      const res = await axios.post(`${API_BASE}/fix/cancel`);
      return res.data;
  }
};
