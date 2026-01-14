import React, { useState, useRef } from 'react';
import { Stethoscope, FileText, FolderGit2, Play, RefreshCw, Upload, FileCode } from 'lucide-react';
import { api } from '../api';

interface SidebarProps {
  logContent: string;
  setLogContent: (val: string) => void;
  uploadedFilePath: string;
  setUploadedFilePath: (val: string) => void;
  repoName: string;
  setRepoName: (val: string) => void;
  models: string[];
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
}

const REPOS = ['cipher', 'ofbml', 'ofb', 'oxyzo', 'smeassist'];

export function Sidebar({
  logContent, setLogContent,
  uploadedFilePath, setUploadedFilePath,
  repoName, setRepoName,
  models, selectedModel, setSelectedModel,
  onAnalyze, isAnalyzing
}: SidebarProps) {
  const [inputMode, setInputMode] = useState<'paste' | 'upload'>('paste');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log('File selected:', file.name, 'Size:', file.size, 'bytes');

    // Clean up previous temp file if exists
    if (uploadedFilePath) {
      try {
        await api.cleanupTempFile(uploadedFilePath);
        console.log('Previous temp file cleaned up');
      } catch (err) {
        console.warn('Failed to cleanup previous temp file:', err);
      }
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadedFileName('');
    setUploadedFilePath('');

    try {
      // Upload file to backend with progress tracking
      const result = await api.uploadLogFile(file, (progress) => {
        setUploadProgress(progress);
        console.log('Upload progress:', progress, '%');
      });

      console.log('File uploaded successfully:', result);

      // Store the temp file path and metadata
      setUploadedFilePath(result.temp_path);
      setUploadedFileName(result.original_filename);
      setUploadedFileSize(result.size);

      // Mark as complete
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 500);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(`Failed to upload file: ${error.response?.data?.detail || error.message}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full text-slate-900">
      <div className="p-6 border-b border-slate-200 flex items-center gap-3">
        <Stethoscope className="w-8 h-8 text-[#451a03]" />
        <h1 className="font-bold text-xl text-slate-900">CodeMedic</h1>
      </div>

      <div className="p-4 flex-1 space-y-6 overflow-y-auto">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">Configuration</label>

          <div className="space-y-2">
            <label className="text-sm flex items-center gap-2 text-slate-700">
               <FileText className="w-4 h-4" /> Log Input
            </label>

            <div className="flex gap-2 mb-2">
              <button
                onClick={async () => {
                  // Clean up temp file when switching to paste mode
                  if (uploadedFilePath) {
                    try {
                      await api.cleanupTempFile(uploadedFilePath);
                      console.log('Temp file cleaned up on mode switch');
                    } catch (err) {
                      console.warn('Failed to cleanup temp file:', err);
                    }
                  }
                  setInputMode('paste');
                  setUploadedFilePath('');
                  setUploadedFileName('');
                  setUploadedFileSize(0);
                }}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                  inputMode === 'paste'
                    ? 'bg-gradient-to-r from-[#451a03] to-[#5c2a0a] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <FileCode className="w-3 h-3 inline mr-1" /> Paste
              </button>
              <button
                onClick={() => {
                  setInputMode('upload');
                  setLogContent('');
                }}
                className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
                  inputMode === 'upload'
                    ? 'bg-gradient-to-r from-[#451a03] to-[#5c2a0a] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Upload className="w-3 h-3 inline mr-1" /> Upload
              </button>
            </div>

            {inputMode === 'paste' ? (
              <textarea
                value={logContent}
                onChange={(e) => setLogContent(e.target.value)}
                placeholder="Paste your log content or stacktrace here..."
                className="w-full bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 rounded px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-[#451a03] focus:border-transparent outline-none h-32 resize-none"
              />
            ) : (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".log,.txt,*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
                <div
                  onClick={isUploading ? undefined : handleUploadClick}
                  className={`bg-slate-50 border ${uploadedFilePath && !isUploading ? 'border-[#451a03]' : 'border-slate-300'} border-dashed rounded px-3 py-8 text-center text-xs transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed text-slate-400' : uploadedFilePath ? 'text-[#451a03] cursor-pointer hover:border-[#451a03]' : 'text-slate-500 cursor-pointer hover:border-slate-400'}`}
                >
                  <Upload className={`w-6 h-6 mx-auto mb-2 ${uploadedFilePath && !isUploading ? 'text-[#451a03]' : 'text-slate-400'}`} />
                  {isUploading ? `Uploading... ${uploadProgress}%` : (uploadedFilePath ? `${uploadedFileName} ✓ (${(uploadedFileSize / 1024 / 1024).toFixed(1)} MB)` : 'Click to upload log file')}
                </div>
                {isUploading && (
                  <div className="mt-2">
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-[#451a03] to-[#5c2a0a] h-2 transition-all duration-300 ease-out"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-400 text-center mt-1">{uploadProgress}%</div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm flex items-center gap-2 text-slate-700">
               <FolderGit2 className="w-4 h-4" /> Repository
            </label>
            <select
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#451a03] focus:border-transparent outline-none"
            >
              <option value="">Select a repository...</option>
              {REPOS.map(repo => (
                <option key={repo} value={repo}>{repo}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-slate-400 tracking-wider">AI Model</label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#451a03] focus:border-transparent outline-none"
          >
            {models.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="w-full bg-gradient-to-r from-[#451a03] to-[#5c2a0a] hover:opacity-90 text-white font-medium py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-[#451a03]/25"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Analyzing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Analyze Logs
            </>
          )}
        </button>
      </div>

      <div className="p-4 border-t border-slate-200 text-xs text-slate-400 text-center">
        <p>v2.0 • Next.js + FastAPI</p>
      </div>
    </div>
  );
}
