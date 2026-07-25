class LicenseManager {
    static PRO_KEY_PREFIX = 'CUTSY2-PRO-';
    static SESSION_KEY = 'cutsy_session_v3';
    static LICENSE_DAYS = 365;
    static CHECK_INTERVAL_DAYS = 0; // 🔐 Проверка при каждом запуске
    static GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx-NdSG4lUh1oqnK6s-wmxmgaC7ns4bmokyN9J7C6Ws0yYXkrQ-fuqev91Uhg-qiKXukw/exec';
    static TELEGRAM_BOT_TOKEN = '8526541616:AAEwEZzd4jrwjNgiSqwjLUR_c8GyGTrfPiE';
    static TELEGRAM_CHAT_ID = '358002688';

    // 🔐 Fingerprint кэш
    static _deviceTokenCache = null;
    static _fingerprintVersion = 'v2.6';

    static async initEmailJS() {
        if (typeof emailjs !== 'undefined') {
            try {
                emailjs.init(this.EMAILJS_PUBLIC_KEY);
                console.log('✅ EmailJS инициализирован');
            } catch (error) {
                console.error('❌ EmailJS инициализация не удалась:', error);
            }
        }
    }

    static async sendAdminNotification(userEmail, licenseType) {
        try {
            const tariffInfo = licenseType ? `\n📅 Тариф: *${licenseType}*` : '';
            const text = `🔔 *Новая регистрация в Cutsy CAD PRO*\n\n📧 Пользователь: \`${userEmail}\`${tariffInfo}\n📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n⏳ Ожидает активации ключа.`;
            
            const response = await fetch(`https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.TELEGRAM_CHAT_ID,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('Telegram API error:', error);
                return false;
            }

            console.log('✅ Telegram: уведомление админу отправлено');
            return true;
        } catch (error) {
            console.error('❌ Telegram ошибка:', error);
            return false;
        }
    }

    static async sendAdminNotificationWithKey(userEmail, licenseKey, licenseType) {
        try {
            const tariffInfo = licenseType ? `\n📅 Тариф: *${licenseType}*` : '';
            const text = `🔔 *Новая регистрация в Cutsy CAD PRO*\n\n📧 Пользователь: \`${userEmail}\`\n🔑 Ключ: \`${licenseKey}\`${tariffInfo}\n📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n✉️ Отправьте ключ клиенту.`;
            
            const response = await fetch(`https://api.telegram.org/bot${this.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: this.TELEGRAM_CHAT_ID,
                    text: text,
                    parse_mode: 'Markdown'
                })
            });

            if (!response.ok) {
                const error = await response.text();
                console.error('Telegram API error:', error);
                return false;
            }

            console.log('✅ Telegram: уведомление с ключом админу отправлено');
            return true;
        } catch (error) {
            console.error('❌ Telegram ошибка:', error);
            return false;
        }
    }

    static getSession() {
        try {
            const raw = localStorage.getItem(this.SESSION_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    static saveSession(session) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    }

    static isTrial() {
        return false;
    }

    static isTrialExpired() {
        return false;
    }

    static canExportDXF() {
        if (this.isTrial()) return false;
        return this.isPro();
    }

    static getNestingCount() {
        const key = 'cutsy_nesting_count';
        const raw = localStorage.getItem(key);
        return raw ? parseInt(raw, 10) || 0 : 0;
    }

    static incrementNestingCount() {
        const key = 'cutsy_nesting_count';
        const count = this.getNestingCount() + 1;
        localStorage.setItem(key, count.toString());
        return count;
    }

    static resetNestingCount() {
        localStorage.removeItem('cutsy_nesting_count');
    }

    static canUse(feature, currentValue) {
        // Все функции доступны — программа бесплатная
        return true;
    }

    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    }

    static isLoggedIn() {
        const session = this.getSession();
        return !!(session && session.email && session.loggedInAt);
    }

    static isPro() {
        return true;
    }

    static getDaysLeft() {
        const session = this.getSession();
        if (!session || !session.expiresAt) return 0;
        const msLeft = new Date(session.expiresAt) - Date.now();
        if (msLeft <= 0) return 0;
        return Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    }

    static getExpirationDate() {
        const session = this.getSession();
        if (!session || !session.expiresAt) return null;
        return new Date(session.expiresAt);
    }

    static get CHECK_INTERVAL_DAYS() {
        return 2;  // Проверка сервера каждые 2 дня
    }

    static shouldCheckServer(session) {
        // 🔐 Проверка при каждом запуске (CHECK_INTERVAL_DAYS = 0)
        if (this.CHECK_INTERVAL_DAYS === 0) return true;
        if (!session || !session.lastCheck) return true;
        const lastCheck = new Date(session.lastCheck);
        const now = new Date();
        const diffMs = now - lastCheck;
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays >= this.CHECK_INTERVAL_DAYS;
    }

    static getLicenseInfo() {
        const session = this.getSession();
        if (!session) return null;
        return {
            email: session.email,
            hasLicense: !!session.licenseKey,
            licenseKey: session.licenseKey ? session.licenseKey.substring(0, 12) + '••••' : null,
            activatedAt: session.activatedAt ? new Date(session.activatedAt).toLocaleDateString() : null,
            expiresAt: session.expiresAt ? new Date(session.expiresAt).toLocaleDateString() : null,
            daysLeft: this.getDaysLeft(),
            isExpired: session.isExpired || false
        };
    }

    static async ping() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 сек
            const response = await fetch(this.GOOGLE_SCRIPT_URL, {
                method: 'GET',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                return { ok: true, status: data.status, message: data.message };
            } catch (e) {
                return { ok: false, error: 'Server returned non-JSON', preview: text.substring(0, 100) };
            }
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    static async apiCall(action, data) {
        if (this.GOOGLE_SCRIPT_URL.includes('ВАШ_ID')) {
            throw new Error('License server not configured');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            // Отправляем как text/plain чтобы избежать CORS preflight
            const response = await fetch(this.GOOGLE_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ ...data, action }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' ' + response.statusText);
            }

            const text = await response.text();
            if (!text || !text.trim()) {
                throw new Error('Empty response from server');
            }

            try {
                return JSON.parse(text);
            } catch (parseError) {
                console.error('Server returned non-JSON:', text.substring(0, 200));
                throw new Error('Server returned invalid JSON. Check deployment URL.');
            }
        } catch (error) {
            clearTimeout(timeoutId);
            console.error('API call failed:', action, error.message);
            throw error;
        }
    }

    // 🔐 Усиленный fingerprint (Canvas + WebGL + Audio)
    static async getDeviceToken() {
        if (this._deviceTokenCache) return this._deviceTokenCache;
        
        try {
            const components = [];
            
            // 1. Базовые данные
            components.push(navigator.userAgent);
            components.push(screen.width + 'x' + screen.height);
            components.push(screen.colorDepth);
            components.push(navigator.language);
            components.push(new Date().getTimezoneOffset());
            components.push(navigator.hardwareConcurrency || 'unknown');
            components.push(navigator.deviceMemory || 'unknown');
            
            // 2. Canvas fingerprint
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('Cutsy CAD ' + this._fingerprintVersion, 2, 2);
                components.push(canvas.toDataURL());
            } catch (e) {
                components.push('canvas_error');
            }
            
            // 3. WebGL fingerprint
            try {
                const gl = document.createElement('canvas').getContext('webgl');
                if (gl) {
                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                    if (debugInfo) {
                        components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
                        components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
                    }
                    components.push(gl.getParameter(gl.VERSION));
                    components.push(gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
                }
            } catch (e) {
                components.push('webgl_error');
            }
            
            // 4. Audio fingerprint
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    const ctx = new AudioContext();
                    const oscillator = ctx.createOscillator();
                    const analyser = ctx.createAnalyser();
                    const gain = ctx.createGain();
                    const compressor = ctx.createDynamicsCompressor();
                    
                    oscillator.connect(analyser);
                    analyser.connect(gain);
                    gain.connect(compressor);
                    compressor.connect(ctx.destination);
                    
                    oscillator.type = 'triangle';
                    oscillator.frequency.value = 10000;
                    gain.gain.value = 0.1;
                    
                    oscillator.start(0);
                    ctx.resume();
                    
                    const data = new Float32Array(analyser.frequencyBinCount);
                    analyser.getFloatFrequencyData(data);
                    components.push(data.slice(0, 10).join(','));
                    
                    oscillator.stop(ctx.currentTime + 0.1);
                }
            } catch (e) {
                components.push('audio_error');
            }
            
            // 5. Хэширование
            const data = components.join('|');
            let hash = 0;
            for (let i = 0; i < data.length; i++) {
                hash = ((hash << 5) - hash) + data.charCodeAt(i);
                hash |= 0;
            }
            
            this._deviceTokenCache = Math.abs(hash).toString(16).substring(0, 12);
            return this._deviceTokenCache;
            
        } catch (e) {
            console.error('Fingerprint error:', e);
            this._deviceTokenCache = 'unknown_' + Date.now().toString(16);
            return this._deviceTokenCache;
        }
    }

    // 🔐 Синхронная версия для login()
    static getDeviceTokenSync() {
        try {
            const data = [
                navigator.userAgent,
                screen.width + 'x' + screen.height,
                screen.colorDepth,
                navigator.language,
                new Date().getTimezoneOffset(),
                navigator.hardwareConcurrency || 'unknown',
                navigator.deviceMemory || 'unknown'
            ].join('|');
            let hash = 0;
            for (let i = 0; i < data.length; i++) {
                hash = ((hash << 5) - hash) + data.charCodeAt(i);
                hash |= 0;
            }
            return Math.abs(hash).toString(16).substring(0, 8);
        } catch (e) {
            return 'unknown';
        }
    }

    static async login(email, password) {
        if (!email || !password) {
            return { success: false, message: '❌ Введите email и пароль' };
        }
        try {
            const deviceToken = this.getDeviceTokenSync();
            console.log('📋 login: deviceToken =', deviceToken);
            const result = await this.apiCall('login', { email, password, deviceToken: deviceToken });
            console.log('📋 login: result =', result);
            if (result.status === 'ok') {
                const session = {
                    email: result.email,
                    sessionToken: result.sessionToken,
                    loggedInAt: Date.now(),
                    licenseKey: result.licenseKey || null,
                    hasLicense: result.hasLicense || false,
                    activatedAt: result.activatedAt || null,
                    expiresAt: result.expiresAt || null,
                    isExpired: result.isExpired || false,
                    deviceCount: result.deviceCount || 0,
                    maxDevices: result.maxDevices || 1,
                    isTrial: result.isTrial || false,
                    lastCheck: new Date().toISOString()
                };
                this.saveSession(session);
                return { success: true, message: result.message, hasLicense: result.hasLicense, isExpired: result.isExpired, deviceCount: result.deviceCount, maxDevices: result.maxDevices, isTrial: result.isTrial };
            } else {
                return { success: false, message: result.message || '❌ Ошибка входа', deviceLimit: result.deviceLimit, currentDevices: result.currentDevices, maxDevices: result.maxDevices };
            }
        } catch (error) {
            console.error('Login error:', error);
            const session = this.getSession();
            if (session && session.email === email) {
                return { success: true, message: '✅ Вход выполнен (offline)', offline: true, hasLicense: session.hasLicense, isExpired: session.isExpired };
            }
            return { success: false, message: '❌ ' + (error.message || 'Ошибка соединения с сервером') };
        }
    }

    static async activateLicense(licenseKey) {
        const session = this.getSession();
        if (!session || !session.email) {
            return { success: false, message: '❌ Сначала войдите в систему' };
        }
        if (!licenseKey) {
            return { success: false, message: '❌ Введите лицензионный ключ' };
        }
        try {
            const result = await this.apiCall('activate-license', { email: session.email, licenseKey });
            if (result.status === 'ok') {
                session.licenseKey = licenseKey;
                session.hasLicense = true;
                session.activatedAt = result.activatedAt;
                session.expiresAt = result.expiresAt;
                session.isExpired = false;
                session.lastCheck = new Date().toISOString();  // ← Дата активации = дата проверки
                this.saveSession(session);
                return { success: true, message: result.message, daysLeft: result.daysLeft, expiresAt: result.expiresAt };
            } else {
                return { success: false, message: result.message || '❌ Ошибка активации' };
            }
        } catch (error) {
            console.error('Activate license error:', error);
            return { success: false, message: '❌ ' + (error.message || 'Ошибка соединения с сервером') };
        }
    }

    static async checkLicense() {
        // Проверка отключена — программа бесплатная
        return { hasLicense: true, isExpired: false, daysLeft: 9999, maxDevices: 99, isTrial: false };
    }

    static logout() {
        this.clearSession();
        return { success: true, message: '✅ Выход выполнен' };
    }

    static async removeDevice() {
        const session = this.getSession();
        if (!session || !session.email) {
            return { success: false, message: '❌ Сначала войдите в систему' };
        }
        try {
            const result = await this.apiCall('remove-device', { email: session.email, deviceToken: this.getDeviceToken() });
            if (result.status === 'ok') {
                // Обновляем сессию
                session.deviceCount = result.remainingDevices || 0;
                this.saveSession(session);
                return { success: true, message: result.message, remainingDevices: result.remainingDevices };
            } else {
                return { success: false, message: result.message || '❌ Ошибка удаления' };
            }
        } catch (error) {
            console.error('Remove device error:', error);
            return { success: false, message: '❌ ' + (error.message || 'Ошибка соединения с сервером') };
        }
    }

    static canUse(feature, currentValue) {
        // Все функции доступны — программа бесплатная
        return true;
    }

    static showUpgradeModal(feature) {
        // Модальное окно апгрейда отключено — программа бесплатная
        return;
    }
}

window.LicenseManager = LicenseManager;

// ═══════════════════════════════════════════════════════════
// ПЕРИОДИЧЕСКАЯ ПРОВЕРКА ЛИЦЕНЗИИ — ОТКЛЮЧЕНА
// Программа бесплатная, проверка не требуется.
// ═════════════════════════════════════════════════════════==
