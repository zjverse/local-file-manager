/**
 * i18n.js — 运行时翻译层
 * 不修改原始 HTML/JS 文件，通过 MutationObserver 在 DOM 渲染时动态注入中文翻译。
 * 格式：English (中文)
 */
(function () {
    // ========== 精确匹配翻译表 ==========
    const exactMap = {
        // 页面标题
        "Local File Manager": "Local File Manager (本地资源管理器)",
        // 工具栏 title
        "Back": "Back (后退)",
        "Forward": "Forward (前进)",
        "Up": "Up (上级目录)",
        "New Folder": "New Folder (新建文件夹)",
        "Upload Files": "Upload Files (上传文件)",
        "Show Hidden Files": "Show Hidden Files (显示隐藏文件)",
        "Hide Hidden Files": "Hide Hidden Files (隐藏隐藏文件)",
        "Toggle View": "Toggle View (切换视图)",
        // 搜索框
        "Search files...": "Search files... (搜索文件...)",
        // 右键菜单
        "Open": "Open (打开)",
        "Cut": "Cut (剪切)",
        "Copy": "Copy (复制)",
        "Paste": "Paste (粘贴)",
        "Rename": "Rename (重命名)",
        "Delete": "Delete (删除)",
        "Properties": "Properties (属性)",
        "New File": "New File (新建文件)",
        "Select All": "Select All (全选)",
        "Refresh": "Refresh (刷新)",
        // 状态栏
        "Ready": "Ready (就绪)",
        // 列表表头
        "Name": "Name (名称)",
        "Size": "Size (大小)",
        "Type": "Type (类型)",
        "Modified": "Modified (修改时间)",
        // 文件类型
        "Folder": "Folder (文件夹)",
        "File": "File (文件)",
        // 空状态
        "Empty directory": "Empty directory (空目录)",
        // 预览
        "Loading...": "Loading... (加载中...)",
        "Preview not available for this file type": "Preview not available (该文件类型无法预览)",
        // 属性对话框标签
        "Location": "Location (位置)",
        "Created": "Created (创建时间)",
        // 拖拽上传
        "Drop files here to upload": "Drop files here to upload (拖拽文件到此处上传)",
        // 剪贴板
        "1 item(s) copied to clipboard": "1 item copied (已复制 1 项)",
        "1 item(s) cut to clipboard": "1 item cut (已剪切 1 项)",
    };

    // ========== 正则匹配翻译表（处理动态内容） ==========
    const regexRules = [
        {
            pattern: /^(\d+) folders, (\d+) files$/,
            replace: "$1 个文件夹 (folders), $2 个文件 (files)"
        },
        {
            pattern: /^(\d+) folders, (\d+) files \| (\d+) items selected(?: \((.+)\))?$/,
            replace: "$1 个文件夹, $2 个文件 | 已选中 $3 项 (selected)$4"
        },
        {
            pattern: /^Found (\d+) items for "(.+)"$/,
            replace: '搜索到 $1 项 (Found $1 items): "$2"'
        },
        {
            pattern: /^Error: (.+)$/,
            replace: "Error (错误): $1"
        },
        {
            pattern: /^Search failed: (.+)$/,
            replace: "Search failed (搜索失败): $1"
        },
        {
            pattern: /^Delete failed: (.+)$/,
            replace: "Delete failed (删除失败): $1"
        },
        {
            pattern: /^Rename failed: (.+)$/,
            replace: "Rename failed (重命名失败): $1"
        },
        {
            pattern: /^Failed: (.+)$/,
            replace: "Failed (失败): $1"
        },
        {
            pattern: /^Paste failed: (.+)$/,
            replace: "Paste failed (粘贴失败): $1"
        },
        {
            pattern: /^Upload failed: (.+)$/,
            replace: "Upload failed (上传失败): $1"
        },
        {
            pattern: /^(\d+) item\(s\) copied to clipboard$/,
            replace: "已复制 $1 项 ($1 items copied)"
        },
        {
            pattern: /^(\d+) item\(s\) cut to clipboard$/,
            replace: "已剪切 $1 项 ($1 items cut)"
        },
    ];

    // ========== 翻译函数 ==========
    function translateText(text) {
        const trimmed = text.trim();
        if (!trimmed) return text;

        // 已翻译过则跳过（包含中文括号标记）
        if (trimmed.includes("(") && /[一-鿿]/.test(trimmed)) return text;

        // 精确匹配
        if (exactMap[trimmed] !== undefined) {
            return text.replace(trimmed, exactMap[trimmed]);
        }

        // 正则匹配
        for (const rule of regexRules) {
            if (rule.pattern.test(trimmed)) {
                return text.replace(trimmed, trimmed.replace(rule.pattern, rule.replace));
            }
        }

        return text;
    }

    function translateNode(node) {
        if (node._i18nDone) return;

        if (node.tagName === "INPUT" && node.placeholder) {
            node.placeholder = translateText(node.placeholder);
            node._i18nDone = true;
            return;
        }

        if (node.title) {
            node.title = translateText(node.title);
        }

        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        const textNodes = [];
        let current;
        while ((current = walker.nextNode())) {
            textNodes.push(current);
        }

        for (const tnode of textNodes) {
            const translated = translateText(tnode.textContent);
            if (translated !== tnode.textContent) {
                tnode.textContent = translated;
            }
        }

        node._i18nDone = true;
    }

    // ========== 静态元素：页面加载时翻译一次 ==========
    function translateStaticElements() {
        document.title = translateText(document.title);

        document.querySelectorAll("[title]").forEach(el => {
            el.title = translateText(el.title);
        });

        document.querySelectorAll("input[placeholder]").forEach(el => {
            el.placeholder = translateText(el.placeholder);
        });

        document.querySelectorAll(".ctx-item").forEach(el => {
            el.textContent = translateText(el.textContent);
        });

        const statusEl = document.getElementById("status-info");
        if (statusEl) {
            statusEl.textContent = translateText(statusEl.textContent);
        }

        // Drop zone text
        const dropText = document.querySelector(".drop-zone-text");
        if (dropText) {
            dropText.textContent = translateText(dropText.textContent);
        }
    }

    // ========== 动态内容：MutationObserver 监听变化 ==========
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    translateNode(node);
                }
            }
            if (mutation.type === "characterData") {
                const parent = mutation.target.parentElement;
                if (parent && !parent._i18nDone) {
                    const translated = translateText(mutation.target.textContent);
                    if (translated !== mutation.target.textContent) {
                        mutation.target.textContent = translated;
                    }
                }
            }
        }
    });

    function startObserving() {
        const targets = [
            document.getElementById("file-list"),
            document.getElementById("status-info"),
            document.getElementById("preview-body"),
            document.getElementById("properties-body"),
            document.getElementById("context-menu"),
        ].filter(Boolean);

        for (const target of targets) {
            observer.observe(target, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        }
    }

    // ========== 初始化 ==========
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
            translateStaticElements();
            startObserving();
        });
    } else {
        translateStaticElements();
        startObserving();
    }
})();
