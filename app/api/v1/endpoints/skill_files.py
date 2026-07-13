from __future__ import annotations

import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from app.core.security import AuthContext, api_key_auth, require_google_auth
from app.core.access import require_resource_access
from app.deps import get_db, get_current_workspace
from app.schemas.skill_file import SkillFileCreate, SkillFileUpdate, SkillFileBulkDelete
from app.schemas.response import ApiResponse
from app.services import skill_file_service
from app.repositories import skill_file_repo, skill_folder_repo, skill_repo
import asyncpg
import httpx

router = APIRouter(prefix="/skill-files", tags=["skill-files"], dependencies=[Depends(api_key_auth)])


async def _require_skill_access(skill_id: int, pool: asyncpg.Pool, auth: AuthContext) -> dict:
    skill = await skill_repo.get_skill(pool, skill_id)
    if not skill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    await require_resource_access(skill, pool, auth)
    return skill


async def _require_file_access(file_id: int, pool: asyncpg.Pool, auth: AuthContext) -> dict:
    f = await skill_file_service.get_file(pool, file_id)
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    await require_resource_access(f, pool, auth)
    return f


@router.post("/", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def create_file(
    data: SkillFileCreate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    workspace_id = workspace["id"] if workspace else None
    await _require_skill_access(data.skill_id, pool, auth)
    f = await skill_file_service.create_file(pool, data, created_by=auth.user_id, workspace_id=workspace_id)
    return {"success": True, "message": "File created", "data": f, "pagination": None}


@router.get("/tree/{skill_id}", response_model=ApiResponse)
async def get_skill_tree(
    skill_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_skill_access(skill_id, pool, auth)
    tree = await skill_file_service.get_skill_tree(pool, skill_id)
    return {"success": True, "message": "Tree fetched", "data": tree, "pagination": None}


@router.get("/{file_id}", response_model=ApiResponse)
async def get_file(
    file_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    f = await _require_file_access(file_id, pool, auth)
    return {"success": True, "message": "File fetched", "data": f, "pagination": None}


@router.patch("/{file_id}", response_model=ApiResponse)
async def update_file(
    file_id: int,
    data: SkillFileUpdate,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_file_access(file_id, pool, auth)
    f = await skill_file_service.update_file(pool, file_id, data)
    if not f:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return {"success": True, "message": "File updated", "data": f, "pagination": None}


@router.delete("/{file_id}", response_model=ApiResponse, status_code=status.HTTP_200_OK)
async def delete_file(
    file_id: int,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    await _require_file_access(file_id, pool, auth)
    deleted = await skill_file_service.delete_file(pool, file_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return {"success": True, "message": "File deleted", "data": None, "pagination": None}


@router.post("/bulk-delete", response_model=ApiResponse)
async def bulk_delete_files(
    payload: SkillFileBulkDelete,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
) -> dict:
    # Only delete files the caller can actually access.
    owned: list[int] = []
    for fid in payload.ids:
        f = await skill_file_service.get_file(pool, fid)
        if not f:
            continue
        try:
            await require_resource_access(f, pool, auth)
        except HTTPException:
            continue
        owned.append(fid)
    deleted_ids = await skill_file_service.bulk_delete_files(pool, owned) if owned else []
    return {"success": True, "message": "Files deleted", "data": {"deleted_ids": deleted_ids}, "pagination": None}


_BINARY_EXTS = frozenset({
    "png", "jpg", "jpeg", "gif", "ico", "bmp", "webp", "mp3", "mp4",
    "wav", "ogg", "pdf", "zip", "gz", "tar", "bz2", "7z", "rar",
    "woff", "woff2", "ttf", "eot", "otf", "exe", "dll", "so", "dylib",
    "pyc", "pyo", "class", "o", "obj",
})


def _is_binary(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in _BINARY_EXTS


def _detect_file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("md", "mdx", "markdown"):
        return "md"
    if ext in ("py", "js", "ts", "tsx", "jsx", "sh", "bash", "rb", "go", "rs",
               "java", "sql", "r", "pl", "lua", "swift", "kt", "cs", "cpp",
               "c", "h", "hpp", "zsh"):
        return "script"
    if ext in ("json", "yaml", "yml", "toml", "xml", "ini", "cfg", "conf", "env"):
        return "config"
    if ext in ("html", "css", "scss", "less", "svg"):
        return "template"
    if ext in ("png", "jpg", "jpeg", "gif", "ico", "bmp", "webp"):
        return "asset"
    return "text"


@router.post("/upload/{skill_id}", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def upload_files(
    skill_id: int,
    file: UploadFile = File(...),
    folder_id: int | None = Query(None),
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Upload a file or ZIP archive. ZIP files are extracted automatically."""
    await _require_skill_access(skill_id, pool, auth)
    workspace_id = workspace["id"] if workspace else None
    content = await file.read()
    filename = file.filename or "uploaded"
    created: list[dict] = []

    if filename.lower().endswith(".zip"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                folder_map: dict[str, int] = {}
                for entry in sorted(zf.namelist()):
                    if entry.startswith("__MACOSX") or "/." in entry or entry.startswith("."):
                        continue

                    if entry.endswith("/"):
                        dir_path = entry.rstrip("/")
                        if not dir_path:
                            continue
                        parts = dir_path.split("/")
                        name = parts[-1]
                        parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
                        parent_fid = folder_map.get(parent_path, folder_id)
                        folder = await skill_folder_repo.create_folder(
                            pool, name=name, parent_id=parent_fid,
                            skill_id=skill_id, created_by=auth.user_id,
                            workspace_id=workspace_id,
                        )
                        folder_map[dir_path] = folder["id"]
                    else:
                        parts = entry.split("/")
                        name = parts[-1]
                        if not name:
                            continue
                        if _is_binary(name):
                            continue
                        parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
                        parent_fid = folder_map.get(parent_path, folder_id)
                        try:
                            raw = zf.read(entry)
                            text = raw.decode("utf-8")
                        except (UnicodeDecodeError, Exception):
                            text = "[Binary content - not displayable]"
                        f = await skill_file_repo.create_file(
                            pool, skill_id=skill_id, name=name, content=text,
                            file_type=_detect_file_type(name), folder_id=parent_fid,
                            created_by=auth.user_id, workspace_id=workspace_id,
                        )
                        created.append(f)
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Invalid ZIP file") from exc
    else:
        if _is_binary(filename):
            raise HTTPException(status_code=400, detail="Binary files are not supported. Upload as part of a ZIP archive.")
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            text = "[Binary content - not displayable]"
        f = await skill_file_repo.create_file(
            pool, skill_id=skill_id, name=filename, content=text,
            file_type=_detect_file_type(filename), folder_id=folder_id,
            created_by=auth.user_id, workspace_id=workspace_id,
        )
        created.append(f)

    tree = await skill_file_service.get_skill_tree(pool, skill_id)
    return {
        "success": True,
        "message": f"{len(created)} file(s) uploaded",
        "data": tree,
        "pagination": None,
    }


@router.post("/install", response_model=ApiResponse, status_code=status.HTTP_201_CREATED)
async def install_from_url(
    data: dict,
    pool: asyncpg.Pool = Depends(get_db),
    auth: AuthContext = Depends(require_google_auth),
    workspace: dict | None = Depends(get_current_workspace),
) -> dict:
    """Install a skill from a Git repository URL.

    Supports:
      - Full repo: {"url": "https://github.com/owner/repo"}
      - Specific skill: {"url": "https://github.com/owner/repo", "skill": "frontend-design"}
      - With branch: {"url": "...", "branch": "main"}
      - Name override: {"url": "...", "name": "my-skill"}
    """
    url = data.get("url", "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    workspace_id = workspace["id"] if workspace else None

    import re
    match = re.match(r"https?://github\.com/([^/]+)/([^/.\s]+)", url)
    if not match:
        raise HTTPException(status_code=400, detail="Only GitHub URLs are supported. Format: https://github.com/owner/repo")

    owner, repo = match.group(1), match.group(2)
    branch = data.get("branch", "main")
    # "skill" param selects a subdirectory within the repo (e.g. "frontend-design")
    skill_subdir = data.get("skill", "").strip()
    skill_name = data.get("name") or skill_subdir or repo

    # Download ZIP from GitHub
    zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            resp = await client.get(zip_url)
            if resp.status_code == 404:
                zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/master.zip"
                resp = await client.get(zip_url)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to download repository (HTTP {resp.status_code})")
            zip_content = resp.content
    except httpx.RequestError as exc:
        raise HTTPException(status_code=400, detail=f"Failed to connect: {exc}") from exc

    import yaml as yaml_mod

    manifest = None
    skill_description = None
    skill_instructions = ""

    try:
        with zipfile.ZipFile(io.BytesIO(zip_content)) as zf:
            entries = sorted(zf.namelist())

            # GitHub ZIPs have a root folder like "repo-main/"
            repo_prefix = ""
            if entries and entries[0].endswith("/"):
                repo_prefix = entries[0]

            # If a specific skill subdirectory is requested, scope to it
            # e.g. "skills-main/frontend-design/" becomes the new prefix
            prefix = repo_prefix
            if skill_subdir:
                # Try common patterns: direct subdir, or nested in common folders
                candidates = [
                    f"{repo_prefix}{skill_subdir}/",
                    f"{repo_prefix}skills/{skill_subdir}/",
                    f"{repo_prefix}src/{skill_subdir}/",
                ]
                found = False
                for candidate in candidates:
                    if any(e.startswith(candidate) for e in entries):
                        prefix = candidate
                        found = True
                        break
                if not found:
                    # List available subdirectories for helpful error
                    top_dirs = set()
                    for e in entries:
                        if e.startswith(repo_prefix) and e != repo_prefix:
                            rel = e[len(repo_prefix):]
                            parts = rel.split("/")
                            if len(parts) > 1 and parts[0]:
                                top_dirs.add(parts[0])
                    available = ", ".join(sorted(top_dirs)[:20])
                    raise HTTPException(
                        status_code=400,
                        detail=f"Skill '{skill_subdir}' not found in repo. Available: {available}"
                    )

            # Look for manifest (skill.yaml, skill.yml, skill.json)
            for name in ["skill.yaml", "skill.yml", "skill.json"]:
                manifest_path = prefix + name
                if manifest_path in entries:
                    raw = zf.read(manifest_path).decode("utf-8")
                    if name.endswith(".json"):
                        import json as json_mod
                        manifest = json_mod.loads(raw)
                    else:
                        manifest = yaml_mod.safe_load(raw)
                    break

            # Look for SKILL.md or README.md for instructions
            for name in ["SKILL.md", "skill.md", "README.md", "readme.md"]:
                md_path = prefix + name
                if md_path in entries:
                    skill_instructions = zf.read(md_path).decode("utf-8")
                    break

            if manifest:
                skill_name = manifest.get("name", skill_name)
                skill_description = manifest.get("description")
                if manifest.get("instructions") and not skill_instructions:
                    instr_path = prefix + manifest["instructions"]
                    if instr_path in entries:
                        skill_instructions = zf.read(instr_path).decode("utf-8")

            # Create the skill
            from app.services import skill_service
            from app.schemas.skill import SkillCreate

            tools = []
            if manifest and "tools" in manifest:
                tools = manifest["tools"]

            skill = await skill_service.create_skill(
                pool,
                SkillCreate(
                    name=skill_name,
                    description=skill_description,
                    instructions=skill_instructions or f"# {skill_name}\n\nImported from {url}",
                    tools=tools,
                ),
                created_by=auth.user_id,
                workspace_id=workspace_id,
            )

            skill_id = skill["id"]

            # Import all files (skip the manifest and root folder prefix)
            folder_map: dict[str, int] = {}
            created_files = []

            for entry in entries:
                if not entry.startswith(prefix):
                    continue
                relative = entry[len(prefix):]
                if not relative or relative == "/":
                    continue

                # Skip hidden files and __MACOSX
                if relative.startswith(".") or "/__MACOSX" in relative or "/." in relative:
                    continue

                if relative.endswith("/"):
                    # Directory
                    dir_path = relative.rstrip("/")
                    if not dir_path:
                        continue
                    parts = dir_path.split("/")
                    name = parts[-1]
                    parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
                    parent_fid = folder_map.get(parent_path)

                    folder = await skill_folder_repo.create_folder(
                        pool, name=name, parent_id=parent_fid,
                        skill_id=skill_id, created_by=auth.user_id,
                        workspace_id=workspace_id,
                    )
                    folder_map[dir_path] = folder["id"]
                else:
                    # File
                    parts = relative.split("/")
                    name = parts[-1]
                    if not name:
                        continue
                    if _is_binary(name):
                        continue
                    parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
                    parent_fid = folder_map.get(parent_path)

                    try:
                        raw = zf.read(entry)
                        text = raw.decode("utf-8")
                    except (UnicodeDecodeError, Exception):
                        text = "[Binary content - not displayable]"

                    f = await skill_file_repo.create_file(
                        pool, skill_id=skill_id, name=name, content=text,
                        file_type=_detect_file_type(name), folder_id=parent_fid,
                        created_by=auth.user_id, workspace_id=workspace_id,
                    )
                    created_files.append(f)

    except zipfile.BadZipFile as exc:
        raise HTTPException(status_code=400, detail="Downloaded file is not a valid ZIP") from exc

    return {
        "success": True,
        "message": f"Skill '{skill_name}' installed with {len(created_files)} files",
        "data": skill,
        "pagination": None,
    }
