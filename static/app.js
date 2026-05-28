// ==================== State ====================
let currentPath = null;
let currentItems = [];
let history = [];
let historyIndex = -1;
let viewMode = "list";
let showHidden = false;
let contextTarget = null;
let contextType = null; // "file" | "folder" | "empty"
let searchTimer = null;
let lastClickedIndex = -1; // for Shift+Click range select

// Multi-select
const selectedPaths = new Set();

// Clipboard
let clipboard = null; // { paths: [], mode: "copy" | "cut" }

// Sort
let sortState = { key: "name", dir: "asc" }; // key: name|size|type|modified

// Address bar edit mode
let addressBarEditMode = false;

// ==================== DOM ====================
const filelist = document.getElementById("file-list");
const breadcrumb = document.getElementById("breadcrumb");
const statusInfo = document.getElementById("status-info");
const searchInput = document.getElementById("search-input");
const previewModal = document.getElementById("preview-modal");
const previewTitle = document.getElementById("preview-title");
const previewBody = document.getElementById("preview-body");
const propertiesModal = document.getElementById("properties-modal");
const propertiesBody = document.getElementById("properties-body");
const contextMenu = document.getElementById("context-menu");
const btnBack = document.getElementById("btn-back");
const btnForward = document.getElementById("btn-forward");
const btnUp = document.getElementById("btn-up");
const dropZone = document.getElementById("drop-zone");
const fileUploadInput = document.getElementById("file-upload-input");

// ==================== Icons ====================
const icons = {
    dir: "\u{1F4C1}",
    image: "\u{1F5BC}",
    video: "\u{1F3AC}",
    audio: "\u{1F3B5}",
    pdf: "\u{1F4C4}",
    text: "\u{1F4DD}",
    code: "\u{1F4BB}",
    archive: "\u{1F4E6}",
    file: "\u{1F4C3}",
};

const codeExts = new Set([".py", ".js", ".ts", ".html", ".css", ".json", ".yaml", ".yml",
    ".md", ".sh", ".bash", ".zsh", ".java", ".go", ".rs", ".c", ".cpp", ".h",
    ".rb", ".php", ".swift", ".kt", ".toml", ".xml", ".sql", ".conf"]);

function getIcon(item) {
    if (item.is_dir) return icons.dir;
    const mime = item.mime || "";
    if (mime.startsWith("image/")) return icons.image;
    if (mime.startsWith("video/")) return icons.video;
    if (mime.startsWith("audio/")) return icons.audio;
    if (mime === "application/pdf") return icons.pdf;
    if (codeExts.has(item.suffix)) return icons.code;
    if (mime.startsWith("text/")) return icons.text;
    if ([".zip", ".tar", ".gz", ".bz2", ".7z", ".rar"].includes(item.suffix)) return icons.archive;
    return icons.file;
}

// ==================== Helpers ====================
function formatSize(bytes) {
    if (bytes === 0) return "-";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return val < 10 ? val.toFixed(1) + " " + units[i] : Math.round(val) + " " + units[i];
}

function formatDate(timestamp) {
    const d = new Date(timestamp * 1000);
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// ==================== Navigation ====================
async function navigateTo(path, pushHistory = true) {
    try {
        const res = await fetch(`/api/list?path=${encodeURIComponent(path)}&show_hidden=${showHidden}`);
        if (!res.ok) throw new Error("Failed to load directory");
        const data = await res.json();

        currentPath = data.path;
        currentItems = data.items;
        selectedPaths.clear();
        lastClickedIndex = -1;

        if (pushHistory) {
            history = history.slice(0, historyIndex + 1);
            history.push(currentPath);
            historyIndex = history.length - 1;
        }

        renderBreadcrumb(data.path);
        renderFileList(currentItems);
        updateNavButtons(data.parent);
        updateStatus();
        searchInput.value = "";
    } catch (err) {
        statusInfo.textContent = "Error: " + err.message;
    }
}

function goBack() {
    if (historyIndex > 0) {
        historyIndex--;
        navigateTo(history[historyIndex], false);
    }
}

function goForward() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        navigateTo(history[historyIndex], false);
    }
}

function goUp() {
    if (currentPath) {
        const parent = currentPath.substring(0, currentPath.lastIndexOf("/")) || "/";
        navigateTo(parent);
    }
}

function refreshDir() {
    navigateTo(currentPath, false);
}

function updateNavButtons(parent) {
    btnBack.disabled = historyIndex <= 0;
    btnForward.disabled = historyIndex >= history.length - 1;
    btnUp.disabled = !parent || parent === currentPath;
}

// ==================== Breadcrumb / Address Bar ====================
function renderBreadcrumb(path) {
    if (addressBarEditMode) return;
    breadcrumb.innerHTML = "";
    const parts = path.split("/").filter(Boolean);
    let accumulated = "";

    const rootCrumb = document.createElement("span");
    rootCrumb.className = "crumb";
    rootCrumb.textContent = "/";
    rootCrumb.onclick = () => navigateTo("/");
    breadcrumb.appendChild(rootCrumb);

    parts.forEach((part, i) => {
        accumulated += "/" + part;
        const sep = document.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "/";
        breadcrumb.appendChild(sep);

        const crumb = document.createElement("span");
        crumb.className = "crumb" + (i === parts.length - 1 ? " current" : "");
        crumb.textContent = part;
        if (i < parts.length - 1) {
            const target = accumulated;
            crumb.onclick = () => navigateTo(target);
        }
        breadcrumb.appendChild(crumb);
    });

    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
}

function enterAddressBarEditMode() {
    addressBarEditMode = true;
    breadcrumb.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "address-bar-input";
    input.value = currentPath || "/";
    breadcrumb.appendChild(input);
    breadcrumb.classList.add("edit-mode");
    input.focus();
    input.select();

    input.onkeydown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const newPath = input.value.trim();
            exitAddressBarEditMode();
            if (newPath) navigateTo(newPath);
        }
        if (e.key === "Escape") {
            exitAddressBarEditMode();
            renderBreadcrumb(currentPath);
        }
    };
    input.onblur = () => {
        exitAddressBarEditMode();
        renderBreadcrumb(currentPath);
    };
}

function exitAddressBarEditMode() {
    addressBarEditMode = false;
    breadcrumb.classList.remove("edit-mode");
}

// ==================== Sorting ====================
function sortItems(items) {
    const sorted = [...items];
    const { key, dir } = sortState;
    const mul = dir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
        // Directories always first
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;

        let cmp = 0;
        switch (key) {
            case "name":
                cmp = a.name.localeCompare(b.name, undefined, { numeric: true });
                break;
            case "size":
                cmp = a.size - b.size;
                break;
            case "type":
                cmp = (a.suffix || "").localeCompare(b.suffix || "");
                break;
            case "modified":
                cmp = a.modified - b.modified;
                break;
        }
        return cmp * mul;
    });

    return sorted;
}

function handleSort(key) {
    if (sortState.key === key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
        sortState.key = key;
        sortState.dir = "asc";
    }
    renderFileList(currentItems);
}

function getSortArrow(key) {
    if (sortState.key !== key) return "";
    return sortState.dir === "asc" ? " ▲" : " ▼";
}

// ==================== Render ====================
function renderFileList(items) {
    filelist.innerHTML = "";

    const sorted = sortItems(items);

    if (sorted.length === 0) {
        filelist.innerHTML = `<div class="empty-state"><div class="icon">\u{1F4C2}</div><div>Empty directory</div></div>`;
        return;
    }

    // Header for list view
    if (viewMode === "list") {
        const header = document.createElement("div");
        header.className = "list-header";
        header.innerHTML = `
            <span></span>
            <span data-sort="name">Name${getSortArrow("name")}</span>
            <span data-sort="size" style="text-align:right">Size${getSortArrow("size")}</span>
            <span data-sort="type" style="text-align:right">Type${getSortArrow("type")}</span>
            <span data-sort="modified" style="text-align:right">Modified${getSortArrow("modified")}</span>
        `;
        header.querySelectorAll("[data-sort]").forEach(el => {
            el.onclick = () => handleSort(el.dataset.sort);
        });
        filelist.appendChild(header);
    }

    sorted.forEach((item, index) => {
        const el = document.createElement("div");
        el.className = "file-item";
        if (selectedPaths.has(item.path)) el.classList.add("selected");
        if (clipboard && clipboard.mode === "cut" && clipboard.paths.includes(item.path)) {
            el.classList.add("clipboard-cut");
        }
        el.dataset.path = item.path;
        el.dataset.isDir = item.is_dir;
        el.dataset.index = index;

        el.innerHTML = `
            <span class="file-icon">${getIcon(item)}</span>
            <span class="file-name ${item.is_dir ? "dir" : ""}">${escapeHtml(item.name)}</span>
            <span class="file-size">${item.is_dir ? "-" : formatSize(item.size)}</span>
            <span class="file-type">${item.is_dir ? "Folder" : (item.suffix || "-")}</span>
            <span class="file-date">${formatDate(item.modified)}</span>
        `;

        el.ondblclick = () => openItem(item);
        el.onclick = (e) => handleItemClick(e, item, index);
        el.oncontextmenu = (e) => {
            e.preventDefault();
            // If right-clicked item is not selected, select only it
            if (!selectedPaths.has(item.path)) {
                selectedPaths.clear();
                selectedPaths.add(item.path);
                updateSelectionUI();
            }
            contextTarget = item;
            contextType = item.is_dir ? "folder" : "file";
            showContextMenu(e.clientX, e.clientY);
        };

        filelist.appendChild(el);
    });
}

// ==================== Selection ====================
function handleItemClick(e, item, index) {
    const metaKey = e.ctrlKey || e.metaKey;

    if (e.shiftKey && lastClickedIndex >= 0) {
        // Shift+Click: range select
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        if (!metaKey) selectedPaths.clear();
        const sortedItems = sortItems(currentItems);
        for (let i = start; i <= end; i++) {
            selectedPaths.add(sortedItems[i].path);
        }
    } else if (metaKey) {
        // Ctrl+Click: toggle
        if (selectedPaths.has(item.path)) {
            selectedPaths.delete(item.path);
        } else {
            selectedPaths.add(item.path);
        }
        lastClickedIndex = index;
    } else {
        // Single click: select only this
        selectedPaths.clear();
        selectedPaths.add(item.path);
        lastClickedIndex = index;
    }

    updateSelectionUI();
}

function selectAll() {
    currentItems.forEach(item => selectedPaths.add(item.path));
    updateSelectionUI();
}

function clearSelection() {
    selectedPaths.clear();
    lastClickedIndex = -1;
    updateSelectionUI();
}

function updateSelectionUI() {
    document.querySelectorAll(".file-item").forEach(el => {
        el.classList.toggle("selected", selectedPaths.has(el.dataset.path));
    });
    updateStatus();
}

function getSelectedItems() {
    return currentItems.filter(item => selectedPaths.has(item.path));
}

// ==================== Status Bar ====================
function updateStatus() {
    const dirs = currentItems.filter(i => i.is_dir).length;
    const files = currentItems.length - dirs;
    let text = `${dirs} folders, ${files} files`;

    if (selectedPaths.size > 0) {
        const selectedItems = getSelectedItems();
        const totalSize = selectedItems.reduce((sum, i) => sum + (i.is_dir ? 0 : i.size), 0);
        text += ` | ${selectedPaths.size} items selected`;
        if (totalSize > 0) text += ` (${formatSize(totalSize)})`;
    }

    statusInfo.textContent = text;
}

// ==================== Open / Preview ====================
function openItem(item) {
    if (item.is_dir) {
        navigateTo(item.path);
    } else {
        previewFile(item);
    }
}

async function previewFile(item) {
    try {
        previewTitle.textContent = item.name;
        previewBody.innerHTML = "<div class='binary-info'>Loading...</div>";
        previewModal.style.display = "flex";

        const res = await fetch(`/api/preview?path=${encodeURIComponent(item.path)}`);
        const data = await res.json();

        if (data.type === "text") {
            previewBody.innerHTML = `<pre>${escapeHtml(data.content)}</pre>`;
        } else if (item.mime && item.mime.startsWith("image/")) {
            previewBody.innerHTML = `<img src="/api/preview?path=${encodeURIComponent(item.path)}" alt="${escapeHtml(item.name)}" />`;
        } else {
            previewBody.innerHTML = `<div class="binary-info">
                <div style="font-size:48px;margin-bottom:16px">${getIcon(item)}</div>
                <div>${item.mime}</div>
                <div>${formatSize(item.size)}</div>
                <div style="margin-top:8px;color:var(--text-dim)">Preview not available for this file type</div>
            </div>`;
        }
    } catch (err) {
        previewBody.innerHTML = `<div class="binary-info">Error: ${err.message}</div>`;
    }
}

// ==================== Properties Dialog ====================
function showProperties(item) {
    const rows = [
        ["Name", item.name],
        ["Type", item.is_dir ? "Folder" : (item.suffix || "File") + " (" + item.mime + ")"],
        ["Location", item.path.substring(0, item.path.lastIndexOf("/"))],
        ["Size", item.is_dir ? "-" : formatSize(item.size) + ` (${item.size} bytes)`],
        ["Created", formatDate(item.created)],
        ["Modified", formatDate(item.modified)],
    ];

    propertiesBody.innerHTML = `
        <div class="properties-table">
            ${rows.map(([label, value]) => `
                <div class="prop-row">
                    <div class="prop-label">${label}</div>
                    <div class="prop-value">${escapeHtml(String(value))}</div>
                </div>
            `).join("")}
        </div>
    `;
    propertiesModal.style.display = "flex";
}

// ==================== Context Menu ====================
function buildContextMenuItems(type) {
    const items = [];

    if (type === "file" || type === "folder") {
        items.push({ label: "Open", action: "open" });
        items.push({ type: "separator" });
        items.push({ label: "Cut", action: "cut" });
        items.push({ label: "Copy", action: "copy" });
        items.push({ type: "separator" });
        items.push({ label: "Rename", action: "rename" });
        items.push({ label: "Delete", action: "delete", danger: true });
        items.push({ type: "separator" });
        items.push({ label: "Properties", action: "properties" });
    } else {
        // Empty space
        items.push({ label: "New Folder", action: "new-folder" });
        items.push({ label: "New File", action: "new-file" });
        items.push({ type: "separator" });
        if (clipboard && clipboard.paths.length > 0) {
            items.push({ label: "Paste", action: "paste" });
            items.push({ type: "separator" });
        }
        items.push({ label: "Select All", action: "select-all" });
        items.push({ label: "Refresh", action: "refresh" });
    }

    return items;
}

function showContextMenu(x, y) {
    const items = buildContextMenuItems(contextType);
    contextMenu.innerHTML = "";

    items.forEach(item => {
        if (item.type === "separator") {
            const sep = document.createElement("div");
            sep.className = "ctx-separator";
            contextMenu.appendChild(sep);
        } else {
            const el = document.createElement("div");
            el.className = "ctx-item" + (item.danger ? " ctx-danger" : "");
            el.dataset.action = item.action;
            el.textContent = item.label;
            el.onclick = () => {
                // CRITICAL: save target BEFORE hideContextMenu clears it
                const target = contextTarget;
                const type = contextType;
                hideContextMenu();
                handleContextAction(item.action, target, type);
            };
            contextMenu.appendChild(el);
        }
    });

    contextMenu.style.display = "block";
    contextMenu.style.left = Math.min(x, window.innerWidth - 180) + "px";
    contextMenu.style.top = Math.min(y, window.innerHeight - contextMenu.offsetHeight - 10) + "px";
}

function hideContextMenu() {
    contextMenu.style.display = "none";
    contextTarget = null;
    contextType = null;
}

async function handleContextAction(action, target) {
    switch (action) {
        case "open":
            if (target) openItem(target);
            break;
        case "cut":
            cutItems();
            break;
        case "copy":
            copyItems();
            break;
        case "paste":
            await pasteItems();
            break;
        case "rename":
            if (target) startRename(target);
            break;
        case "delete":
            await deleteSelected();
            break;
        case "properties":
            if (target) showProperties(target);
            break;
        case "new-folder":
            await createNewFolder();
            break;
        case "new-file":
            await createNewFile();
            break;
        case "select-all":
            selectAll();
            break;
        case "refresh":
            refreshDir();
            break;
    }
}

// ==================== File Operations ====================
async function createNewFolder() {
    const name = prompt("New folder name:");
    if (!name || !name.trim()) return;

    try {
        const res = await fetch(`/api/mkdir?path=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(name.trim())}`, { method: "POST" });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to create folder");
        }
        navigateTo(currentPath, false);
    } catch (err) {
        alert("Failed: " + err.message);
    }
}

async function createNewFile() {
    const name = prompt("New file name:");
    if (!name || !name.trim()) return;

    try {
        const res = await fetch(`/api/mkfile?path=${encodeURIComponent(currentPath)}&name=${encodeURIComponent(name.trim())}`, { method: "POST" });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to create file");
        }
        navigateTo(currentPath, false);
    } catch (err) {
        alert("Failed: " + err.message);
    }
}

function startRename(item) {
    const el = document.querySelector(`.file-item[data-path="${CSS.escape(item.path)}"] .file-name`);
    if (!el) return;

    const oldName = item.name;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "rename-input";
    input.value = oldName;
    el.textContent = "";
    el.appendChild(input);
    input.focus();
    // Select filename without extension
    const dotIndex = oldName.lastIndexOf(".");
    if (dotIndex > 0 && !item.is_dir) {
        input.setSelectionRange(0, dotIndex);
    } else {
        input.select();
    }

    const finish = async () => {
        const newName = input.value.trim();
        if (!newName || newName === oldName) {
            navigateTo(currentPath, false);
            return;
        }
        try {
            const res = await fetch(`/api/rename?path=${encodeURIComponent(item.path)}&name=${encodeURIComponent(newName)}`, { method: "POST" });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Rename failed");
            }
            navigateTo(currentPath, false);
        } catch (err) {
            alert("Rename failed: " + err.message);
            navigateTo(currentPath, false);
        }
    };

    input.onblur = finish;
    input.onkeydown = (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") { input.value = oldName; input.blur(); }
    };
}

async function deleteSelected() {
    const items = getSelectedItems();
    if (items.length === 0) return;

    const msg = items.length === 1
        ? `Delete "${items[0].name}"? This cannot be undone.`
        : `Delete ${items.length} items? This cannot be undone.`;

    if (!confirm(msg)) return;

    try {
        const paths = items.map(i => i.path);
        const params = paths.map(p => `paths=${encodeURIComponent(p)}`).join("&");
        const res = await fetch(`/api/batch-delete?${params}`, { method: "POST" });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Delete failed");
        }
        const data = await res.json();
        if (data.errors && data.errors.length > 0) {
            alert("Some items could not be deleted:\n" + data.errors.map(e => e.error).join("\n"));
        }
        navigateTo(currentPath, false);
    } catch (err) {
        alert("Delete failed: " + err.message);
    }
}

// ==================== Clipboard ====================
function copyItems() {
    const items = getSelectedItems();
    if (items.length === 0) return;
    clipboard = { paths: items.map(i => i.path), mode: "copy" };
    statusInfo.textContent = `${items.length} item(s) copied to clipboard`;
}

function cutItems() {
    const items = getSelectedItems();
    if (items.length === 0) return;
    clipboard = { paths: items.map(i => i.path), mode: "cut" };
    // Visual feedback
    items.forEach(item => {
        const el = document.querySelector(`.file-item[data-path="${CSS.escape(item.path)}"]`);
        if (el) el.classList.add("clipboard-cut");
    });
    statusInfo.textContent = `${items.length} item(s) cut to clipboard`;
}

async function pasteItems() {
    if (!clipboard || clipboard.paths.length === 0) return;

    try {
        const params = clipboard.paths.map(p => `sources=${encodeURIComponent(p)}`).join("&");
        const res = await fetch(`/api/paste?${params}&destination=${encodeURIComponent(currentPath)}&mode=${clipboard.mode}`, { method: "POST" });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Paste failed");
        }
        // Clear clipboard after move
        if (clipboard.mode === "cut") {
            clipboard = null;
        }
        navigateTo(currentPath, false);
    } catch (err) {
        alert("Paste failed: " + err.message);
    }
}

// ==================== Search ====================
function handleSearch(query) {
    clearTimeout(searchTimer);
    if (!query.trim()) {
        navigateTo(currentPath, false);
        return;
    }
    searchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/search?path=${encodeURIComponent(currentPath)}&q=${encodeURIComponent(query)}&show_hidden=${showHidden}`);
            const data = await res.json();
            renderFileList(data.results);
            statusInfo.textContent = `Found ${data.results.length} items for "${query}"`;
        } catch (err) {
            statusInfo.textContent = "Search failed: " + err.message;
        }
    }, 300);
}

// ==================== View Toggle ====================
function toggleView() {
    viewMode = viewMode === "list" ? "grid" : "list";
    filelist.className = `file-list ${viewMode}-view`;
    document.getElementById("icon-list").style.display = viewMode === "list" ? "block" : "none";
    document.getElementById("icon-grid").style.display = viewMode === "grid" ? "block" : "none";
    renderFileList(currentItems);
}

// ==================== Show Hidden Toggle ====================
function toggleShowHidden() {
    showHidden = !showHidden;
    const btn = document.getElementById("btn-show-hidden");
    btn.classList.toggle("active", showHidden);
    btn.title = showHidden ? "Hide Hidden Files" : "Show Hidden Files";
    navigateTo(currentPath, false);
}

// ==================== Upload ====================
function triggerUpload() {
    fileUploadInput.click();
}

async function handleUpload(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const f of files) {
        formData.append("files", f);
    }

    try {
        const res = await fetch(`/api/upload?path=${encodeURIComponent(currentPath)}`, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Upload failed");
        }
        navigateTo(currentPath, false);
    } catch (err) {
        alert("Upload failed: " + err.message);
    }
}

// ==================== Drag & Drop ====================
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer.types.includes("Files")) {
        dropZone.style.display = "flex";
    }
});

document.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        dropZone.style.display = "none";
    }
});

document.addEventListener("dragover", (e) => {
    e.preventDefault();
});

document.addEventListener("drop", (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.style.display = "none";
    if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files);
    }
});

// ==================== Event Listeners ====================
btnBack.onclick = goBack;
btnForward.onclick = goForward;
btnUp.onclick = goUp;
document.getElementById("btn-new-folder").onclick = createNewFolder;
document.getElementById("btn-view-toggle").onclick = toggleView;
document.getElementById("btn-show-hidden").onclick = toggleShowHidden;
document.getElementById("btn-upload").onclick = triggerUpload;

searchInput.oninput = (e) => handleSearch(e.target.value);

fileUploadInput.onchange = (e) => {
    handleUpload(e.target.files);
    e.target.value = ""; // reset
};

// Click empty area to deselect
filelist.addEventListener("click", (e) => {
    if (e.target === filelist || e.target.classList.contains("empty-state")) {
        clearSelection();
    }
});

// Right-click on empty area
filelist.addEventListener("contextmenu", (e) => {
    // Only if clicked on empty area, not on a file-item
    if (!e.target.closest(".file-item")) {
        e.preventDefault();
        contextTarget = null;
        contextType = "empty";
        showContextMenu(e.clientX, e.clientY);
    }
});

// Click elsewhere to close context menu
document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target)) hideContextMenu();
});

// Breadcrumb click to enter edit mode
breadcrumb.addEventListener("dblclick", (e) => {
    if (!addressBarEditMode) enterAddressBarEditMode();
});

// Modal close buttons
document.querySelectorAll(".modal-close").forEach(btn => {
    btn.onclick = () => {
        const modalId = btn.dataset.close;
        if (modalId) document.getElementById(modalId).style.display = "none";
    };
});
document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.onclick = () => {
        backdrop.parentElement.style.display = "none";
    };
});

// ==================== Keyboard Shortcuts ====================
document.addEventListener("keydown", (e) => {
    // Skip if typing in input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    const metaKey = e.ctrlKey || e.metaKey;

    // Ctrl+A: Select all
    if (metaKey && e.key === "a") {
        e.preventDefault();
        selectAll();
        return;
    }

    // Ctrl+C: Copy
    if (metaKey && e.key === "c") {
        e.preventDefault();
        copyItems();
        return;
    }

    // Ctrl+X: Cut
    if (metaKey && e.key === "x") {
        e.preventDefault();
        cutItems();
        return;
    }

    // Ctrl+V: Paste
    if (metaKey && e.key === "v") {
        e.preventDefault();
        pasteItems();
        return;
    }

    // Ctrl+Shift+N: New folder
    if (metaKey && e.shiftKey && e.key === "N") {
        e.preventDefault();
        createNewFolder();
        return;
    }

    // Delete: Delete selected
    if (e.key === "Delete") {
        e.preventDefault();
        deleteSelected();
        return;
    }

    // F2: Rename
    if (e.key === "F2") {
        e.preventDefault();
        const items = getSelectedItems();
        if (items.length === 1) startRename(items[0]);
        return;
    }

    // F5: Refresh
    if (e.key === "F5") {
        e.preventDefault();
        refreshDir();
        return;
    }

    // Alt+D: Focus address bar
    if (e.altKey && e.key === "d") {
        e.preventDefault();
        enterAddressBarEditMode();
        return;
    }

    // Alt+Left / Backspace: Back
    if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) {
        e.preventDefault();
        goBack();
        return;
    }

    // Alt+Right: Forward
    if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
        return;
    }

    // Alt+Up: Parent directory
    if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        goUp();
        return;
    }

    // Escape: Close / deselect
    if (e.key === "Escape") {
        previewModal.style.display = "none";
        propertiesModal.style.display = "none";
        hideContextMenu();
        clearSelection();
        return;
    }
});

// ==================== Init ====================
navigateTo("");
