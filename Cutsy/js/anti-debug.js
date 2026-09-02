// ═══════════════════════════════════════════════════════════
// DOMAIN GUARD — ранняя проверка домена (запускается до всего остального)
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';
    
    const ALLOWED_DOMAINS = [
        'cutsypro.ru',
        'www.cutsypro.ru',
        'app.cutsypro.ru',
        'koksasa.github.io'
    ];
    
    const HEALTH_URL = 'https://cutsypro.ru/api/health';
    
    function checkDomain() {
        const host = location.host.replace(/:\d+$/, '').toLowerCase();
        if (ALLOWED_DOMAINS.includes(host)) return true;
        const parts = host.split('.');
        if (parts.length > 2) {
            const main = parts.slice(-2).join('.');
            if (ALLOWED_DOMAINS.includes(main)) return true;
        }
        return false;
    }
    
    function blockSite(reason) {
        document.body.innerHTML = '';
        document.body.style.cssText = 'margin:0;padding:0;font-family:Segoe UI,sans-serif;background:linear-gradient(135deg,#0f0f1a,#1a1a2e);min-height:100vh;display:flex;align-items:center;justify-content:center;';
        var card = document.createElement('div');
        card.style.cssText = 'background:rgba(26,26,46,.98);border:1px solid #ff5252;border-radius:16px;padding:40px;max-width:500px;text-align:center;box-shadow:0 25px 80px rgba(0,0,0,.6);';
        
        var domainList = ALLOWED_DOMAINS.join(', ');
        var content = '';
        if (reason === 'domain') {
            content = '<div style="font-size:48px;margin-bottom:20px;">🚫</div><h1 style="color:#ff5252;margin:0 0 15px;font-size:24px;">Доступ ограничен</h1><p style="color:#aaa;font-size:14px;line-height:1.6;margin-bottom:20px;">Это приложение доступно только на официальном сайте Cutsy CAD PRO.<br><br>Пожалуйста, откройте <a href="https://cutsypro.ru" style="color:#00d4aa;">cutsypro.ru</a></p><div style="background:#1e1e1e;border-radius:8px;padding:15px;margin-bottom:20px;"><p style="color:#888;font-size:12px;margin:0;">Ваш домен: <strong style="color:#ff5252;">' + location.host + '</strong></p><p style="color:#888;font-size:12px;margin:5px 0 0;">Разрешено: <strong style="color:#00d4aa;">' + domainList + '</strong></p></div><p style="color:#555;font-size:11px;margin-top:20px;">Cutsy CAD PRO ' + new Date().getFullYear() + '</p>';
        } else if (reason === 'offline') {
            content = '<div style="font-size:48px;margin-bottom:20px;">📡</div><h1 style="color:#ff5252;margin:0 0 15px;font-size:24px;">Нет соединения</h1><p style="color:#aaa;font-size:14px;line-height:1.6;margin-bottom:20px;">Для работы с Cutsy CAD PRO требуется интернет-соединение.<br><br>Подключитесь к интернету и обновите страницу.</p><button onclick="window.location.reload()" style="padding:12px 24px;background:#007acc;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;">Обновить</button><p style="color:#555;font-size:11px;margin-top:20px;">Cutsy CAD PRO ' + new Date().getFullYear() + '</p>';
        }
        
        card.innerHTML = content;
        document.body.appendChild(card);
        throw new Error('Site blocked');
    }
    
    // Ранняя проверка домена — отключаем на localhost
    if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1' && location.protocol !== 'file:') {
        if (!checkDomain()) {
            blockSite('domain');
        }
    }
})();

// ═══════════════════════════════════════════════════════════
// ANTI-DEBUG — Защита от отладки и подмены кода
// Защита от отладки и подмены кода
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';
    
    // Автоопределение: отключаем защиту на localhost / file:// для разработки
    // Или при ?debug=1 в URL
    const URL_PARAMS = new URLSearchParams(window.location.search);
    const DEBUG = location.hostname === 'localhost' ||
                  location.hostname === '127.0.0.1' ||
                  location.protocol === 'file:' ||
                  URL_PARAMS.get('debug') === '1';
    
    // Проверка открытия консоли — перезагрузка страницы
    // v4.60: В DEBUG режиме НЕ перезаписываем console методы —
    // это блокирует весь вывод в консоль при разработке.
    function detectConsoleOpen() {
        // В DEBUG режиме вообще не запускаем проверку консоли
        if (DEBUG) return;

        const originalDebug = console.debug;

        let consoleOpened = false;

        const checkConsole = () => {
            const before = performance.now();
            originalDebug.call(console, 'x');
            const after = performance.now();

            if (after - before > 10 && !consoleOpened) {
                consoleOpened = true;
                console.error('[AntiDebug] Console detected — reloading...');
                setTimeout(() => window.location.reload(), 100);
            }
        };

        // Проверяем periodically
        setInterval(checkConsole, 2000);

        // v4.60: БОЛЬШЕ НЕ перезаписываем console.log/warn/error/info/debug
        // Раньше это ломало вывод в консоль даже в DEBUG режиме.
        // Вместо этого — только detectConsoleOpen (перезагрузка при открытии).
        // Перехват console нужен только в production (не в DEBUG).
        // Если нужно отключить console в проде — это делает обфускатор
        // (disableConsoleOutput: true в build.js).
    }
    
    // Проверка через debugger statement
    function detectDebugger() {
        setInterval(function() {
            const start = performance.now();
            debugger;
            const end = performance.now();
            if (end - start > 100) {
                handleDebugDetected('Debugger statement detected');
            }
        }, 2000);
    }
    
    // Проверка localStorage подмены
    function detectStorageTampering() {
        const originalSetItem = Storage.prototype.setItem;
        const originalRemoveItem = Storage.prototype.removeItem;
        
        Storage.prototype.setItem = function(key, value) {
            if (key.includes('cutsy_session') || key.includes('cutsy_license')) {
                // Разрешаем
            }
            return originalSetItem.apply(this, arguments);
        };
        
        Storage.prototype.removeItem = function(key) {
            if (key.includes('cutsy_session') || key.includes('cutsy_license')) {
                if (!DEBUG) {
                    handleDebugDetected('Session tampering detected: ' + key);
                }
            }
            return originalRemoveItem.apply(this, arguments);
        };
    }
    
    // Обнаружение подмены LicenseManager
    function detectCodeTampering() {
        setInterval(function() {
            if (typeof LicenseManager === 'undefined') {
                handleDebugDetected('LicenseManager removed');
                return;
            }
            if (LicenseManager.isPro && LicenseManager.isPro.toString().length < 50) {
                handleDebugDetected('LicenseManager.isPro tampered');
                return;
            }
        }, 5000);
    }
    
    // Обработка обнаружения отладки
    function handleDebugDetected(reason) {
        if (DEBUG) {
            return;
        }
        
        // Очищаем сессию и перезагружаем ТОЛЬКО при критичных нарушениях
        if (reason.includes('eval') || reason.includes('tampering')) {
            try {
                localStorage.removeItem('cutsy_session_v3');
            } catch (e) {}
            setTimeout(function() {
                window.location.reload();
            }, 100);
        }
    }
    
    // Инициализация защиты
    function init() {
        if (DEBUG) {
            console.log('[AntiDebug] Running in DEBUG mode — protection disabled');
            return;
        }
        
        // Защита от открытия консоли — перезагрузка
        detectConsoleOpen();
        
        detectStorageTampering();
        detectCodeTampering();
        
        // Защита от eval
        window.eval = function() {
            handleDebugDetected('eval() blocked');
            throw new Error('eval is not allowed');
        };
    }
    
    // Запускаем после загрузки
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();