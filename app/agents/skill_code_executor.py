"""Custom ADK code executor for isolated skill script execution."""

from __future__ import annotations

import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from google.adk.code_executors.base_code_executor import BaseCodeExecutor
from google.adk.code_executors.code_execution_utils import CodeExecutionInput, CodeExecutionResult


class AutoVenvSkillCodeExecutor(BaseCodeExecutor):
    """Execute skill wrapper code in an isolated runtime virtual environment.

    Script files still run from a per-execution temp directory, but dependency
    installs are kept in a persistent venv under temp/ so libraries remain
    available across calls. If a script fails with ModuleNotFoundError, the
    executor installs the missing module and retries.
    """

    script_timeout_seconds: int = 300
    pip_timeout_seconds: int = 180
    max_auto_installs: int = 3
    temp_root_dir: str = "temp"
    runtime_venv_dirname: str = "skill-runtime-venv"

    def get_workspace_temp_root(self) -> Path:
        root = Path(self.temp_root_dir).resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    def get_runtime_python(self) -> tuple[Path | None, str | None]:
        workspace_temp = self.get_workspace_temp_root()
        venv_path = workspace_temp / self.runtime_venv_dirname
        created, create_error = self._create_venv(venv_path)
        if not created:
            return None, create_error
        return self._python_bin_for_venv(venv_path).resolve(), None

    def run_python_file(
        self,
        script_file: Path,
        args: dict[str, Any] | None = None,
        cwd: Path | None = None,
    ) -> dict[str, Any]:
        python_bin, err = self.get_runtime_python()
        if python_bin is None:
            return {
                "stdout": "",
                "stderr": err or "Failed to initialize runtime Python.",
                "returncode": 1,
                "installed_packages": [],
            }

        cmd = [str(python_bin), str(script_file)]
        for k, v in (args or {}).items():
            cmd.extend([f"--{k}", str(v)])
        return self._run_process_with_auto_install(
            cmd=cmd,
            python_bin=python_bin,
            cwd=cwd or script_file.parent,
        )

    def execute_code(
        self,
        invocation_context: object,
        code_execution_input: CodeExecutionInput,
    ) -> CodeExecutionResult:
        del invocation_context  # Unused by this stateless executor.

        workspace_temp = self.get_workspace_temp_root()

        try:
            venv_path = workspace_temp / self.runtime_venv_dirname
            created, create_error = self._create_venv(venv_path)
            if not created:
                return CodeExecutionResult(stderr=create_error)

            python_bin = self._python_bin_for_venv(venv_path).resolve()
            with tempfile.TemporaryDirectory(prefix="skill-exec-", dir=str(workspace_temp)) as run_dir:
                run_path = Path(run_dir)
                wrapper_file = run_path / "skill_wrapper.py"
                wrapper_file.write_text(code_execution_input.code, encoding="utf-8")

                installed_packages: list[str] = []
                install_attempts = 0

                proc_result = self._run_process_with_auto_install(
                    cmd=[str(python_bin), str(wrapper_file)],
                    python_bin=python_bin,
                    cwd=run_path,
                )

                stdout = proc_result.get("stdout", "")
                stderr = proc_result.get("stderr", "")
                installed_packages = proc_result.get("installed_packages") or []

                if proc_result.get("returncode", 1) == 0:
                    if installed_packages:
                        installed = ", ".join(installed_packages)
                        stdout = f"[auto-installed in venv: {installed}]\n{stdout}" if stdout else f"[auto-installed in venv: {installed}]"
                    return CodeExecutionResult(stdout=stdout, stderr=stderr)

                if installed_packages:
                    installed = ", ".join(installed_packages)
                    stderr = f"{stderr}\n[auto-installed in venv before failure: {installed}]" if stderr else f"[auto-installed in venv before failure: {installed}]"
                return CodeExecutionResult(stdout=stdout, stderr=stderr or "Script execution failed.")
        except Exception as exc:  # pragma: no cover - safety net
            return CodeExecutionResult(stderr=f"Skill execution failed: {exc}")

    def _run_process_with_auto_install(
        self,
        cmd: list[str],
        python_bin: Path,
        cwd: Path,
    ) -> dict[str, Any]:
        installed_packages: list[str] = []
        install_attempts = 0

        while True:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self.script_timeout_seconds,
                cwd=str(cwd),
            )

            combined_output = "\n".join(filter(None, [result.stdout, result.stderr]))
            missing_module = self._extract_missing_module(combined_output)

            if result.returncode == 0:
                return {
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "returncode": 0,
                    "installed_packages": installed_packages,
                }

            if not missing_module or install_attempts >= self.max_auto_installs:
                stderr = result.stderr or f"Script exited with code {result.returncode}."
                return {
                    "stdout": result.stdout,
                    "stderr": stderr,
                    "returncode": result.returncode,
                    "installed_packages": installed_packages,
                }

            install_attempts += 1
            install_ok, install_msg = self._install_package(python_bin, missing_module)
            if not install_ok:
                stderr = result.stderr or ""
                if stderr:
                    stderr += "\n"
                stderr += f"Auto-install failed for module '{missing_module}': {install_msg}"
                return {
                    "stdout": result.stdout,
                    "stderr": stderr,
                    "returncode": result.returncode,
                    "installed_packages": installed_packages,
                }

            installed_packages.append(missing_module)

    def _create_venv(self, venv_path: Path) -> tuple[bool, str]:
        if self._python_bin_for_venv(venv_path).exists():
            return True, ""

        try:
            subprocess.run(
                [sys.executable, "-m", "venv", str(venv_path)],
                capture_output=True,
                text=True,
                timeout=self.pip_timeout_seconds,
                check=True,
            )
            # Ensure pip is available in environments created without ensurepip.
            subprocess.run(
                [str(self._python_bin_for_venv(venv_path)), "-m", "ensurepip", "--upgrade"],
                capture_output=True,
                text=True,
                timeout=self.pip_timeout_seconds,
                check=False,
            )
            return True, ""
        except subprocess.CalledProcessError as exc:
            err = exc.stderr.strip() or exc.stdout.strip() or str(exc)
            return False, f"Failed to create virtual environment: {err}"
        except subprocess.TimeoutExpired:
            return False, "Failed to create virtual environment: timed out."

    def _run_wrapper(
        self,
        python_bin: Path,
        wrapper_file: Path,
        workdir: Path,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [str(python_bin), str(wrapper_file)],
            capture_output=True,
            text=True,
            timeout=self.script_timeout_seconds,
            cwd=str(workdir),
        )

    def _install_package(self, python_bin: Path, module_name: str) -> tuple[bool, str]:
        package_name = module_name.split(".", 1)[0]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", package_name):
            return False, "module name is not a safe package specifier"

        env = os.environ.copy()
        env.setdefault("PIP_DISABLE_PIP_VERSION_CHECK", "1")
        try:
            base_cmd = [str(python_bin), "-m", "pip", "install", package_name]
            install = subprocess.run(
                base_cmd,
                capture_output=True,
                text=True,
                timeout=self.pip_timeout_seconds,
                env=env,
            )

            # Some Python distributions enforce PEP 668 policy and require this
            # explicit override even in project-local environments.
            err_text = (install.stderr or "") + "\n" + (install.stdout or "")
            if install.returncode != 0 and "externally-managed-environment" in err_text:
                install = subprocess.run(
                    base_cmd + ["--break-system-packages"],
                    capture_output=True,
                    text=True,
                    timeout=self.pip_timeout_seconds,
                    env=env,
                )

            if install.returncode == 0:
                return True, install.stdout.strip() or "installed"
            msg = install.stderr.strip() or install.stdout.strip() or f"exit code {install.returncode}"
            return False, msg
        except subprocess.TimeoutExpired:
            return False, "pip install timed out"
        except Exception as exc:  # pragma: no cover - safety net
            return False, str(exc)

    def _extract_missing_module(self, output: str) -> str | None:
        patterns = [
            r"No module named ['\"]([^'\"]+)['\"]",
            r"ModuleNotFoundError:\s*([^\n]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, output)
            if match:
                value = match.group(1).strip()
                if value.startswith("No module named"):
                    nested = re.search(r"['\"]([^'\"]+)['\"]", value)
                    if nested:
                        return nested.group(1)
                return value
        return None

    def _python_bin_for_venv(self, venv_path: Path) -> Path:
        if os.name == "nt":
            return venv_path / "Scripts" / "python.exe"
        return venv_path / "bin" / "python"