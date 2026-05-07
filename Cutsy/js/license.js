class LicenseManager {
    static PRO_KEY_PREFIX = 'CUTSY2-PRO-';
    static SESSION_KEY = 'cutsy_session_v3';
    static LICENSE_DAYS = 365;
    static GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzJ09bbUsXlr051NXXJvXJiur-jQSXhUArtjnbybD0gDH85d6Yvo0NAoOCLT0iaaTLr/exec';
    static EMAILJS_PUBLIC_KEY = '6qHNX-RQ7mR40FM19';
    static EMAILJS_SERVICE_ID = 'service_sxy6r81';
    static EMAILJS_TEMPLATE_ID = 'template_bax3azf';
    static EMAILJS_ADMIN_TEMPLATE_ID = 'template_5smm3fj';
    static TELEGRAM_BOT_TOKEN = '8526541616:AAEwEZzd4jrwjNgiSqwjLUR_c8GyGTrfPiE';
    static TELEGRAM_CHAT_ID = '358002688';

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

    static async sendWelcomeEmail(userEmail) {
        if (!userEmail) {
            console.error('sendWelcomeEmail: email не указан');
            return false;
        }
        try {
            const templateParams = {
                to_email: userEmail,
                user_email: userEmail
            };
            await emailjs.send(this.EMAILJS_SERVICE_ID, this.EMAILJS_TEMPLATE_ID, templateParams);
            console.log('✅ EmailJS: письмо отправлено на', userEmail);
            return true;
        } catch (error) {
            console.error('❌ EmailJS ошибка:', error);
            return false;
        }
    }

    static async sendAdminNotification(userEmail) {
        try {
            const text = `🔔 *Новая регистрация в Cutsy CAD PRO*\n\n📧 Пользователь: \`${userEmail}\`\n📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n⏳ Ожидает активации ключа.`;
            
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

    static async sendAdminNotificationWithKey(userEmail, licenseKey) {
        try {
            const text = `🔔 *Новая регистрация в Cutsy CAD PRO*\n\n📧 Пользователь: \`${userEmail}\`\n🔑 Ключ: \`${licenseKey}\`\n📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n✉️ Отправьте ключ клиенту.`;
            
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

    static clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
    }

    static isLoggedIn() {
        const session = this.getSession();
        return !!(session && session.email && session.loggedInAt);
    }

    static isPro() {
        const session = this.getSession();
        if (!session) return false;
        if (!session.licenseKey) return false;
        // Проверяем срок локально (даже без серверной проверки)
        if (session.expiresAt) {
            const expired = new Date(session.expiresAt) < new Date();
            if (expired) {
                session.isExpired = true;
                this.saveSession(session);
                return false;
            }
        }
        if (session.isExpired) return false;
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
        return 7;
    }

    static shouldCheckServer(session) {
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
            const timeoutId = setTimeout(() => controller.abort(), 10000);
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

    static async register(email, password) {
        if (!email || !password) {
            return { success: false, message: '❌ Введите email и пароль' };
        }
        if (password.length < 6) {
            return { success: false, message: '❌ Пароль минимум 6 символов' };
        }
        try {
            const result = await this.apiCall('register', { email, password });
            console.log('📋 Register result:', result);  // ← ОТЛАДКА
            if (result.status === 'ok') {
                // Сохраняем сессию после регистрации
                const session = {
                    email: email,
                    sessionToken: null,
                    loggedInAt: Date.now(),
                    licenseKey: null,
                    hasLicense: false,
                    activatedAt: null,
                    expiresAt: null,
                    isExpired: false,
                    deviceCount: 0,
                    maxDevices: 1,
                    lastCheck: new Date().toISOString()
                };
                this.saveSession(session);
                
                // Отправляем приветственное письмо через EmailJS
                await this.sendWelcomeEmail(email);
                // Отправляем уведомление админу с ключом через Telegram
                console.log('📋 licenseKey from server:', result.licenseKey);  // ← ОТЛАДКА
                if (result.licenseKey) {
                    await this.sendAdminNotificationWithKey(email, result.licenseKey);
                } else {
                    await this.sendAdminNotification(email);
                }
                return { success: true, message: result.message };
            } else {
                return { success: false, message: result.message || '❌ Ошибка регистрации' };
            }
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, message: '❌ ' + (error.message || 'Ошибка соединения с сервером') };
        }
    }

    static getDeviceToken() {
        try {
            const data = [
                navigator.userAgent,
                screen.width + 'x' + screen.height,
                screen.colorDepth,
                navigator.language,
                new Date().getTimezoneOffset()
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
            const deviceToken = this.getDeviceToken();
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
                    lastCheck: new Date().toISOString()  // ← Дата входа = дата проверки
                };
                this.saveSession(session);
                return { success: true, message: result.message, hasLicense: result.hasLicense, isExpired: result.isExpired, deviceCount: result.deviceCount, maxDevices: result.maxDevices };
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
        const session = this.getSession();
        if (!session || !session.email || !session.licenseKey) {
            return { hasLicense: false, isExpired: true };
        }
        // Проверяем срок по localStorage
        if (session.expiresAt) {
            const expired = new Date(session.expiresAt) < new Date();
            if (expired) {
                session.isExpired = true;
                this.saveSession(session);
                return { hasLicense: true, isExpired: true, daysLeft: 0 };
            }
        }
        // Если проверка была менее 7 дней назад — не нагружаем сервер
        if (!this.shouldCheckServer(session)) {
            console.log('📅 Проверка пропущена (следующая через', this.CHECK_INTERVAL_DAYS, 'дней)');
            return {
                hasLicense: session.hasLicense,
                isExpired: session.isExpired,
                daysLeft: this.getDaysLeft(),
                maxDevices: session.maxDevices || 1,
                skipped: true
            };
        }
        // Проверяем на сервере
        try {
            const result = await this.apiCall('check-license', { email: session.email });
            if (result.status === 'ok') {
                session.hasLicense = result.hasLicense;
                session.isExpired = result.isExpired;
                session.expiresAt = result.expiresAt || null;
                session.maxDevices = result.maxDevices || session.maxDevices || 1;
                session.lastCheck = new Date().toISOString();  // ← Обновляем дату проверки
                this.saveSession(session);
                return { hasLicense: result.hasLicense, isExpired: result.isExpired, daysLeft: result.daysLeft || 0, maxDevices: result.maxDevices || 1 };
            }
        } catch (error) {
            console.error('Check license error:', error);
        }
        const expired = session.expiresAt ? new Date(session.expiresAt) < new Date() : true;
        return { hasLicense: !!session.licenseKey, isExpired: expired, daysLeft: this.getDaysLeft() };
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
        if (this.isPro()) return true;
        const limits = { maxParts: 30, allowDxfExport: false, allowPricing: false, allowAutoNesting: false };
        switch (feature) {
            case 'addPart': return (currentValue || 0) < limits.maxParts;
            case 'exportDxf': return limits.allowDxfExport;
            case 'setCustomPrice': return limits.allowPricing;
            case 'autoNesting': return limits.allowAutoNesting;
            default: return true;
        }
    }

    static showUpgradeModal(feature) {
        const msgs = {
            addPart: '📦 Лимит 30 деталей.',
            exportDxf: '🔧 Экспорт DXF — только PRO.',
            setCustomPrice: '💰 Цены — только PRO.',
            autoNesting: '⚡ Авто-раскладка — только PRO.'
        };
        const m = document.createElement('div');
        m.className = 'lic-modal';
        m.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;font-family:sans-serif;';
        m.innerHTML = '<div style="background:#1a1a2e;color:#fff;padding:28px;border-radius:16px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.5);border:1px solid #333;"><h3 style="margin:0 0 18px;color:#00d4aa;font-size:20px;">✨ PRO-версия</h3><p style="margin:0 0 20px;line-height:1.5;color:#ccc;">' + (msgs[feature] || 'Эта функция доступна в PRO.') + '</p><ul style="margin:0 0 24px 18px;padding:0;line-height:1.7;color:#ddd;font-size:14px;"><li>✅ Неограниченные детали</li><li>✅ Экспорт DXF/PDF</li><li>✅ Настройка цен</li><li>✅ Авто-раскладка NFP</li><li>✅ Поддержка 7 дней</li></ul><div style="display:flex;gap:12px;"><button id="lic-buy" style="flex:1;padding:12px;background:#00d4aa;color:#000;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;">💬 Купить PRO</button><button id="lic-later" style="flex:1;padding:12px;background:#333;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;">Позже</button></div></div>';
        document.body.appendChild(m);
        document.getElementById('lic-buy').onclick = () => { window.open('https://t.me/SilikinK', '_blank'); };
        document.getElementById('lic-later').onclick = () => m.remove();
        m.onclick = (e) => { if (e.target === m) m.remove(); };
    }
}

window.LicenseManager = LicenseManager;

// ═══════════════════════════════════════════════════════════
// ПЕРИОДИЧЕСКАЯ ПРОВЕРКА ЛИЦЕНЗИИ (каждые 24 часа)
// ═══════════════════════════════════════════════════════════

setInterval(() => {
    const session = LicenseManager.getSession();
    if (session && session.email && session.licenseKey) {
        console.log('⏰ Периодическая проверка лицензии...');
        LicenseManager.checkLicense().then(result => {
            if (result.isExpired) {
                console.warn('⏰ Лицензия истекла!');
            } else if (result.skipped) {
                console.log('⏰ Проверка пропущена (следующая через', LicenseManager.CHECK_INTERVAL_DAYS, 'дней)');
            } else {
                console.log('⏰ Лицензия проверена, осталось', result.daysLeft, 'дней');
            }
        }).catch(err => {
            console.error('⏰ Ошибка периодической проверки:', err);
        });
    }
}, 24 * 60 * 60 * 1000); // 24 часа
