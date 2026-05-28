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
        "Show Hidden Files": "Show Hidden Files (显示隐藏文件)",
        "Hide Hidden Files": "Hide Hidden Files (隐藏隐藏文件)",
        "Toggle View": "Toggle View (切换视图)",
        // 搜索框
        "Search files...": "Search files... (搜索文件...)",
        // 右键菜单
        "Open": "Open (打开)",
        "Rename": "Rename (重命名)",
        "Delete": "Delete (删除)",
        // 状态栏
        "Ready": "Ready (就绪)",
        // 列表表头
        "Name": "Name (名称)",
        "Size": "Size (大小)",
        "Type": "Type (类型)",
        "Modified": "Modified (修改时间)",
        // 文件类型
        "Folder": "Folder (文件夹)",
        // 空状态
        "Empty directory": "Empty directory (空目录)",
        // 预览
        "Loading...": "Loading... (加载中...)",
        "Preview not available for this file type": "Preview not available (该文件类型无法预览)",
    };

    // ========== 正则匹配翻译表（处理动态内容） ==========
    const regexRules = [
        {
            pattern: /^(\d+) folders, (\d+) files$/,
            replace: "$1 个文件夹 (folders), $2 个文件 (files)"
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

        // 处理 input placeholder
        if (node.tagName === "INPUT" && node.placeholder) {
            node.placeholder = translateText(node.placeholder);
            node._i18nDone = true;
            return;
        }

        // 处理 title 属性
        if (node.title) {
            node.title = translateText(node.title);
        }

        // 递归处理文本节点
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
        // 页面标题
        document.title = translateText(document.title);

        // 所有带 title 属性的元素
        document.querySelectorAll("[title]").forEach(el => {
            el.title = translateText(el.title);
        });

        // input placeholder
        document.querySelectorAll("input[placeholder]").forEach(el => {
            el.placeholder = translateText(el.placeholder);
        });

        // 右键菜单项
        document.querySelectorAll(".ctx-item").forEach(el => {
            el.textContent = translateText(el.textContent);
        });

        // 状态栏初始文本
        const statusEl = document.getElementById("status-info");
        if (statusEl) {
            statusEl.textContent = translateText(statusEl.textContent);
        }
    }

    // ========== 动态内容：MutationObserver 监听变化 ==========
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // 新增节点
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    translateNode(node);
                }
            }
            // 文本内容变化（target 本身）
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

    // 监听关键容器
    function startObserving() {
        const targets = [
            document.getElementById("file-list"),
            document.getElementById("status-info"),
            document.getElementById("preview-body"),
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
