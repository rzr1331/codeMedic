from fastapi import FastAPI, HTTPException, Body, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import agent
import os
import subprocess
import asyncio
import json
import tempfile
import shutil

app = FastAPI(title="CodeMedic API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class ConfigResponse(BaseModel):
    log_file_path: str
    repo_path: str

class ErrorCluster(BaseModel):
    message: str
    count: int
    trace: str

class AnalyzeRequest(BaseModel):
    log_content: str

class FixRequest(BaseModel):
    repo_path: str
    error_trace: str
    model: Optional[str] = None

class RepoRequest(BaseModel):
    repo_path: str

class CommitRequest(BaseModel):
    repo_path: str
    message: str

# --- Endpoints ---

@app.get("/config", response_model=ConfigResponse)
def get_config():
    """Load default config."""
    config = agent.load_config()
    return ConfigResponse(
        log_file_path=config.get("log_file_path", ""),
        repo_path=config.get("repo_path", "")
    )

@app.get("/models")
def get_models():
    """List available OpenCode models."""
    return agent.get_available_models()

@app.post("/logs/upload")
async def upload_log_file(file: UploadFile = File(...)):
    """Upload a log file to temp directory and return the path."""
    try:
        # Create a temporary file
        suffix = os.path.splitext(file.filename)[1] if file.filename else '.log'
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, mode='wb')

        print(f"[upload] Uploading file: {file.filename}")
        print(f"[upload] Temp file created at: {temp_file.name}")

        # Write uploaded file to temp location in chunks (handle large files)
        chunk_size = 1024 * 1024  # 1MB chunks
        total_bytes = 0
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            temp_file.write(chunk)
            total_bytes += len(chunk)

        temp_file.close()

        file_size = os.path.getsize(temp_file.name)
        print(f"[upload] Upload complete: {total_bytes} bytes written")
        print(f"[upload] File exists after close: {os.path.exists(temp_file.name)}")
        print(f"[upload] File size on disk: {file_size} bytes")

        return {
            "temp_path": temp_file.name,
            "original_filename": file.filename,
            "size": file_size
        }
    except Exception as e:
        print(f"[upload] ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")

@app.post("/logs/analyze", response_model=List[ErrorCluster])
def analyze_logs(request: AnalyzeRequest):
    """Parse log content and return clusters."""
    if not request.log_content or not request.log_content.strip():
        raise HTTPException(status_code=400, detail="Log content is empty")

    errors = agent.parse_log_content(request.log_content)
    return errors

@app.post("/logs/analyze_file", response_model=List[ErrorCluster])
def analyze_log_file(file_path: str = Body(..., embed=True)):
    """Parse log file from path and return clusters."""
    print(f"[analyze_log_file] Request received for file: {file_path}")
    print(f"[analyze_log_file] File exists: {os.path.exists(file_path)}")

    if not os.path.exists(file_path):
        print(f"[analyze_log_file] ERROR: File not found at {file_path}")
        # List temp directory to debug
        import glob
        temp_files = glob.glob(os.path.join(tempfile.gettempdir(), "tmp*"))
        print(f"[analyze_log_file] Temp directory has {len(temp_files)} tmp files")
        if temp_files:
            print(f"[analyze_log_file] First few temp files: {temp_files[:5]}")
        raise HTTPException(status_code=404, detail=f"Log file not found at {file_path}")

    # Don't delete temp file here - keep it for re-analysis
    print(f"[analyze_log_file] Starting analysis...")
    errors = agent.parse_log_clusters(file_path)
    print(f"[analyze_log_file] Analysis complete, found {len(errors)} error clusters")
    return errors

@app.post("/logs/cleanup")
def cleanup_temp_file(file_path: str = Body(..., embed=True)):
    """Clean up a temporary log file."""
    print(f"[cleanup] Request to cleanup: {file_path}")
    if file_path and file_path.startswith(tempfile.gettempdir()):
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                print(f"[cleanup] File deleted: {file_path}")
                return {"message": "Temp file cleaned up"}
            else:
                print(f"[cleanup] File does not exist: {file_path}")
                return {"message": "File already deleted"}
        except Exception as e:
            print(f"[cleanup] ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to cleanup: {str(e)}")
    print(f"[cleanup] Not a temp file, skipping cleanup")
    return {"message": "No cleanup needed"}

@app.post("/repo/sync")
def sync_repo(request: RepoRequest):
    """Checkout master and pull."""
    success, msg = agent.prepare_repo(request.repo_path)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"message": msg}

@app.get("/repo/diff")
def get_diff(repo_path: str):
    """Get current git diff."""
    return {"diff": agent.get_git_diff(repo_path)}

@app.post("/repo/discard")
def discard_changes(request: RepoRequest):
    """Discard changes in repo."""
    success, msg = agent.discard_changes(request.repo_path)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"message": msg}

@app.post("/repo/commit")
def commit_changes(request: CommitRequest):
    """Commit changes."""
    success, msg = agent.run_git_commands(request.repo_path, request.message)
    if not success:
        raise HTTPException(status_code=500, detail=msg)
    return {"message": msg}

@app.post("/fix/start")
def start_fix(request: FixRequest):
    """Trigger OpenCode analysis with streaming output."""
    
    def generate():
        # Iterate over generator
        for item in agent.run_opencode_fix(request.repo_path, request.error_trace, model=request.model):
            if isinstance(item, tuple):
                success, msg = item
                # Final result event
                result_data = json.dumps({"success": success, "message": msg})
                yield f"event: complete\ndata: {result_data}\n\n"
            else:
                # Log line event
                # Sanitize newlines to ensure SSE format
                safe_line = item.replace('\n', ' ')
                yield f"data: {safe_line}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/fix/cancel")
def cancel_fix():
    """Cancel running OpenCode process."""
    success, msg = agent.cancel_opencode_fix()
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"message": msg}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
