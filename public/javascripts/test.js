(() => {
    const API_BASE = 'https://linkprewiev.example.com/api/parse?url=';
    const linkRegex = /(https?:\/\/[^\s]+)/i;
    const cache = new Map();

    // === 1. Обработка новых сообщений ===
    socket.on("chatMsg", async (data) => {
        if (!data?.msg) return;
        const match = data.msg.match(linkRegex);
        if (!match) return;

        const url = match[1];
        handleLinkPreview(data, url);
    });

    // === 2. Обработка уже загруженных сообщений ===
    window.addEventListener('load', () => {
        document.querySelectorAll('#messagebuffer > div').forEach(el => {
            const username = el.querySelector('.username')?.textContent?.replace(/[:\s]+$/, '');
            const spans = el.querySelectorAll('span');
            const msgSpan = spans[2];
            if (!msgSpan) return;
            const msg = msgSpan.textContent?.trim();
            if (!msg) return;

            const match = msg.match(linkRegex);
            if (!match) return;

            const url = match[1];
            const msgData = { username, msg, time: Date.now() };
            handleLinkPreview(msgData, url);
        });
    });

    // === 3. Универсальная обработка ссылки ===
    async function handleLinkPreview(data, url) {
        if (cache.has(url)) {
            addLinkPreviewToChat(data, cache.get(url));
            return;
        }

        try {
            const resp = await fetch(`${API_BASE}${encodeURIComponent(url)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const meta = await resp.json();
            if (!meta?.title) return;
            cache.set(url, meta);
            addLinkPreviewToChat(data, meta);
        } catch (err) {
            console.warn('[linkPreview] Ошибка при получении превью:', err);
        }
    }

    // === 4. Добавление карточки в чат ===
    function addLinkPreviewToChat(msgData, meta) {
        const msgElems = document.querySelectorAll('#messagebuffer > div');
        const msgElem = Array.from(msgElems).find(el => {
            const nameEl = el.querySelector('.username');
            const spans = el.querySelectorAll('span');
            const msgSpan = spans[2];
            if (!nameEl || !msgSpan) return false;

            const username = nameEl.textContent.replace(/[:\s]+$/, '');
            const text = msgSpan.textContent.trim();
            return username === msgData.username && text.includes(msgData.msg.trim());
        });

        if (!msgElem || msgElem.querySelector('.link-preview')) return;

        const card = document.createElement('div');
        card.className = 'link-preview';
        card.style.cssText = `
      margin: 4px 0 6px 24px;
      border: 1px solid #333;
      border-radius: 6px;
      overflow: hidden;
      display: flex;
      max-width: 420px;
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
            img.style.width = '110px';
            img.style.height = '70px';
            img.style.objectFit = 'cover';
            card.appendChild(img);
        }

        const body = document.createElement('div');
        body.style.padding = '6px';
        body.style.flex = '1';

        const title = document.createElement('div');
        title.textContent = meta.title;
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '2px';
        body.appendChild(title);

        if (meta.description) {
            const desc = document.createElement('div');
            desc.textContent = meta.description;
            desc.style.fontSize = '12px';
            desc.style.opacity = '0.8';
            body.appendChild(desc);
        }

        card.appendChild(body);
        msgElem.insertAdjacentElement('afterend', card);

        // Анимация появления
        requestAnimationFrame(() => {
            card.style.opacity = '1';
        });
    }

    console.log('[linkPreview] Инициализирован для CyTube');
})();
