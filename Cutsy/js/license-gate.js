/**
 * ═══════════════════════════════════════════════════════════════
 * CUTSY LICENSE GATE v3.0 — Account-Based Auth UI
 * ═══════════════════════════════════════════════════════════════
 * 
 * Экраны: Регистрация → Логин → Активация ключа
 * Без fingerprint, работает через VPN
 */

(function() {
    'use strict';

    const STYLE_ID = 'license-gate-styles';

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .lic-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%);
                display: flex; align-items: center; justify-content: center;
                z-index: 99999; font-family: 'Segoe UI', sans-serif;
            }
            .lic-card {
                background: rgba(26, 26, 46, 0.95);
                border: 1px solid #333; border-radius: 16px;
                padding: 40px; width: 100%; max-width: 420px;
                box-shadow: 0 25px 80px rgba(0,0,0,0.6);
                backdrop-filter: blur(10px);
            }
            .lic-card h2 {
                color: #00d4aa; margin: 0 0 8px 0; font-size: 24px;
                text-align: center;
            }
            .lic-card .subtitle {
                color: #888; text-align: center; margin-bottom: 28px;
                font-size: 13px;
            }
            .lic-input-group {
                margin-bottom: 16px;
            }
            .lic-input-group label {
                display: block; color: #aaa; font-size: 12px;
                margin-bottom: 6px; text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .lic-input-group input {
                width: 100%; padding: 12px 14px; background: #0f0f1a;
                border: 1px solid #333; border-radius: 8px; color: #fff;
                font-size: 14px; box-sizing: border-box;
                transition: border-color 0.2s;
            }
            .lic-input-group input:focus {
                outline: none; border-color: #00d4aa;
            }
            .lic-btn {
                width: 100%; padding: 14px; border: none; border-radius: 8px;
                font-size: 14px; font-weight: 600; cursor: pointer;
                transition: all 0.2s; margin-top: 8px;
            }
            .lic-btn-primary {
                background: #00d4aa; color: #000;
            }
            .lic-btn-primary:hover {
                background: #00b894;
            }
            .lic-btn-secondary {
                background: transparent; color: #888;
                border: 1px solid #333;
            }
            .lic-btn-secondary:hover {
                border-color: #555; color: #aaa;
            }
            .lic-status {
                text-align: center; margin-top: 16px;
                font-size: 13px; min-height: 20px;
            }
            .lic-status.error { color: #ff6b6b; }
            .lic-status.success { color: #00d4aa; }
            .lic-status.loading { color: #aaa; }
            .lic-divider {
                display: flex; align-items: center;
                margin: 20px 0; color: #555; font-size: 12px;
            }
            .lic-divider::before, .lic-divider::after {
                content: ''; flex: 1; height: 1px; background: #333;
            }
            .lic-divider span { padding: 0 12px; }
            .lic-link {
                color: #00d4aa; cursor: pointer; text-decoration: underline;
                font-size: 13px;
            }
            .lic-link:hover { color: #00b894; }
            .lic-footer {
                text-align: center; margin-top: 20px;
                color: #555; font-size: 12px;
            }
            .lic-user-info {
                background: rgba(0, 212, 170, 0.1);
                border: 1px solid rgba(0, 212, 170, 0.2);
                border-radius: 8px; padding: 16px;
                margin-bottom: 20px; text-align: center;
            }
            .lic-user-info .email {
                color: #00d4aa; font-weight: 600; font-size: 14px;
            }
            .lic-user-info .license-status {
                color: #aaa; font-size: 12px; margin-top: 4px;
            }
            .lic-key-display {
                background: #0f0f1a; border: 1px dashed #333;
                border-radius: 8px; padding: 12px;
                font-family: monospace; font-size: 13px;
                color: #00d4aa; text-align: center;
                margin: 12px 0; word-break: break-all;
            }
        `;
        document.head.appendChild(style);
    }

    function createOverlay() {
        injectStyles();
        const overlay = document.createElement('div');
        overlay.id = 'licenseGateOverlay';
        overlay.className = 'lic-overlay';
        return overlay;
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКРАН ЛОГИНА
    // ═══════════════════════════════════════════════════════════

    function showLoginScreen(overlay, message) {
        const session = LicenseManager.getSession();
        if (session && session.email) {
            // Уже залогинен — показываем экран активации или dashboard
            if (session.hasLicense && !session.isExpired) {
                overlay.remove();
                return;
            }
            showLicenseScreen(overlay, session.email);
            return;
        }

        overlay.innerHTML = `
            <div class="lic-card">
                <h2>🔐 Вход в систему</h2>
                <p class="subtitle">Войдите в свой аккаунт для доступа к программе</p>
                
                <div class="lic-input-group">
                    <label>Email</label>
                    <input type="email" id="licEmail" placeholder="your@email.com" autocomplete="email">
                </div>
                
                <div class="lic-input-group">
                    <label>Пароль</label>
                    <input type="password" id="licPassword" placeholder="Минимум 6 символов" autocomplete="current-password">
                </div>
                
                <button class="lic-btn lic-btn-primary" id="licLoginBtn">Войти</button>
                
                <div class="lic-divider"><span>или</span></div>
                
                <button class="lic-btn lic-btn-secondary" id="licRegisterBtn">Создать аккаунт</button>
                
                <div class="lic-status" id="licStatus">${message || ''}</div>
                
                <div class="lic-footer">
                    Нет лицензии? <span class="lic-link" id="licBuyLink">Купить PRO</span>
                </div>
            </div>
        `;

        document.getElementById('licLoginBtn').addEventListener('click', handleLogin);
        document.getElementById('licRegisterBtn').addEventListener('click', () => showRegisterScreen(overlay));
        document.getElementById('licBuyLink').addEventListener('click', () => {
            window.open('https://t.me/SilikinK', '_blank');
        });

        // Enter для входа
        document.getElementById('licPassword').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        
        // Сообщение для новых пользователей
        if (message) {
            const status = document.getElementById('licStatus');
            status.className = 'lic-status success';
            status.textContent = message;
        }
    }

    async function handleLogin() {
        const email = document.getElementById('licEmail').value.trim();
        const password = document.getElementById('licPassword').value;
        const status = document.getElementById('licStatus');
        const btn = document.getElementById('licLoginBtn');

        if (!email || !password) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите email и пароль';
            return;
        }

        btn.disabled = true;
        btn.style.opacity = '0.6';
        status.className = 'lic-status loading';
        status.textContent = '⏳ Вход...';

        const result = await LicenseManager.login(email, password);

        if (result.success) {
            status.className = 'lic-status success';
            status.textContent = result.message;
            
            setTimeout(() => {
                if (result.hasLicense && !result.isExpired) {
                    window.location.reload();
                } else {
                    showLicenseScreen(document.getElementById('licenseGateOverlay'), email);
                }
            }, 800);
        } else {
            status.className = 'lic-status error';
            const maxDevices = result.maxDevices || 1;
            if (result.deviceLimit) {
                status.innerHTML = result.message + '<br><span class="lic-link" id="removeDeviceLink">🗑️ Удалить старое устройство</span>';
                document.getElementById('removeDeviceLink').addEventListener('click', async () => {
                    status.className = 'lic-status loading';
                    status.textContent = '⏳ Удаление...';
                    const removeResult = await LicenseManager.removeDevice();
                    if (removeResult.success) {
                        status.className = 'lic-status success';
                        status.textContent = removeResult.message + '. Попробуйте войти снова.';
                    } else {
                        status.className = 'lic-status error';
                        status.textContent = removeResult.message;
                    }
                });
            } else {
                status.textContent = result.message;
            }
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКРАН РЕГИСТРАЦИИ
    // ═══════════════════════════════════════════════════════════

    function showRegisterScreen(overlay) {
        overlay.innerHTML = `
            <div class="lic-card">
                <h2>📝 Регистрация</h2>
                <p class="subtitle">Создайте аккаунт для активации лицензии</p>
                
                <div class="lic-input-group">
                    <label>Email</label>
                    <input type="email" id="licRegEmail" placeholder="your@email.com" autocomplete="email">
                </div>
                
                <div class="lic-input-group">
                    <label>Пароль</label>
                    <input type="password" id="licRegPassword" placeholder="Минимум 6 символов" autocomplete="new-password">
                </div>
                
                <div class="lic-input-group">
                    <label>Повторите пароль</label>
                    <input type="password" id="licRegPassword2" placeholder="Повторите пароль" autocomplete="new-password">
                </div>
                
                <button class="lic-btn lic-btn-primary" id="licRegBtn">Зарегистрироваться</button>
                
                <div class="lic-divider"><span>или</span></div>
                
                <button class="lic-btn lic-btn-secondary" id="licBackToLogin">Уже есть аккаунт</button>
                
                <div class="lic-status" id="licRegStatus"></div>
            </div>
        `;

        document.getElementById('licRegBtn').addEventListener('click', handleRegister);
        document.getElementById('licBackToLogin').addEventListener('click', () => showLoginScreen(overlay));
        
        document.getElementById('licRegPassword2').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleRegister();
        });
    }

    async function handleRegister() {
        const email = document.getElementById('licRegEmail').value.trim();
        const password = document.getElementById('licRegPassword').value;
        const password2 = document.getElementById('licRegPassword2').value;
        const status = document.getElementById('licRegStatus');
        const btn = document.getElementById('licRegBtn');

        if (!email || !password) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите email и пароль';
            return;
        }
        
        if (password !== password2) {
            status.className = 'lic-status error';
            status.textContent = '❌ Пароли не совпадают';
            return;
        }

        btn.disabled = true;
        btn.style.opacity = '0.6';
        status.className = 'lic-status loading';
        status.textContent = '⏳ Регистрация...';

        const result = await LicenseManager.register(email, password);

        if (result.success) {
            status.className = 'lic-status success';
            status.textContent = result.message;
            setTimeout(() => {
                // После регистрации сразу показываем экран ввода ключа
                showLicenseScreen(document.getElementById('licenseGateOverlay'), email);
            }, 1500);
        } else {
            status.className = 'lic-status error';
            status.textContent = result.message;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКРАН АКТИВАЦИИ ЛИЦЕНЗИИ
    // ═══════════════════════════════════════════════════════════

    function showLicenseScreen(overlay, email) {
        const session = LicenseManager.getSession();
        const hasLicense = session && session.hasLicense && !session.isExpired;
        const daysLeft = LicenseManager.getDaysLeft();
        const maxDevices = session && session.maxDevices ? session.maxDevices : 1;
        
        if (hasLicense) {
            overlay.remove();
            return;
        }
        
        overlay.innerHTML = `
            <div class="lic-card">
                <h2>🔑 Активация лицензии</h2>
                <p class="subtitle">Введите лицензионный ключ для активации PRO</p>
                
                <div class="lic-user-info">
                    <div class="email">👤 ${email}</div>
                    <div class="license-status">${hasLicense ? '✅ Лицензия активна' : '❌ Нет активной лицензии'}</div>
                </div>
                
                <div class="lic-input-group">
                    <label>Лицензионный ключ</label>
                    <input type="text" id="licKeyInput" placeholder="CUTSY2-PRO-XXXX-XXXX-XXXX-XXXX-XXXXXXXX" autocomplete="off">
                </div>
                
                <button class="lic-btn lic-btn-primary" id="licActivateBtn">Активировать</button>
                
                <div class="lic-divider"><span>или</span></div>
                
                <button class="lic-btn lic-btn-secondary" id="licLogoutBtn">Выйти из аккаунта</button>
                
                <div class="lic-divider"><span>устройства</span></div>
                
                <button class="lic-btn lic-btn-secondary" id="licRemoveDeviceBtn" style="font-size:12px;">🗑️ Удалить это устройство</button>
                <p id="licMaxDevices" style="color:#555;font-size:11px;text-align:center;margin:0;">Максимум ${maxDevices} устройства</p>
                
                <div class="lic-status" id="licActivateStatus"></div>
                
                <div class="lic-footer">
                    Нет ключа? <span class="lic-link" id="licBuyLink2">Купить PRO</span>
                </div>
            </div>
        `;

        document.getElementById('licActivateBtn').addEventListener('click', handleActivate);
        document.getElementById('licLogoutBtn').addEventListener('click', () => {
            LicenseManager.logout();
            showLoginScreen(overlay, '✅ Выход выполнен');
        });
        document.getElementById('licRemoveDeviceBtn').addEventListener('click', async () => {
            const status = document.getElementById('licActivateStatus');
            status.className = 'lic-status loading';
            status.textContent = '⏳ Удаление...';
            const result = await LicenseManager.removeDevice();
            if (result.success) {
                status.className = 'lic-status success';
                status.textContent = result.message;
                LicenseManager.logout();
                setTimeout(() => {
                    showLoginScreen(overlay, '✅ Устройство удалено. Войдите снова.');
                }, 1500);
            } else {
                status.className = 'lic-status error';
                status.textContent = result.message;
            }
        });
        document.getElementById('licBuyLink2').addEventListener('click', () => {
            window.open('https://t.me/SilikinK', '_blank');
        });

        document.getElementById('licKeyInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleActivate();
        });
    }

    async function handleActivate() {
        const key = document.getElementById('licKeyInput').value.trim();
        const status = document.getElementById('licActivateStatus');
        const btn = document.getElementById('licActivateBtn');

        if (!key) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите лицензионный ключ';
            return;
        }

        btn.disabled = true;
        btn.style.opacity = '0.6';
        status.className = 'lic-status loading';
        status.textContent = '⏳ Активация...';

        const result = await LicenseManager.activateLicense(key);

        if (result.success) {
            status.className = 'lic-status success';
            status.textContent = `${result.message} (${result.daysLeft} дней)`;
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            status.className = 'lic-status error';
            status.textContent = result.message;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ПРОВЕРКА ПРИ ЗАПУСКЕ
    // ═══════════════════════════════════════════════════════════

    async function checkAndShowGate() {
        // Проверяем сессию
        const session = LicenseManager.getSession();
        
        if (session && session.email) {
            // Проверяем лицензию
            const check = await LicenseManager.checkLicense();
            
            if (check.hasLicense && !check.isExpired) {
                // Всё ок, показываем программу
                return;
            }
        }

        // Показываем gate
        const overlay = createOverlay();
        document.body.appendChild(overlay);
        
        // Проверяем связь с сервером
        const pingResult = await LicenseManager.ping();
        if (!pingResult.ok) {
            console.error('License server unreachable:', pingResult);
            showLoginScreen(overlay, '⚠️ Сервер недоступен. Проверьте интернет или настройки.');
            return;
        }
        
        showLoginScreen(overlay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowGate);
    } else {
        checkAndShowGate();
    }
})();
