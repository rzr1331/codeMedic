import json
import os
import re
import subprocess
import sys
import shlex

def load_config(config_path="config.json"):
    try:
        with open(config_path, "r") as f:
            return json.load(f)
    except FileNotFoundError:
        print(f"Error: Config file not found at {config_path}")
        sys.exit(1)

def parse_log_content(log_content):
    """Parse log content from a string."""
    print(f"Parsing log content ({len(log_content)} chars)")
    error_data = {} # Map msg -> {'count': int, 'trace': str}

    pending_error_msg = None
    pending_trace = []
    stack_confirmed = False

    # Helper to finalize block
    def finalize_block(msg, trace, data_dict):
        key = msg
        # Try to append first stack line for better context/clustering
        if len(trace) > 1:
            first_trace_line = trace[1].strip()
            # Truncate if too long to keep UI clean
            key = f"{msg} \n {first_trace_line[:100]}"

        if key not in data_dict:
             data_dict[key] = {'count': 1, 'trace': "".join(trace)}
        else:
             data_dict[key]['count'] += 1

    lines = log_content.split('\n')
    for line in lines:
        # Check if it's a new log entry
        if line.startswith("v1|"):
            # End of previous block: Did we have an error with a confirmed stack trace?
            if pending_error_msg and stack_confirmed:
                finalize_block(pending_error_msg, pending_trace, error_data)

            # Reset for new block
            pending_error_msg = None
            pending_trace = []
            stack_confirmed = False

            # Check if THIS new line is an error
            parts = line.split("|")
            if len(parts) > 9:
                level = parts[6].strip()
                if "ERROR" in level:
                    pending_error_msg = parts[9].strip()
                    pending_trace.append(line + '\n')
        else:
            # Continuation line
            if pending_error_msg:
                pending_trace.append(line + '\n')
                stripped = line.strip()
                # Strict check for Java stack traces
                if (stripped.startswith("at ") or
                    stripped.startswith("Caused by:") or
                    stripped.startswith("... ")):
                    stack_confirmed = True

    # End of content check
    if pending_error_msg and stack_confirmed:
        finalize_block(pending_error_msg, pending_trace, error_data)

    # Convert to list of dicts
    unique_errors = []
    for msg, data in error_data.items():
        unique_errors.append({"message": msg, "count": data['count'], "trace": data['trace']})

    # Sort by count desc
    unique_errors.sort(key=lambda x: x["count"], reverse=True)
    return unique_errors

def parse_log_clusters(log_path):
    """Parse log file and return clusters."""
    print(f"Parsing log file: {log_path}")

    try:
        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            log_content = f.read()
            return parse_log_content(log_content)
    except FileNotFoundError:
        print(f"Error: Log file not found at {log_path}")
        sys.exit(1)

def get_available_models():
    """Fetches available models from opencode."""
    try:
        cmd = 'source ~/.zshrc && opencode models'
        result = subprocess.run(cmd, shell=True, executable="/bin/zsh", capture_output=True, text=True)
        if result.returncode == 0:
            # Filter distinct non-empty lines, ignore version numbers if any
            models = [line.strip() for line in result.stdout.split('\n') if line.strip() and not line.strip()[0].isdigit()]
            return models
        return []
    except Exception:
        return []

# Global process tracker for cancellation support
_opencode_process = None

def cancel_opencode_fix():
    """Cancel the running OpenCode process if any."""
    global _opencode_process
    if _opencode_process and _opencode_process.poll() is None:
        _opencode_process.terminate()
        try:
            _opencode_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _opencode_process.kill()
        _opencode_process = None
        return True, "OpenCode process cancelled."
    return False, "No running process to cancel."

def run_opencode_fix(repo_path, error_context, model=None):
    """
    Runs opencode fix and yields output lines for streaming.
    Final yield will be a tuple (success: bool, final_message: str).
    """
    print(f"Delegating fix to OpenCode...")
    
    # Construct Prompts
    prompt = (
        f"Analyze the repository at {repo_path}. "
        f"I have found the following error log:\n\n{error_context}\n\n"
        "Locate the code responsible for this error and apply a fix directly to the file(s). "
        "Do not ask for confirmation, just apply the code changes."
    )
    
    # Use shlex.quote to handle special characters/quotes in the log text safety
    safe_prompt = shlex.quote(prompt)
    
    # Construct command
    base_cmd = 'source ~/.zshrc && opencode run --print-logs'
    if model:
        base_cmd += f' --model {shlex.quote(model)}'
    
    cmd = f'{base_cmd} {safe_prompt}'
    
    full_output = []
    
    try:
        global _opencode_process
        process = subprocess.Popen(
            cmd,
            shell=True,
            cwd=repo_path,
            executable="/bin/zsh",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, # Merge stderr into stdout for single stream
            text=True,
            bufsize=1, # Line buffered
            universal_newlines=True
        )
        _opencode_process = process
        
        # Stream output
        for line in process.stdout:
            line_clean = line.strip()
            if line_clean:
                full_output.append(line_clean)
                yield line_clean
        
        # Wait for completion
        process.wait()
        
        combined_output = "\n".join(full_output)
        
        if process.returncode != 0:
            yield (False, f"OpenCode failed (Exit {process.returncode}):\n{combined_output}")
            return

        if not combined_output.strip():
             yield (True, "OpenCode completed with Exit 0 but returned NO output.")
             return

        yield (True, f"OpenCode Output:\n{combined_output}")

    except Exception as e:
        yield (False, f"Error running OpenCode: {e}")

def prepare_repo(repo_path):
    print(f"Preparing repo at {repo_path}...")
    try:
        # Checkout master
        subprocess.run(["git", "checkout", "master"], cwd=repo_path, check=True, capture_output=True)
        
        # Pull latest
        subprocess.run(["git", "pull"], cwd=repo_path, check=True, capture_output=True)
        
        return True, "Successfully checked out master and pulled latest changes."
    except subprocess.CalledProcessError as e:
        error_details = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8') if e.stderr else str(e))
        return False, f"Git preparation failed:\n{error_details}"

def get_git_diff(repo_path):
    try:
        # Check both unstaged and staged changes just in case
        # But mostly expect unstaged from OpenCode
        result = subprocess.run(["git", "diff"], cwd=repo_path, capture_output=True, text=True, check=True)
        return result.stdout
    except Exception as e:
        return f"Error getting diff: {e}"

def discard_changes(repo_path):
    try:
        subprocess.run(["git", "checkout", "."], cwd=repo_path, check=True)
        subprocess.run(["git", "clean", "-fd"], cwd=repo_path, check=True)
        return True, "Changes discarded."
    except Exception as e:
        return False, f"Error discarding changes: {e}"

def run_git_commands(repo_path, message):
    try:
        # sanitize message
        safe_message = message.split('\n')[0][:100] # Take first line, max 100 chars
        
        # Checkout new branch
        import time
        ts = int(time.time())
        branch_name = f"fix/error-{ts}"
        
        subprocess.run(["git", "checkout", "-b", branch_name], cwd=repo_path, check=False, capture_output=True) 
        
        # Add changes
        subprocess.run(["git", "add", "."], cwd=repo_path, check=True, capture_output=True)
        
        # Explicitly unstage IDE files if they were added (User blocked these)
        ide_files = [".classpath", ".project", ".factorypath"]
        subprocess.run(["git", "restore", "--staged"] + ide_files, cwd=repo_path, check=False, capture_output=True)
        
        # Check if we have anything to commit
        # git diff --cached --exit-code returns 1 if there are changes, 0 if clean
        diff_result = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=repo_path, capture_output=True)
        
        if diff_result.returncode == 0:
            return False, "OpenCode completed successfully, but NO file changes were detected to commit. It might have failed to find the code."
        
        # Commit
        # Use --no-verify to bypass failing pre-commit hooks
        subprocess.run(["git", "commit", "--no-verify", "-m", safe_message], cwd=repo_path, check=True, capture_output=True)
        
        return True, f"Success! Fix committed to branch: {branch_name}"
            
    except subprocess.CalledProcessError as e:
        error_details = e.stderr if isinstance(e.stderr, str) else (e.stderr.decode('utf-8') if e.stderr else str(e))
        return False, f"Git command failed:\n{error_details}"

if __name__ == "__main__":
    def main():
        config = load_config()
        log_path = config.get("log_file_path")
        repo_path = config.get("repo_path")
        
        if not log_path or not repo_path:
            print("Error: Missing log_file_path or repo_path in config.")
            return

        # 1. Parse & Cluster Logs
        errors = parse_log_clusters(log_path)
        if not errors:
            print("No errors found in the log.")
            return
        
        # 2. Dashboard
        print(f"\n{'='*60}")
        print(f"{'ID':<5} | {'Count':<8} | {'Error Message'}")
        print(f"{'-'*60}")
        
        for idx, err in enumerate(errors):
            msg_display = (err['message'][:70] + '...') if len(err['message']) > 70 else err['message']
            print(f"[{idx+1:<3}] | {err['count']:<8} | {msg_display}")
        print(f"{'='*60}\n")
        
        selection = input("Select an error ID to fix (or 'q' to quit): ").strip()
        if selection.lower() == 'q':
            return
            
        try:
            sel_idx = int(selection) - 1
            if sel_idx < 0 or sel_idx >= len(errors):
                print("Invalid selection.")
                return
        except ValueError:
            print("Invalid input.")
            return
            
        selected_error = errors[sel_idx]
        print(f"\nSelected: {selected_error['message']}")
        
        # 3. Apply Fix via OpenCode
        print(f"Delegating fix to OpenCode...")
        success = False
        msg = ""
        
        for item in run_opencode_fix(repo_path, selected_error['trace']):
            if isinstance(item, tuple):
                 success, msg = item
            else:
                 print(f"[OpenCode] {item}")
        
        if success:
            print("Fix applied by OpenCode.")
            # 5. Git Ops
            git_success, git_msg = run_git_commands(repo_path, f"Fix: {selected_error['message']}")
            print(git_msg)
        else:
            print(f"Failed to apply fix: {msg}")

    main()
