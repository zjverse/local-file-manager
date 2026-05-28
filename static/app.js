// State
let currentPath = null;
let currentItems = [];
let history = [];
let historyIndex = -1;
let viewMode = "list"; // list | grid
let showHidden = false;
let contextTarget = null;
let searchTimer = null;

// DOM
const filelist = document.getElementById("file-list");
const breadcrumb = document.getElementById("breadcrumb");
const statusInfo = document.getElementById("status-info");
const searchInput = document.getElementById("search-input");
const previewModal = document.getElementById("preview-modal");
const previewTitle = document.getElementById("preview-title");
const previewBody = document.getElementById("preview-body");
const contextMenu = document.getElementById("context-menu");
const btnBack = document.getElementById("btn-back");
const btnForward = document.getElementById("btn-forward");
const btnUp = document.getElementById("btn-up");

// File type icons
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

// Navigation
async function navigateTo(path, pushHistory = true) {
    try {
        const res = await fetch(`/api/list?path=${encodeURIComponent(path)}&show_hidden=${showHidden}`);
        if (!res.ok) throw new Error("Failed to load directory");
        const data = await res.json();

        currentPath = data.path;
        currentItems = data.items;

        if (pushHistory) {
            history = history.slice(0, historyIndex + 1);
            history.push(currentPath);
            historyIndex = history.length - 1;
        }

        renderBreadcrumb(data.path);
        renderFileList(data.items);
        updateNavButtons(data.parent);
        updateStatus(data.items);
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

function updateNavButtons(parent) {
    btnBack.disabled = historyIndex <= 0;
    btnForward.disabled = historyIndex >= history.length - 1;
    btnUp.disabled = !parent || parent === currentPath;
}

// Render
function renderBreadcrumb(path) {
    breadcrumb.innerHTML = "";
    const parts = path.split("/").filter(Boolean);
    let accumulated = "";

    // Root
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

    // Scroll to end
    breadcrumb.scrollLeft = breadcrumb.scrollWidth;
}

function renderFileList(items) {
    filelist.innerHTML = "";

    if (items.length === 0) {
        filelist.innerHTML = `<div class="empty-state"><div class="icon">\u{1F4C2}</div><div>Empty directory</div></div>`;
        return;
    }

    // Header for list view
    if (viewMode === "list") {
        const header = document.createElement("div");
        header.className = "list-header";
        header.innerHTML = `<span></span><span>Name</span><span style="text-align:right">Size</span><span style="text-align:right">Type</span><span style="text-align:right">Modified</span>`;
        filelist.appendChild(header);
    }

    items.forEach(item => {
        const el = document.createElement("div");
        el.className = "file-item";
        el.dataset.path = item.path;
        el.dataset.isDir = item.is_dir;

        el.innerHTML = `
            <span class="file-icon">${getIcon(item)}</span>
            <span class="file-name ${item.is_dir ? "dir" : ""}">${escapeHtml(item.name)}</span>
            <span class="file-size">${item.is_dir ? "-" : formatSize(item.size)}</span>
            <span class="file-type">${item.is_dir ? "Folder" : (item.suffix || "-")}</span>
            <span class="file-date">${formatDate(item.modified)}</span>
        `;

        // Double click to open
        el.ondblclick = () => openItem(item);

        // Single click to select
        el.onclick = (e) => {
            document.querySelectorAll(".file-item.selected").forEach(s => s.classList.remove("selected"));
            el.classList.add("selected");
        };

        // Context menu
        el.oncontextmenu = (e) => {
            e.preventDefault();
            contextTarget = item;
            showContextMenu(e.clientX, e.clientY);
        };

        filelist.appendChild(el);
    });
}

function updateStatus(items) {
    const dirs = items.filter(i => i.is_dir).length;
    const files = items.length - dirs;
    statusInfo.textContent = `${dirs} folders, ${files} files`;
}

// Actions
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

function closePreview() {
    previewModal.style.display = "none";
}

// Context Menu
function showContextMenu(x, y) {
    contextMenu.style.display = "block";
    contextMenu.style.left = Math.min(x, window.innerWidth - 160) + "px";
    contextMenu.style.top = Math.min(y, window.innerHeight - 120) + "px";
}

function hideContextMenu() {
    contextMenu.style.display = "none";
    contextTarget = null;
}

async function handleContextAction(action) {
    if (!contextTarget) return;
    const item = contextTarget;
    hideContextMenu();

    if (action === "open") {
        openItem(item);
    } else if (action === "rename") {
        startRename(item);
    } else if (action === "delete") {
        if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
            try {
                const res = await fetch(`/api/delete?path=${encodeURIComponent(item.path)}`, { method: "POST" });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || "Delete failed");
                }
                navigateTo(currentPath, false);
            } catch (err) {
                alert("Delete failed: " + err.message);
            }
        }
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
    input.select();

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

// New Folder
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

// Search
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

// View Toggle
function toggleView() {
    viewMode = viewMode === "list" ? "grid" : "list";
    filelist.className = `file-list ${viewMode}-view`;
    document.getElementById("icon-list").style.display = viewMode === "list" ? "block" : "none";
    document.getElementById("icon-grid").style.display = viewMode === "grid" ? "block" : "none";
    renderFileList(currentItems);
}

// Show Hidden Toggle
function toggleShowHidden() {
    showHidden = !showHidden;
    const btn = document.getElementById("btn-show-hidden");
    btn.classList.toggle("active", showHidden);
    btn.title = showHidden ? "Hide Hidden Files" : "Show Hidden Files";
    navigateTo(currentPath, false);
}

// Helpers
function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

// Event Listeners
btnBack.onclick = goBack;
btnForward.onclick = goForward;
btnUp.onclick = goUp;
document.getElementById("btn-new-folder").onclick = createNewFolder;
document.getElementById("btn-view-toggle").onclick = toggleView;
document.getElementById("btn-show-hidden").onclick = toggleShowHidden;

searchInput.oninput = (e) => handleSearch(e.target.value);

// Close context menu on click elsewhere
document.addEventListener("click", (e) => {
    if (!contextMenu.contains(e.target)) hideContextMenu();
});

// Context menu actions
contextMenu.querySelectorAll(".ctx-item").forEach(el => {
    el.onclick = () => handleContextAction(el.dataset.action);
});

// Modal close
document.querySelector(".modal-close").onclick = closePreview;
document.querySelector(".modal-backdrop").onclick = closePreview;

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;

    if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) {
        e.preventDefault();
        goBack();
    }
    if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
    }
    if (e.key === "ArrowUp" && e.altKey) {
        e.preventDefault();
        goUp();
    }
    if (e.key === "Escape") {
        closePreview();
        hideContextMenu();
    }
});

// Init
navigateTo("");
