(() => {
    const API_BASE = 'https://linkprewievapi.onrender.com/api/parse?url=';
    const linkRegex = /(https?:\/\/[^\s]+)/i;
    const cache = new Map();

    // === DEBUG SYSTEM ===
    const DEBUG_LEVELS = ['error', 'warn', 'info', 'verbose'];
    const DEBUG_ENABLED = true; // ← можно выключить глобально

    function debug(level, message, ...data) {
        if (!DEBUG_ENABLED) return;
        const index = DEBUG_LEVELS.indexOf(level);
        if (index === -1) level = 'verbose';

        const prefix = `[linkPreview:${level.toUpperCase()}]`;
        const color =
            level === 'error' ? 'color:red' :
                level === 'warn'  ? 'color:orange' :
                    level === 'info'  ? 'color:lightblue' :
                        'color:gray';

        if (data.length) console.log(`%c${prefix}`, color, message, ...data);
        else console.log(`%c${prefix}`, color, message);
    }

    debug('info', '🚀 Module initialized for CyTube');

    // === 1. Process existing messages ===
    function processExistingMessages() {
        debug('info', '🔎 Scanning existing messages...');
        document.querySelectorAll('#messagebuffer > div').forEach(msgElem => {
            const text = msgElem.textContent;
            const url = text.match(linkRegex);
            if (url) {
                debug('verbose', '🆕 Found existing message with link:', url[1]);
                handleLinkPreview(msgElem, url[1]);
            }
        });
    }

    // === 2. Observe new messages ===
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(msgElem => {
                if (msgElem.nodeType !== Node.ELEMENT_NODE) return;
                const text = msgElem.textContent;
                const url = text.match(linkRegex);
                if (url) {
                    debug('info', '🆕 New message with link detected:', url[1]);
                    handleLinkPreview(msgElem, url[1]);
                }
            });
        });
    });

    // === 3. Handle link ===
    async function handleLinkPreview(msgElem, url) {
        const start = performance.now();
        debug('verbose', `▶ Processing link: ${url}`);

        if (!msgElem || !url) {
            debug('warn', '⚠ handleLinkPreview called without msgElem or url');
            return;
        }

        if (cache.has(url)) {
            debug('info', `💾 Using cache for ${url}`);
            addLinkPreviewToChat(msgElem, cache.get(url));
            return;
        }

        let resp;
        try {
            const endpoint = `${API_BASE}${encodeURIComponent(url)}`;
            debug('verbose', '🌐 Fetching from API:', endpoint);

            resp = await fetch(endpoint);

            if (!resp.ok) {
                const text = await resp.text();
                debug('error', `❌ HTTP ${resp.status}`, text);
                return;
            }

            const meta = await resp.json();
            if (!meta) {
                debug('warn', '⚠ Empty JSON response');
                return;
            }

            debug('verbose', '📦 Metadata received:', meta);

            if (!meta.title) {
                debug('warn', '⚠ No meta.title — skipping preview generation');
                return;
            }

            cache.set(url, meta);
            debug('info', `💾 Cached (${cache.size} entries)`);

            addLinkPreviewToChat(msgElem, meta);

        } catch (err) {
            debug('error', '💥 Error during fetch/parse:', err);
        } finally {
            const duration = (performance.now() - start).toFixed(1);
            debug('info', `🕓 Processing finished in ${duration}ms`);
        }
    }

    // === 4. Create preview card ===
    function addLinkPreviewToChat(msgElem, meta) {
        if (!msgElem) {
            debug('warn', '⚠ msgElem missing, skipping card insert');
            return;
        }

        if (msgElem.querySelector('.link-preview')) {
            debug('verbose', 'ℹ Preview card already exists, skipping');
            return;
        }

        debug('verbose', '🧩 Building preview card...');
        const card = document.createElement('div');
        card.className = 'link-preview';
        card.style.cssText = `
            margin: 4px 0 6px 0;
            border: 1px solid #333;
            border-radius: 6px;
            overflow: hidden;
            display: flex;
            max-width: 600px;
            background: #111;
            color: #ddd;
            font-size: 13px;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        if (meta.image) {
            const img = document.createElement('img');
            img.src = meta.image;
            img.alt = meta.title || '';
            img.style.width = '338px';
            img.style.height = '152px';
            img.style.objectFit = 'cover';
            card.appendChild(img);
        } else {
            debug('warn', '⚠ meta.image missing');
        }

        const body = document.createElement('div');
        body.style.padding = '6px';
        body.style.flex = '1';

        const title = document.createElement('div');
        title.textContent = meta.title || '[No title]';
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '2px';
        body.appendChild(title);

        if (meta.description) {
            const desc = document.createElement('div');
            desc.textContent = meta.description;
            desc.style.fontSize = '12px';
            desc.style.opacity = '0.8';
            body.appendChild(desc);
        } else {
            debug('warn', '⚠ meta.description missing');
        }

        card.appendChild(body);
        msgElem.appendChild(card);

        requestAnimationFrame(() => card.style.opacity = '1');
        debug('info', `✅ Preview card inserted successfully into ${msgElem}`);
    }

    // === 5. Init ===
    const msgBuffer = document.getElementById('messagebuffer');
    if (msgBuffer) {
        observer.observe(msgBuffer, { childList: true });
        processExistingMessages();
    } else {
        debug('error', '❌ #messagebuffer not found — module inactive');
    }
})();
