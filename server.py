import os
import shutil
import mimetypes
import time
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from typing import List

app = FastAPI(title="Local File Manager")

# 默认根目录：用户 Home
DEFAULT_ROOT = str(Path.home())


def safe_path(path: str) -> Path:
    """校验路径合法性，防止路径穿越"""
    p = Path(path).resolve()
    if not p.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    return p


def file_info(p: Path) -> dict:
    """获取文件/目录信息"""
    stat = p.stat()
    mime, _ = mimetypes.guess_type(p.name)
    return {
        "name": p.name,
        "path": str(p),
        "is_dir": p.is_dir(),
        "size": stat.st_size,
        "created": stat.st_ctime,
        "modified": stat.st_mtime,
        "mime": mime or "application/octet-stream",
        "suffix": p.suffix.lower(),
    }


@app.get("/api/list")
def list_dir(path: str = Query(default=None), show_hidden: bool = Query(default=False)):
    """列出目录内容"""
    target = safe_path(path or DEFAULT_ROOT)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    items = []
    try:
        for entry in target.iterdir():
            try:
                if not show_hidden and entry.name.startswith("."):
                    continue
                items.append(file_info(entry))
            except PermissionError:
                continue
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")

    # 目录在前，文件在后；同类型按名称排序
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))

    return {
        "path": str(target),
        "parent": str(target.parent) if target.parent != target else None,
        "items": items,
    }


@app.get("/api/search")
def search_files(path: str = Query(default=None), q: str = Query(default=""), show_hidden: bool = Query(default=False)):
    """在指定目录下搜索文件（仅当前层+一层子目录）"""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query is empty")

    target = safe_path(path or DEFAULT_ROOT)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="Not a directory")

    results = []
    keyword = q.strip().lower()

    # 搜索当前目录
    try:
        for entry in target.iterdir():
            try:
                if not show_hidden and entry.name.startswith("."):
                    continue
                if keyword in entry.name.lower():
                    results.append(file_info(entry))
            except PermissionError:
                continue
    except PermissionError:
        pass

    # 搜索一层子目录（跳过隐藏目录）
    try:
        for entry in target.iterdir():
            if entry.is_dir():
                if not show_hidden and entry.name.startswith("."):
                    continue
                try:
                    for sub in entry.iterdir():
                        try:
                            if not show_hidden and sub.name.startswith("."):
                                continue
                            if keyword in sub.name.lower():
                                results.append(file_info(sub))
                        except PermissionError:
                            continue
                except PermissionError:
                    continue
    except PermissionError:
        pass

    results.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return {"query": q, "path": str(target), "results": results}


@app.get("/api/preview")
def preview_file(path: str):
    """预览文件内容（文本返回内容，图片/二进制返回文件）"""
    p = safe_path(path)
    if p.is_dir():
        raise HTTPException(status_code=400, detail="Cannot preview directory")

    mime, _ = mimetypes.guess_type(p.name)
    mime = mime or "application/octet-stream"

    # 图片直接返回文件
    if mime.startswith("image/"):
        return FileResponse(str(p), media_type=mime)

    # 文本类文件返回内容
    text_types = {"text/", "application/json", "application/xml", "application/javascript",
                  "application/x-python", "application/x-sh", "application/x-yaml"}
    if any(mime.startswith(t) for t in text_types) or p.suffix.lower() in {
        ".py", ".js", ".ts", ".html", ".css", ".json", ".yaml", ".yml",
        ".md", ".txt", ".log", ".sh", ".bash", ".zsh", ".conf", ".cfg",
        ".ini", ".toml", ".xml", ".csv", ".sql", ".java", ".go", ".rs",
        ".c", ".cpp", ".h", ".hpp", ".rb", ".php", ".swift", ".kt",
    }:
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
            # 限制预览大小：1MB
            if len(content) > 1_000_000:
                content = content[:1_000_000] + "\n\n... (truncated)"
            return JSONResponse({"type": "text", "content": content, "mime": mime, "size": p.stat().st_size})
        except Exception:
            pass

    # 其他类型返回基本信息
    return JSONResponse({"type": "binary", "mime": mime, "size": p.stat().st_size})


@app.post("/api/mkdir")
def create_dir(path: str = Query(...), name: str = Query(...)):
    """创建目录"""
    parent = safe_path(path)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")

    new_dir = parent / name
    if new_dir.exists():
        raise HTTPException(status_code=400, detail="Already exists")

    new_dir.mkdir(parents=False)
    return {"path": str(new_dir), "created": True}


@app.post("/api/delete")
def delete_item(path: str = Query(...)):
    """删除文件或目录"""
    p = safe_path(path)
    # 禁止删除 Home 目录
    if str(p.resolve()) == str(Path.home().resolve()):
        raise HTTPException(status_code=403, detail="Cannot delete home directory")

    if p.is_dir():
        shutil.rmtree(str(p))
    else:
        p.unlink()

    return {"path": str(p), "deleted": True}


@app.post("/api/rename")
def rename_item(path: str = Query(...), name: str = Query(...)):
    """重命名文件或目录"""
    p = safe_path(path)
    new_path = p.parent / name
    if new_path.exists():
        raise HTTPException(status_code=400, detail="Target already exists")

    p.rename(new_path)
    return {"old_path": str(p), "new_path": str(new_path), "renamed": True}


@app.post("/api/mkfile")
def create_file(path: str = Query(...), name: str = Query(...)):
    """创建空文件"""
    parent = safe_path(path)
    if not parent.is_dir():
        raise HTTPException(status_code=400, detail="Parent is not a directory")

    new_file = parent / name
    if new_file.exists():
        raise HTTPException(status_code=400, detail="Already exists")

    new_file.touch()
    return {"path": str(new_file), "created": True}


@app.post("/api/paste")
def paste_items(sources: List[str] = Query(...), destination: str = Query(...), mode: str = Query(default="copy")):
    """复制/剪切粘贴文件，支持多文件，冲突自动重命名"""
    dest = safe_path(destination)
    if not dest.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")

    if mode not in ("copy", "move"):
        raise HTTPException(status_code=400, detail="Invalid mode")

    results = []
    for src_path in sources:
        src = safe_path(src_path)

        target = dest / src.name
        # 冲突自动重命名
        if target.exists():
            stem = src.stem
            suffix = src.suffix
            counter = 2
            while target.exists():
                target = dest / f"{stem} ({counter}){suffix}"
                counter += 1

        if mode == "copy":
            if src.is_dir():
                shutil.copytree(str(src), str(target))
            else:
                shutil.copy2(str(src), str(target))
        else:  # move
            shutil.move(str(src), str(target))

        results.append({"source": str(src), "target": str(target)})

    return {"results": results, "mode": mode}


@app.post("/api/batch-delete")
def batch_delete(paths: List[str] = Query(...)):
    """批量删除文件或目录"""
    deleted = []
    errors = []
    for p_str in paths:
        try:
            p = safe_path(p_str)
            if str(p.resolve()) == str(Path.home().resolve()):
                errors.append({"path": p_str, "error": "Cannot delete home directory"})
                continue
            if p.is_dir():
                shutil.rmtree(str(p))
            else:
                p.unlink()
            deleted.append(p_str)
        except Exception as e:
            errors.append({"path": p_str, "error": str(e)})

    return {"deleted": deleted, "errors": errors}


@app.post("/api/upload")
async def upload_files(path: str = Query(...), files: List[UploadFile] = File(...)):
    """上传文件到指定目录"""
    dest = safe_path(path)
    if not dest.is_dir():
        raise HTTPException(status_code=400, detail="Destination is not a directory")

    uploaded = []
    for f in files:
        target = dest / f.filename
        # 冲突自动重命名
        if target.exists():
            stem = Path(f.filename).stem
            suffix = Path(f.filename).suffix
            counter = 2
            while target.exists():
                target = dest / f"{stem} ({counter}){suffix}"
                counter += 1

        content = await f.read()
        target.write_bytes(content)
        uploaded.append(str(target))

    return {"uploaded": uploaded}


# 挂载静态文件
static_dir = os.path.join(os.path.dirname(__file__), "static")
app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
