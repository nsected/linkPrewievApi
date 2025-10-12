(() => {
    //if (window.CLIENT?.name !== 'Deenya') return;

    const API_BASE = 'https://linkprewievapi.onrender.com/api/parse?url=';
    const linkRegex = /(https?:\/\/[^\s]+)/i;
    const cache = new Map();

    console.log('[linkPreview] Инициализирован для CyTube');

    // === 1. Обработка уже существующих сообщений ===
    function processExistingMessages() {
        console.log('[linkPreview] 🔎 Проверка существующих сообщений...');
        document.querySelectorAll('#messagebuffer > div').forEach(msgElem => {
            const text = msgElem.textContent;
            const url = text.match(linkRegex);
            if (url) {
                console.log('[linkPreview] 🆕 Новое сообщение с ссылкой обнаружено:', url[1]);
                handleLinkPreview(msgElem, url[1]);
            }
        });
    }

    // === 2. MutationObserver для новых сообщений ===
    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(msgElem => {
                if (msgElem.nodeType !== Node.ELEMENT_NODE) return;
                const text = msgElem.textContent;
                const url = text.match(linkRegex);
                if (url) {
                    console.log('[linkPreview] 🆕 Новое сообщение с ссылкой обнаружено:', url[1]);
                    handleLinkPreview(msgElem, url[1]);
                }
            });
        });
    });

    // === 3. Функция обработки ссылки ===
    async function handleLinkPreview(msgElem, url) {
        if (!msgElem || !url) return;

        if (cache.has(url)) {
            addLinkPreviewToChat(msgElem, cache.get(url));
            return;
        }

        console.log('[linkPreview] ▶ handleLinkPreview для', url);

        try {
            const resp = await fetch(`${API_BASE}${encodeURIComponent(url)}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const meta = await resp.json();
            if (!meta?.title) return;

            console.log('[linkPreview] ✅ Распарсенные метаданные:', meta);
            console.log(cache);
            cache.set(url, meta);
            addLinkPreviewToChat(msgElem, meta);

        } catch (err) {
            console.warn('[linkPreview] Ошибка при получении превью:', err);
        }
    }

    // === 4. Добавление карточки ===
    function addLinkPreviewToChat(msgElem, meta) {
        if (!msgElem) return;
        if (msgElem.querySelector('.link-preview')) return;

        const card = document.createElement('div');
        card.className = 'link-preview';
        card.style.cssText = `
            margin: 4px 0 6px 0;
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

        // вставляем в конец элемента сообщения
        msgElem.appendChild(card);

        requestAnimationFrame(() => card.style.opacity = '1');
        console.log('[linkPreview] ✅ Карточка вставлена в элемент:', msgElem);
    }



    const msgBuffer = document.getElementById('messagebuffer');
    if (msgBuffer) {
        observer.observe(msgBuffer, { childList: true });
        processExistingMessages();
    }

})();
