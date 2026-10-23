/*
 * ChatGPT GPT-6 DIL 回复修复 - Chromium Manifest V3
 * 由已验证的 Tampermonkey v1.1.4 迁移。
 *
 * 迁移点：MAIN world 直接访问页面 window，无需 unsafeWindow / Tampermonkey。
 * 行为：监听历史 GET 响应，组装 fallbackMarkdown，恢复失败的 DIL 回复。
 * 不修改原始响应，不发送网络请求，不读取 POST / SSE 正在生成的内容。
 */
(() => {
    'use strict';

    const DEBUG = false;
    const TAG = '[GPT6-Fix]';
    const ROOT_SELECTOR = '[class*="MarkdownRoot-"]';
    const DIL_SELECTOR = '[class*="DilRenderer-"], [class*="DilResponseRoot-"]';
    const FAIL_SELECTOR = 'div[role="status"][data-dil-render-failed]';
    const RECOVERY_ATTR = 'data-gpt6-fast-recovery';
    const HIDDEN_DIL_ATTR = 'data-gpt6-hidden-dil';

    // 此脚本在 manifest 中指定为 world: MAIN，window 就是原页面的 window。
    const page = window;
    let currentConversationId = getConversationId(location.href);
    let navigationStartedAt = performance.now();
    let baselineRoots = new WeakSet();
    let records = [];
    let nextOrder = 1;
    let groups = [];

    function log(...args) { if (DEBUG) console.log(TAG, ...args); }
    function cleanText(value) { return typeof value === 'string' ? value.trim() : ''; }
    function getConversationId(url) {
        return String(url || '').match(/\/c\/([^/?#]+)/)?.[1] || null;
    }
    function snapshotRoots() {
        baselineRoots = new WeakSet(document.querySelectorAll(ROOT_SELECTOR));
    }
    function isGPT6Model(model) {
        return typeof model === 'string' &&
            /(^|[^0-9])gpt[-_\s]?6([^0-9]|$)/i.test(model.trim());
    }
    function getModelFromObject(obj, metadata, inherited) {
        const values = [
            obj?.model_slug, obj?.model, obj?.model_name, obj?.default_model_slug,
            metadata?.model_slug, metadata?.model, metadata?.model_name,
            metadata?.default_model_slug, inherited
        ];
        return values.find(value => typeof value === 'string' && value.trim())?.trim() || null;
    }

    function cleanChatGPTInternalMarkup(text) {
        if (typeof text !== 'string') return '';
        return text
            .replace(/\uE200cite\uE202[\s\S]*?\uE201/g, '')
            .replace(/\uE200filecite\uE202[\s\S]*?\uE201/g, '')
            .replace(/\uE200url\uE202([^\uE202]+)\uE202[\s\S]*?\uE201/g, '$1')
            .replace(/\uE200(?:navlist|image_group|video|genui|entity|products?)\uE202[\s\S]*?\uE201/g, '')
            .replace(/\uE200memcite\uE201/g, '')
            .replace(/[^\p{L}\p{N}\s]*cite(?:[^\p{L}\p{N}\s]*turn\d+(?:search|news|fetch|file|reddit|youtube)\d+)+[^\p{L}\p{N}\s]*/giu, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            // v1.1.4 已实测：只移除恢复正文最开头的多个 undefined。
            .replace(/^(?:undefined){2,}/, '')
            .trim();
    }

    // --------------------- 采集 / 分组：维持 v1.1.4 行为 ---------------------
    function addBatchRecord(batch, data) {
        const text = cleanText(data.text);
        if (!text) return;
        const existing = batch.find(item => item.text === text &&
            (!item.create_time || !data.create_time || item.create_time === data.create_time));
        if (existing) {
            existing.model ||= data.model || null;
            existing.status ||= data.status || null;
            existing.end_turn ||= data.end_turn === true;
            existing.is_complete ||= data.is_complete === true;
            existing.create_time ||= Number(data.create_time) || 0;
            return;
        }
        batch.push({
            text,
            model: data.model || null,
            status: data.status || null,
            end_turn: data.end_turn === true,
            is_complete: data.is_complete === true,
            create_time: Number(data.create_time) || 0
        });
    }

    function scanObject(obj, batch, inherited = {}) {
        if (!obj || typeof obj !== 'object') return;
        const metadata = obj.metadata && typeof obj.metadata === 'object' ? obj.metadata : {};
        const current = {
            model: getModelFromObject(obj, metadata, inherited.model),
            status: obj.status || inherited.status || null,
            end_turn: obj.end_turn === true || inherited.end_turn === true,
            is_complete: obj.is_complete === true || metadata.is_complete === true || inherited.is_complete === true,
            create_time: obj.create_time || inherited.create_time || 0
        };
        const values = [
            obj.fallbackMarkdown,
            obj?.model_dil_v2?.fallbackMarkdown,
            metadata?.model_dil_v2?.fallbackMarkdown
        ];
        for (const value of values) {
            const text = cleanText(value);
            if (text) addBatchRecord(batch, { ...current, text });
        }
        if (Array.isArray(obj)) {
            for (const value of obj) scanObject(value, batch, current);
            return;
        }
        for (const [key, value] of Object.entries(obj)) {
            if (key === 'fallbackMarkdown' || key === 'model_dil_v2') continue;
            if (value && typeof value === 'object') scanObject(value, batch, current);
        }
    }

    function parseNetworkText(text) {
        if (typeof text !== 'string' || !text) return;
        const batch = [];
        let parsed = false;
        try {
            scanObject(JSON.parse(text), batch);
            parsed = true;
        } catch (_) { }
        if (!parsed) {
            for (let line of text.split(/\r?\n/)) {
                line = line.trim();
                if (line.startsWith('data:')) line = line.slice(5).trim();
                if (!line || line === '[DONE]' || (line[0] !== '{' && line[0] !== '[')) continue;
                try { scanObject(JSON.parse(line), batch); } catch (_) { }
            }
        }
        if (!batch.length) {
            const regex = /"fallbackMarkdown"\s*:\s*"((?:\\.|[^"\\])*)"/g;
            let match;
            while ((match = regex.exec(text))) {
                try { addBatchRecord(batch, { text: JSON.parse('"' + match[1] + '"') }); }
                catch (_) { }
            }
        }
        if (batch.length) {
            mergeBatch(batch);
            rebuildGroups();
            applyRecovery();
            recoverFailedRoots();
        }
    }

    function mergeBatch(batch) {
        for (const incoming of batch) {
            const existing = incoming.create_time
                ? records.find(item => item.text === incoming.text && item.create_time === incoming.create_time)
                : records.find(item => item.text === incoming.text);
            if (existing) {
                existing.model ||= incoming.model || null;
                existing.status ||= incoming.status || null;
                existing.end_turn ||= incoming.end_turn;
                existing.is_complete ||= incoming.is_complete;
                existing.create_time ||= incoming.create_time || 0;
                continue;
            }
            records.push({ ...incoming, order: nextOrder++ });
        }
        log('records', records);
    }

    function composeGroup(parts) {
        if (!parts.length) return null;
        const body = [...parts];
        // 实测的组首过程提示：106→1652、99→1006→2147。
        while (body.length > 1 && !body[0].end_turn && !body[0].is_complete && body[0].text.length <= 400) {
            body.shift();
        }
        if (!body.length) return null;
        let text = '';
        for (const part of body) {
            const chunk = cleanText(part.text);
            if (!chunk) continue;
            if (!text) { text = chunk; continue; }
            if (chunk.startsWith(text)) { text = chunk; continue; }
            if (text.startsWith(chunk) || text.endsWith(chunk)) continue;
            text += '\n\n' + chunk;
        }
        text = cleanText(text);
        if (!text) return null;
        let model = null;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (parts[i].model) {
                model = parts[i].model;
                if (isGPT6Model(model)) break;
            }
        }
        const finalPart = parts[parts.length - 1];
        return {
            text, model, startOrder: parts[0].order, endOrder: finalPart.order,
            create_time: finalPart.create_time || 0
        };
    }

    function rebuildGroups() {
        const ordered = [...records].sort((a, b) => a.order - b.order);
        const result = [];
        let current = [];
        for (const record of ordered) {
            current.push(record);
            if (record.end_turn === true) {
                const group = composeGroup(current);
                if (group && isGPT6Model(group.model)) result.push(group);
                current = [];
            }
        }
        groups = result;
        log('groups', groups);
    }

    // ---------------------- Markdown：维持 v1.1.4 ----------------------
    function appendLink(parent, label, href) {
        const a = document.createElement('a');
        a.textContent = label;
        a.setAttribute('href', href); // 保留 sandbox: 原始形式
        if (/^https?:/i.test(href)) {
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
        }
        a.style.textDecoration = 'underline';
        a.style.cursor = 'pointer';
        parent.appendChild(a);
    }

    function appendInline(parent, text) {
        const regex = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)]+\)|\*[^*\n]+\*)/g;
        let last = 0;
        let match;
        while ((match = regex.exec(text))) {
            if (match.index > last) {
                parent.appendChild(document.createTextNode(text.slice(last, match.index)));
            }
            const token = match[0];
            if (token.startsWith('**') && token.endsWith('**')) {
                const strong = document.createElement('strong');
                // 必须继续解析粗体内的 Markdown 链接（实测 **[文件名](sandbox:/...)**）。
                appendInline(strong, token.slice(2, -2));
                parent.appendChild(strong);
            } else if (token.startsWith('`') && token.endsWith('`')) {
                const code = document.createElement('code');
                code.textContent = token.slice(1, -1);
                code.style.cssText = 'padding:2px 5px;border-radius:5px;background:rgba(127,127,127,.15);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.92em;';
                parent.appendChild(code);
            } else if (token.startsWith('[')) {
                const m = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if (m) {
                    if (/^(https?:|mailto:|sandbox:)/i.test(m[2])) appendLink(parent, m[1], m[2]);
                    else parent.appendChild(document.createTextNode(m[1]));
                }
            } else {
                const em = document.createElement('em');
                appendInline(em, token.slice(1, -1));
                parent.appendChild(em);
            }
            last = regex.lastIndex;
        }
        if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
    }

    function parseTableRow(line) {
        let value = line.trim();
        if (value.startsWith('|')) value = value.slice(1);
        if (value.endsWith('|')) value = value.slice(0, -1);
        return value.split('|').map(cell => cell.trim());
    }
    function isTableSeparator(line) {
        const cells = parseTableRow(line);
        return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')));
    }

    function renderMarkdown(markdown, groupIndex) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute(RECOVERY_ATTR, '1');
        wrapper.dataset.gpt6Group = String(groupIndex);
        wrapper.style.cssText = 'width:100%;margin:0;padding:0;color:inherit;font:inherit;line-height:1.7;overflow-wrap:anywhere;';
        const lines = String(markdown).replace(/\r\n/g, '\n').split('\n');
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (!line.trim()) { i++; continue; }

            // 兼容旧版发现的“拆行 sandbox 链接”格式（正常同行链接交给 appendInline）。
            const fileLabel = line.trim().match(/^\[([^\]]+)\]$/);
            if (fileLabel && i + 1 < lines.length) {
                let targetIndex = i + 1;
                while (targetIndex < lines.length && !lines[targetIndex].trim()) targetIndex++;
                if (targetIndex < lines.length) {
                    const target = lines[targetIndex].trim().match(/^\((sandbox:[^)]+)\)$/);
                    if (target) {
                        const p = document.createElement('p');
                        p.style.cssText = 'margin:.85em 0;line-height:1.7;';
                        appendLink(p, fileLabel[1], target[1]);
                        wrapper.appendChild(p);
                        i = targetIndex + 1;
                        continue;
                    }
                }
            }

            if (line.trim().startsWith('```')) {
                const content = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) content.push(lines[i++]);
                if (i < lines.length) i++;
                const pre = document.createElement('pre');
                pre.style.cssText = 'margin:1em 0;padding:14px 16px;overflow-x:auto;border-radius:10px;background:rgba(127,127,127,.12);';
                const code = document.createElement('code');
                code.textContent = content.join('\n');
                pre.appendChild(code);
                wrapper.appendChild(pre);
                continue;
            }

            if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                const hr = document.createElement('hr');
                hr.style.cssText = 'margin:1.25em 0;border:0;border-top:1px solid rgba(127,127,127,.25);';
                wrapper.appendChild(hr);
                i++;
                continue;
            }

            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                const h = document.createElement(`h${heading[1].length}`);
                appendInline(h, heading[2]);
                h.style.cssText = 'margin:1.1em 0 .5em;font-weight:700;line-height:1.35;';
                wrapper.appendChild(h);
                i++;
                continue;
            }

            if (i + 1 < lines.length && line.includes('|') && isTableSeparator(lines[i + 1])) {
                const headers = parseTableRow(line);
                i += 2;
                const rows = [];
                while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(parseTableRow(lines[i++]));
                const holder = document.createElement('div');
                holder.style.cssText = 'overflow-x:auto;margin:1em 0;';
                const table = document.createElement('table');
                table.style.cssText = 'width:100%;border-collapse:collapse;';
                const thead = document.createElement('thead');
                const trh = document.createElement('tr');
                for (const text of headers) {
                    const th = document.createElement('th');
                    appendInline(th, text);
                    th.style.cssText = 'text-align:left;padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.35);';
                    trh.appendChild(th);
                }
                thead.appendChild(trh);
                table.appendChild(thead);
                const tbody = document.createElement('tbody');
                for (const row of rows) {
                    const tr = document.createElement('tr');
                    for (const text of row) {
                        const td = document.createElement('td');
                        appendInline(td, text);
                        td.style.cssText = 'padding:8px 10px;border-bottom:1px solid rgba(127,127,127,.18);vertical-align:top;';
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                }
                table.appendChild(tbody);
                holder.appendChild(table);
                wrapper.appendChild(holder);
                continue;
            }

            if (/^\s*[-+*]\s+/.test(line)) {
                const ul = document.createElement('ul');
                ul.style.cssText = 'margin:.65em 0;padding-left:1.6em;list-style:disc;';
                while (i < lines.length && /^\s*[-+*]\s+/.test(lines[i])) {
                    const li = document.createElement('li');
                    appendInline(li, lines[i].replace(/^\s*[-+*]\s+/, ''));
                    ul.appendChild(li);
                    i++;
                }
                wrapper.appendChild(ul);
                continue;
            }

            if (/^\s*\d+\.\s+/.test(line)) {
                const ol = document.createElement('ol');
                ol.style.cssText = 'margin:.65em 0;padding-left:1.7em;list-style:decimal;';
                while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
                    const li = document.createElement('li');
                    appendInline(li, lines[i].replace(/^\s*\d+\.\s+/, ''));
                    ol.appendChild(li);
                    i++;
                }
                wrapper.appendChild(ol);
                continue;
            }

            if (/^\s*>\s?/.test(line)) {
                const parts = [];
                while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
                    parts.push(lines[i].replace(/^\s*>\s?/, ''));
                    i++;
                }
                const block = document.createElement('blockquote');
                block.style.cssText = 'margin:1em 0;padding-left:14px;border-left:3px solid rgba(127,127,127,.4);opacity:.9;';
                appendInline(block, parts.join(' '));
                wrapper.appendChild(block);
                continue;
            }

            const p = document.createElement('p');
            p.style.cssText = 'margin:.85em 0;line-height:1.7;';
            appendInline(p, line);
            wrapper.appendChild(p);
            i++;
        }
        return wrapper;
    }

    // ----------------------- 与 ChatGPT 页面 DOM 对接 -----------------------
    function getOfficialDilText(root) {
        const dil = root.querySelector(DIL_SELECTOR);
        if (!dil) return '';
        const clone = dil.cloneNode(true);
        clone.querySelectorAll(FAIL_SELECTOR).forEach(node => node.remove());
        clone.querySelectorAll(`[${RECOVERY_ATTR}]`).forEach(node => node.remove());
        return cleanText(clone.innerText || clone.textContent);
    }
    function officialDilIsUsable(root) {
        const text = getOfficialDilText(root);
        return text.length >= 5 && !/(?:undefined){2,}/.test(text);
    }
    function hideBrokenDil(root) {
        const dil = root.querySelector(DIL_SELECTOR);
        if (!dil) return;
        dil.setAttribute(HIDDEN_DIL_ATTR, '1');
        dil.style.setProperty('display', 'none', 'important');
    }
    function restoreDil(root) {
        const dil = root.querySelector(`[${HIDDEN_DIL_ATTR}]`);
        if (!dil) return;
        dil.style.removeProperty('display');
        dil.removeAttribute(HIDDEN_DIL_ATTR);
    }
    function getCurrentRoots() {
        const all = [...document.querySelectorAll(`main ${ROOT_SELECTOR}`)]
            .filter(root => root.querySelector(DIL_SELECTOR));
        if (!all.length) return [];
        const fresh = all.filter(root => !baselineRoots.has(root));
        if (fresh.length) return fresh;
        if (navigationStartedAt && performance.now() - navigationStartedAt > 450) return all;
        return [];
    }
    function getRecoverableRoots() {
        return getCurrentRoots().filter(root => !officialDilIsUsable(root));
    }
    function applyRecovery() {
        const gpt6Groups = groups.filter(group => isGPT6Model(group.model));
        if (!gpt6Groups.length) return;
        const roots = getRecoverableRoots();
        if (!roots.length || roots.length !== gpt6Groups.length) {
            if (roots.length) log('等待 Root / Group 对齐', { roots: roots.length, groups: gpt6Groups.length });
            return;
        }
        for (let i = 0; i < roots.length; i++) {
            const root = roots[i];
            const group = gpt6Groups[i];
            let recovery = root.querySelector(`[${RECOVERY_ATTR}]`);
            if (recovery && recovery.dataset.gpt6Group === String(i)) {
                hideBrokenDil(root);
                continue;
            }
            if (officialDilIsUsable(root)) continue;
            if (recovery) recovery.remove();
            const displayText = cleanChatGPTInternalMarkup(group.text);
            if (!displayText) continue;
            recovery = renderMarkdown(displayText, i);
            const dil = root.querySelector(DIL_SELECTOR);
            if (dil) dil.insertAdjacentElement('beforebegin', recovery);
            else root.appendChild(recovery);
            hideBrokenDil(root);
            log('恢复回复', { group: i, chars: displayText.length });
        }
    }
    function reconcileRoot(root) {
        if (!root) return;
        const recovery = root.querySelector(`[${RECOVERY_ATTR}]`);
        const failures = root.querySelectorAll(FAIL_SELECTOR);
        if (failures.length) {
            if (recovery) hideBrokenDil(root);
            return;
        }
        if (!recovery) return;
        if (officialDilIsUsable(root)) {
            restoreDil(root);
            recovery.remove();
            log('官方 DIL 恢复，移除 fallback');
        }
    }
    function recoverFailedRoots() {
        const gpt6Groups = groups.filter(group => isGPT6Model(group.model));
        if (!gpt6Groups.length) return;
        const failedRoots = [];
        document.querySelectorAll(FAIL_SELECTOR).forEach(fail => {
            const root = fail.closest(ROOT_SELECTOR);
            if (root && !failedRoots.includes(root)) failedRoots.push(root);
        });
        if (!failedRoots.length || failedRoots.length !== gpt6Groups.length) return;
        for (let i = 0; i < failedRoots.length; i++) {
            const root = failedRoots[i];
            let recovery = root.querySelector(`[${RECOVERY_ATTR}]`);
            if (!recovery) {
                const displayText = cleanChatGPTInternalMarkup(gpt6Groups[i].text);
                if (!displayText) continue;
                recovery = renderMarkdown(displayText, i);
                const dil = root.querySelector(DIL_SELECTOR);
                if (dil) dil.insertAdjacentElement('beforebegin', recovery);
                else root.appendChild(recovery);
            }
            hideBrokenDil(root);
        }
    }
    function inspectNode(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.matches?.(ROOT_SELECTOR)) reconcileRoot(node);
        node.querySelectorAll?.(ROOT_SELECTOR).forEach(root => reconcileRoot(root));
        applyRecovery();
        recoverFailedRoots();
    }
    function startObserver() {
        if (!document.documentElement) {
            setTimeout(startObserver, 5);
            return;
        }
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) inspectNode(node);
                const root = mutation.target?.nodeType === Node.ELEMENT_NODE
                    ? mutation.target.closest?.(ROOT_SELECTOR)
                    : null;
                if (root) reconcileRoot(root);
            }
            applyRecovery();
            recoverFailedRoots();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        log('Observer ready');
    }

    // -------------------------- SPA 导航 --------------------------
    function resetConversation(id) {
        snapshotRoots();
        currentConversationId = id;
        navigationStartedAt = performance.now();
        records = [];
        groups = [];
        nextOrder = 1;
        log('conversation reset', id);
    }
    document.addEventListener('pointerdown', event => {
        const link = event.target?.closest?.('a[href*="/c/"]');
        if (!link) return;
        const id = getConversationId(link.href);
        if (!id || id === getConversationId(location.href)) return;
        resetConversation(id);
    }, true);
    let lastUrl = location.href;
    function checkUrlChange() {
        if (location.href === lastUrl) return;
        lastUrl = location.href;
        const id = getConversationId(location.href);
        if (id && id !== currentConversationId) resetConversation(id);
    }
    try {
        const nativePush = page.history.pushState;
        page.history.pushState = function (...args) {
            const result = nativePush.apply(this, args);
            queueMicrotask(checkUrlChange);
            return result;
        };
    } catch (_) { }
    try {
        const nativeReplace = page.history.replaceState;
        page.history.replaceState = function (...args) {
            const result = nativeReplace.apply(this, args);
            queueMicrotask(checkUrlChange);
            return result;
        };
    } catch (_) { }
    window.addEventListener('popstate', checkUrlChange);

    // -------------------------- GET 监听 --------------------------
    function getRequestMethod(input, init) {
        if (init && typeof init.method === 'string') return init.method.toUpperCase();
        if (input && typeof input.method === 'string') return input.method.toUpperCase();
        return 'GET';
    }
    function isTextResponse(response) {
        const type = response?.headers?.get('content-type') || '';
        return !type || type.includes('json') || type.includes('text');
    }
    try {
        const nativeFetch = page.fetch;
        if (typeof nativeFetch === 'function' && !nativeFetch.__gpt6FixHooked) {
            const wrappedFetch = function (...args) {
                const method = getRequestMethod(args[0], args[1]);
                const promise = nativeFetch.apply(this, args);
                if (method !== 'GET') return promise;
                promise.then(response => {
                    if (!isTextResponse(response)) return;
                    try { response.clone().text().then(parseNetworkText).catch(() => { }); }
                    catch (_) { }
                }).catch(() => { });
                return promise;
            };
            wrappedFetch.__gpt6FixHooked = true;
            page.fetch = wrappedFetch;
            log('fetch GET hook ready');
        }
    } catch (error) {
        console.error(TAG, error);
    }
    try {
        const XHR = page.XMLHttpRequest;
        if (XHR && !XHR.prototype.__gpt6FixHooked) {
            const nativeOpen = XHR.prototype.open;
            const nativeSend = XHR.prototype.send;
            XHR.prototype.open = function (method, url, ...rest) {
                this.__gpt6Method = String(method || 'GET').toUpperCase();
                return nativeOpen.call(this, method, url, ...rest);
            };
            XHR.prototype.send = function (...args) {
                if (this.__gpt6Method !== 'GET') return nativeSend.apply(this, args);
                this.addEventListener('loadend', () => {
                    try {
                        const type = this.getResponseHeader?.('content-type') || '';
                        if (type && !type.includes('json') && !type.includes('text')) return;
                        if (typeof this.responseText === 'string') parseNetworkText(this.responseText);
                    } catch (_) { }
                }, { once: true });
                return nativeSend.apply(this, args);
            };
            XHR.prototype.__gpt6FixHooked = true;
            log('XHR GET hook ready');
        }
    } catch (error) {
        console.error(TAG, error);
    }

    snapshotRoots();
    startObserver();
    log('GPT-6 DIL 浏览器扩展 v1.1.4 loaded');
})();