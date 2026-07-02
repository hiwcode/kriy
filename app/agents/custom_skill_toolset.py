"""Custom skill toolset extensions for dynamic script execution."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
import subprocess
from typing import Any
from uuid import uuid4

from google.genai import types

from app.agents.skill_code_executor import AutoVenvSkillCodeExecutor
from google.adk.skills import models
from google.adk.tools.skill_toolset import RunSkillScriptTool, SkillToolset, _SkillScriptCodeExecutor
from google.adk.tools.tool_context import ToolContext


class _PersistentSkillScriptExecutor:
    """Execute skill scripts from a persistent run directory and return artifacts."""

    def __init__(
        self,
        code_executor: AutoVenvSkillCodeExecutor,
        script_timeout: int,
    ):
        self._code_executor = code_executor
        self._script_timeout = script_timeout

    async def execute_script_async(
        self,
        skill: models.Skill,
        script_path: str,
        script_args: dict[str, Any],
    ) -> dict[str, Any]:
        if "." in script_path:
            ext = script_path.rsplit(".", 1)[-1].lower()
        else:
            ext = ""

        if ext not in ("py", "sh", "bash"):
            ext_msg = f"'.{ext}'" if ext else "(no extension)"
            return {
                "error": (
                    f"Unsupported script type {ext_msg}."
                    " Supported types: .py, .sh, .bash"
                ),
                "error_code": "UNSUPPORTED_SCRIPT_TYPE",
            }

        normalized_path = script_path if script_path.startswith("scripts/") else f"scripts/{script_path}"

        run_root = self._code_executor.get_workspace_temp_root() / "skill-runs"
        run_root.mkdir(parents=True, exist_ok=True)
        run_id = f"{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:8]}"
        run_dir = run_root / f"{skill.name}-{run_id}"
        run_dir.mkdir(parents=True, exist_ok=True)

        input_rel_paths = self._materialize_skill_files(skill, run_dir)
        script_abs_path = run_dir / normalized_path
        if not script_abs_path.exists():
            return {
                "error": f"Script '{script_path}' not found in skill '{skill.name}'.",
                "error_code": "SCRIPT_NOT_FOUND",
            }

        if ext == "py":
            py_result = self._code_executor.run_python_file(
                script_file=script_abs_path,
                args=script_args,
                cwd=run_dir,
            )
            stdout = py_result.get("stdout", "")
            stderr = py_result.get("stderr", "")
            rc = int(py_result.get("returncode", 1))
            installed_packages = py_result.get("installed_packages", []) or []
            if installed_packages:
                prefix = f"[auto-installed in venv: {', '.join(installed_packages)}]"
                stdout = f"{prefix}\n{stdout}" if stdout else prefix
        else:
            cmd = ["bash", normalized_path]
            for k, v in script_args.items():
                cmd.extend([f"--{k}", str(v)])
            shell = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=self._script_timeout,
                cwd=str(run_dir),
            )
            stdout = shell.stdout
            stderr = shell.stderr
            rc = shell.returncode

        status = "success"
        if rc != 0:
            status = "error"
        elif stderr and not stdout:
            status = "error"
        elif stderr:
            status = "warning"

        artifacts = self._collect_artifacts(run_dir, input_rel_paths)
        artifact_paths = [str(run_dir / rel) for rel in artifacts]
        saved_path = artifact_paths[0] if artifact_paths else str(run_dir)
        return {
            "skill_name": skill.name,
            "script_path": script_path,
            "stdout": stdout,
            "stderr": stderr,
            "status": status,
            "run_directory": str(run_dir),
            "artifact_paths": artifact_paths,
            "artifact_files": artifacts,
            "saved_paths": artifact_paths,
            "saved_path": saved_path,
        }

    def _materialize_skill_files(self, skill: models.Skill, run_dir: Path) -> set[str]:
        files_dict: dict[str, str | bytes] = {}

        for ref_name in skill.resources.list_references():
            content = skill.resources.get_reference(ref_name)
            if content is not None:
                files_dict[f"references/{ref_name}"] = content

        for asset_name in skill.resources.list_assets():
            content = skill.resources.get_asset(asset_name)
            if content is not None:
                files_dict[f"assets/{asset_name}"] = content

        for scr_name in skill.resources.list_scripts():
            scr = skill.resources.get_script(scr_name)
            if scr is not None and scr.src is not None:
                files_dict[f"scripts/{scr_name}"] = scr.src

        input_rel_paths: set[str] = set()
        for rel_path, content in files_dict.items():
            dst = run_dir / rel_path
            dst.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, bytes):
                dst.write_bytes(content)
            else:
                dst.write_text(content, encoding="utf-8")
            input_rel_paths.add(rel_path)

        return input_rel_paths

    def _collect_artifacts(self, run_dir: Path, input_rel_paths: set[str]) -> list[str]:
        artifacts: list[str] = []
        for p in run_dir.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(run_dir).as_posix()
            if rel in input_rel_paths:
                continue
            artifacts.append(rel)

        artifacts.sort()
        return artifacts


class DynamicRunSkillScriptTool(RunSkillScriptTool):
    """`run_skill_script` with optional inline script creation."""

    def _get_declaration(self) -> types.FunctionDeclaration | None:
        return types.FunctionDeclaration(
            name=self.name,
            description=(
                "Executes a script from a skill's scripts/ directory. "
                "If the script does not exist yet, provide script_content to create "
                "it for this run and execute it immediately."
            ),
            parameters_json_schema={
                "type": "object",
                "properties": {
                    "skill_name": {
                        "type": "string",
                        "description": "The name of the skill.",
                    },
                    "script_path": {
                        "type": "string",
                        "description": (
                            "The relative script path (for example, 'scripts/setup.py')."
                        ),
                    },
                    "script_content": {
                        "type": "string",
                        "description": (
                            "Optional inline script content. If the script_path does not "
                            "exist in the skill resources, this content is used to create "
                            "and run the script for the current call."
                        ),
                    },
                    "args": {
                        "type": "object",
                        "description": (
                            "Optional arguments to pass to the script as key-value pairs."
                        ),
                    },
                },
                "required": ["skill_name", "script_path"],
            },
        )

    async def run_async(
        self, *, args: dict[str, Any], tool_context: ToolContext
    ) -> Any:
        skill_name = args.get("skill_name")
        script_path = args.get("script_path")
        script_content = args.get("script_content")
        script_args = args.get("args", {})

        if not isinstance(script_args, dict):
            return {
                "error": (
                    "'args' must be a JSON object (key-value pairs),"
                    f" got {type(script_args).__name__}."
                ),
                "error_code": "INVALID_ARGS_TYPE",
            }

        if not skill_name:
            return {
                "error": "Skill name is required.",
                "error_code": "MISSING_SKILL_NAME",
            }
        if not script_path:
            return {
                "error": "Script path is required.",
                "error_code": "MISSING_SCRIPT_PATH",
            }

        skill = self._toolset._get_skill(skill_name)
        if not skill:
            return {
                "error": f"Skill '{skill_name}' not found.",
                "error_code": "SKILL_NOT_FOUND",
            }

        normalized_script_path = (
            script_path[len("scripts/") :] if script_path.startswith("scripts/") else script_path
        )
        script = skill.resources.get_script(normalized_script_path)
        created_from_inline = False

        if script is None:
            if not isinstance(script_content, str) or not script_content.strip():
                return {
                    "error": (
                        f"Script '{script_path}' not found in skill '{skill_name}'. "
                        "Provide 'script_content' to create and run it dynamically."
                    ),
                    "error_code": "SCRIPT_NOT_FOUND",
                }

            dynamic_scripts = dict(skill.resources.scripts)
            dynamic_scripts[normalized_script_path] = models.Script(src=script_content)

            # Clone the skill with an in-memory script addition for this execution.
            skill = models.Skill(
                frontmatter=skill.frontmatter,
                instructions=skill.instructions,
                resources=models.Resources(
                    references=dict(skill.resources.references),
                    assets=dict(skill.resources.assets),
                    scripts=dynamic_scripts,
                ),
            )
            created_from_inline = True

        code_executor = self._toolset._code_executor
        if code_executor is None:
            agent = tool_context._invocation_context.agent
            if hasattr(agent, "code_executor"):
                code_executor = agent.code_executor
        if code_executor is None:
            return {
                "error": (
                    "No code executor configured. A code executor is"
                    " required to run scripts."
                ),
                "error_code": "NO_CODE_EXECUTOR",
            }

        if isinstance(code_executor, AutoVenvSkillCodeExecutor):
            script_executor = _PersistentSkillScriptExecutor(
                code_executor=code_executor,
                script_timeout=self._toolset._script_timeout,  # pylint: disable=protected-access
            )
            result = await script_executor.execute_script_async(
                skill=skill,
                script_path=script_path,
                script_args=script_args,
            )
        else:
            script_executor = _SkillScriptCodeExecutor(
                code_executor, self._toolset._script_timeout  # pylint: disable=protected-access
            )
            result = await script_executor.execute_script_async(
                tool_context._invocation_context, skill, script_path, script_args  # pylint: disable=protected-access
            )

        if created_from_inline and isinstance(result, dict) and "status" in result:
            result["script_source"] = "inline"

        if isinstance(result, dict) and "status" in result:
            run_directory = result.get("run_directory")
            artifact_paths = result.get("artifact_paths")
            if not isinstance(artifact_paths, list):
                artifact_paths = []

            normalized_paths = [str(p) for p in artifact_paths if p]
            result["saved_paths"] = normalized_paths

            if normalized_paths:
                result["saved_path"] = normalized_paths[0]
            elif run_directory:
                result["saved_path"] = str(run_directory)
            else:
                result["saved_path"] = ""

        return result


class DynamicSkillToolset(SkillToolset):
    """SkillToolset variant that supports dynamic script creation + execution."""

    def __init__(self, *args: Any, **kwargs: Any):
        super().__init__(*args, **kwargs)
        self._tools = [
            DynamicRunSkillScriptTool(self) if isinstance(tool, RunSkillScriptTool) else tool
            for tool in self._tools
        ]