// ═══════════════════════════════════════════════════════════
// DOMAIN GUARD — Проверка домена и онлайн-статуса
// Защита от копирования сайта на другой домен и офлайн-использования
// ═══════════════════════════════════════════════════════════

window.DomainGuard = {
    // Разрешённые домены (без протокола и порта)
    ALLOWED_DOMAINS: [
        'cutsypro.ru',
        'www.cutsypro.ru',
        'app.cutsypro.ru',
        'koksasa.github.io'
    ],
    
    // API endpoint для проверки онлайн-статуса
    HEALTH_CHECK_URL: 'https://cutsypro.ru/api/health',
    // Таймаут проверки (мс)
    CHECK_TIMEOUT: 5000,
    
    // Нужна ли онлайн-проверка    
    REQUIRE_ONLINE: true,
    
    // Статус проверки
    _verified: false,
    _isOnline: false,
    _isValidDomain: false,
    
    // Проверка домена
    checkDomain() {
        const host = location.host.replace(/:\d+$/, '').toLowerCase();
        const allowed = this.ALLOWED_DOMAINS.map(d => d.toLowerCase());
        
        if (allowed.includes(host)) {
            this._isValidDomain = true;
            return true;
        }
        
        // Проверка subdomain
        const parts = host.split('.');
        if (parts.length > 2) {
            const mainDomain = parts.slice(-2).join('.');
            if (allowed.includes(mainDomain) || allowed.includes(host)) {
                this._isValidDomain = true;
                return true;
            }
        }
        
        this._isValidDomain = false;
        return false;
    },
    
    // Онлайн проверка через fetch    
    async checkOnline() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.CHECK_TIMEOUT);
            
            const response = await fetch(this.HEALTH_CHECK_URL, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            this._isOnline = true;
            return true;
        } catch {
            this._isOnline = false;
            return false;
        }
    },
    
    // Показать экран блокировки
    showBlockScreen(message, title, showOnlineCheck) {
        // Удаляем всё содержимое body
        document.body.innerHTML = '';
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.body.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
        document.body.style.background = 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)';
        document.body.style.minHeight = '100vh';
        document.body.style.display = 'flex';
        document.body.style.alignItems = 'center';
        document.body.style.justifyContent = 'center';
        
        const card = document.createElement('div');
        card.style.cssText = `
            background: rgba(26, 26, 46, 0.98);
            border: 1px solid #ff5252;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 25px 80px rgba(0,0,0,0.6);
        ` + 'display:block;';
        
        const domainList = this.ALLOWED_DOMAINS.join(', ');
        card.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 20px;">🚫</div>
            <h1 style="color: #ff5252; margin: 0 0 15px 0; font-size: 24px;">${title || 'Доступ ограничен'}</h1>
            <p style="color: #aaa; font-size: 14px; line-height: 1.6; margin-bottom: 20px;"></p>
            <div style="background: #1e1e1e; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <p style="color: #888; font-size: 12px; margin: 0;">Ваш домен: <strong style="color: #ff5252;">${location.host}</strong></p>
                <p style="color: #888; font-size: 12px; margin: 5px 0 0 0;">Разрешено: <strong style="color: #00d4aa;">${domainList}</strong></p>
            </div>
            ${showOnlineCheck ? '<button id="restartCheck" style="padding: 12px 24px; background: #007acc; color: #fff; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; margin-bottom: 10px;">Повторить проверку</button>' : ''}
            <p style="color: #555; font-size: 11px; margin-top: 20px;">Cutsy CAD PRO ${new Date().getFullYear()}</p>
        `;
        
        document.body.appendChild(card);
        
        if (showOnlineCheck) {
            setTimeout(() => {
                const btn = document.getElementById('restartCheck');
                if (btn) {
                    btn.addEventListener('click', () => {
                        window.location.reload();
                    });
                }
            }, 100);
        }
    },
    
    // Асинхронная инициализация
    async init() {
        // Проверяем домен
        if (!this.checkDomain()) {
            this.showBlockScreen(
                'Это приложение доступно только на официальном сайте Cutsy CAD PRO. Пожалуйста, откройте cutsypro.ru',
                'Неверный домен',
                false
            );
            return false;
        }
        
        // Проверяем онлайн (если требуется)
        if (this.REQUIRE_ONLINE) {
            const isOnline = await this.checkOnline();
            
            // Offline warning - даём 30 секунд работы, потом блокируем
            if (!isOnline) {
                this._showOfflineWarning();
                // Через 30 секунд блокируем если всё ещё офлайн
                setTimeout(async () => {
                    if (!this._verified && !navigator.onLine) {
                        document.body.innerHTML = '';
                        document.body.style.cssText = 'margin:0;padding:0;font-family:Segoe UI,sans-serif;background:linear-gradient(135deg,#0f0f1a,#1a1a2e);min-height:100vh;display:flex;align-items:center;justify-content:center;';
                        const div = document.createElement('div');
                        div.style.cssText = 'background:rgba(26,26,46,.98);border:1px solid #ff5252;border-radius:16px;padding:40px;max-width:500px;text-align:center;';
                        div.innerHTML = '<div style="font-size:48px;margin-bottom:20px;">📡</div><h1 style="color:#ff5252;margin:0 0 15px;font-size:24px;">Нет соединения</h1><p style="color:#aaa;font-size:14px;line-height:1.6;margin-bottom:20px;">Для работы с Cutsy CAD PRO требуется интернет-соединение.</p><button onclick="window.location.reload()" style="padding:12px 24px;background:#007acc;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Повторить</button>';
                        document.body.appendChild(div);
                    }
                }, 30000);
                return true;
            }
        }
        
        this._verified = true;
        return true;
    },
    
    // Предупреждение об офлайн-работе
    _showOfflineWarning() {
        const warning = document.createElement('div');
        warning.id = 'offlineWarning';
        warning.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#7a5a2d;color:#fff;padding:10px 20px;text-align:center;font-size:13px;z-index:99999;display:flex;align-items:center;justify-content:center;gap:10px;';
        
        warning.innerHTML = '<span>📡</span><span><strong>Нет соединения с сервером.</strong> Приложение работает в ограниченном режиме.</span><span id="offlineTimer" style="font-size:11px;opacity:.8;">30 сек</span>';
        
        document.body.appendChild(warning);
        
        // Таймер обратного отсчёта
        let seconds = 30;
        const timer = setInterval(() => {
            seconds--;
            const timerEl = document.getElementById('offlineTimer');
            if (timerEl) {
                timerEl.textContent = seconds + ' сек';
            }
            if (seconds <= 0 || navigator.onLine) {
                clearInterval(timer);
                const warnEl = document.getElementById('offlineWarning');
                if (warnEl) warnEl.remove();
            }
        }, 1000);
        
        // Слушаем восстановление соединения
        window.addEventListener('online', () => {
            clearInterval(timer);
            const warnEl = document.getElementById('offlineWarning');
            if (warnEl) {
                warnEl.style.background = '#2d7a5a';
                warnEl.innerHTML = '<span>✅</span><span><strong>Соединение восстановлено.</strong> Приложение работает в штатном режиме.</span>';
                setTimeout(() => warnEl.remove(), 3000);
            }
        }, { once: true });
    }
};
