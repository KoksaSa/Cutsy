/**
 * ═══════════════════════════════════════════════════════════════
 * CUTSY LICENSE GATE v3.1 — Simplified Trial First
 * ═══════════════════════════════════════════════════════════════
 * 
 * Экраны: Выбор тарифа → (Пробный → сразу в программу) или (Покупка → форма)
 * Без обязательной регистрации для пробной версии
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
                padding: 40px; width: 100%; max-width: 500px;
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
            .lic-btn-free {
                background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
                color: #000;
                font-size: 16px;
                padding: 18px;
            }
            .lic-btn-free:hover {
                background: linear-gradient(135deg, #ffaa00 0%, #ff8800 100%);
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(255, 215, 0, 0.3);
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
            .lic-trial-info {
                background: rgba(255, 215, 0, 0.1);
                border: 1px solid rgba(255, 215, 0, 0.3);
                border-radius: 8px; padding: 16px;
                margin-bottom: 20px; text-align: center;
            }
            .lic-trial-info .title {
                color: #ffd700; font-weight: 600; font-size: 14px;
                margin-bottom: 8px;
            }
            .lic-trial-info .desc {
                color: #aaa; font-size: 12px; line-height: 1.5;
            }
            .lic-trial-features {
                background: rgba(0, 212, 170, 0.05);
                border: 1px solid rgba(0, 212, 170, 0.2);
                border-radius: 8px; padding: 16px;
                margin-bottom: 20px;
            }
            .lic-trial-features h4 {
                color: #00d4aa; font-size: 13px; margin: 0 0 12px 0;
                text-align: center;
            }
            .lic-trial-features ul {
                list-style: none; padding: 0; margin: 0;
            }
            .lic-trial-features li {
                color: #ccc; font-size: 12px; padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .lic-trial-features li:last-child { border-bottom: none; }
            .lic-trial-features li::before {
                content: '✓ '; color: #00d4aa; font-weight: bold;
            }
            .lic-trial-features li.limit {
                color: #ff6b6b;
            }
            .lic-trial-features li.limit::before {
                content: '⚠️ '; color: #ff6b6b;
            }
        `;
        document.head.appendChild(style);
    }

    function createOverlay() {
        injectStyles();
        // Удаляем pre-license overlay из index.html
        const preOverlay = document.getElementById('preLicenseOverlay');
        if (preOverlay) preOverlay.remove();
        
        const overlay = document.createElement('div');
        overlay.id = 'licenseGateOverlay';
        overlay.className = 'lic-overlay';
        return overlay;
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКРАН ВЫБОРА ТАРИФА (стартовый)
    // ═══════════════════════════════════════════════════════════

    function showTariffScreen(overlay) {
        overlay.innerHTML = `
            <div class="lic-card">
                <h2>✨ Cutsy CAD PRO</h2>
                <p class="subtitle">Выберите вариант использования</p>
                
                <div class="lic-trial-info">
                    <div class="title">🆓 Попробовать бесплатно</div>
                    <div class="desc">7 дней полного доступа без регистрации</div>
                </div>
                
                <button class="lic-btn lic-btn-free" id="licStartTrialBtn">
                    🚀 Начать пробный период
                </button>
                
                <div class="lic-divider"><span>или</span></div>
                
                <div class="lic-trial-features">
                    <h4>📋 Что включено в пробную версию:</h4>
                    <ul>
                        <li>Все инструменты рисования</li>
                        <li>Импорт DXF</li>
                        <li>Авто-раскладка (до 5 раз)</li>
                        <li>Экспорт PDF отчётов</li>
                        <li class="limit">Экспорт DXF раскладки — недоступен</li>
                        <li class="limit">Инструменты "Линия" и "Размер" — недоступны</li>
                    </ul>
                </div>
                
                <button class="lic-btn lic-btn-primary" id="licBuyProBtn">
                    💳 Купить PRO-версию
                </button>
                
                <div class="lic-status" id="licStatus"></div>
                
                <div class="lic-footer">
                    Уже есть лицензия? <span class="lic-link" id="licLoginLink">Войти</span>
                </div>
                
                <div class="lic-footer" style="margin-top:12px;font-size:10px;color:#666;">
                    <a href="privacy.html" style="color:#00d4aa;text-decoration:none;" target="_blank">🔒 Политика конфиденциальности</a> | 
                    <a href="terms.html" style="color:#00d4aa;text-decoration:none;" target="_blank">📋 Пользовательское соглашение</a>
                </div>
            </div>
        `;

        // Старт пробной версии
        document.getElementById('licStartTrialBtn').addEventListener('click', () => {
            startTrial(overlay);
        });

        // Покупка PRO → переход на форму регистрации
        document.getElementById('licBuyProBtn').addEventListener('click', () => {
            const formUrl = 'https://script.google.com/macros/s/AKfycbx-NdSG4lUh1oqnK6s-wmxmgaC7ns4bmokyN9J7C6Ws0yYXkrQ-fuqev91Uhg-qiKXukw/exec?action=form';
            window.open(formUrl, '_blank');
        });
        
        // Вход для тех, у кого уже есть лицензия
        document.getElementById('licLoginLink').addEventListener('click', () => {
            showLoginScreen(overlay);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // АКТИВАЦИЯ ПРОБНОЙ ВЕРСИИ
    // ═══════════════════════════════════════════════════════════

    function startTrial(overlay) {
        const status = document.getElementById('licStatus');
        status.className = 'lic-status loading';
        status.textContent = '⏳ Активация пробной версии...';

        // Создаём сессию пробной версии
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 дней
        
        const trialSession = {
            email: 'trial_' + Date.now(),
            isTrial: true,
            trialStartedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            loggedInAt: Date.now(),
            lastCheck: now.toISOString()
        };

        LicenseManager.saveSession(trialSession);

        status.className = 'lic-status success';
        status.textContent = '✅ Пробная версия активирована!';

        setTimeout(() => {
            overlay.remove();
            // Показываем уведомление о пробной версии
            showTrialBadge();
        }, 1000);
    }

    // ═══════════════════════════════════════════════════════════
    // ЭКРАН ЛОГИНА (для тех, у кого уже есть лицензия)
    // ═══════════════════════════════════════════════════════════

    function showLoginScreen(overlay, message) {
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
                
                <div class="lic-input-group">
                    <label>🔑 Лицензионный ключ</label>
                    <input type="text" id="licKeyInput" placeholder="CUTSY2-PRO-XXXX-XXXX-XXXX-XXXX-XXXXXXXX" autocomplete="off">
                </div>
                
                <button class="lic-btn lic-btn-primary" id="licLoginBtn">Войти</button>
                
                <div class="lic-divider"><span>или</span></div>
                
                <button class="lic-btn lic-btn-secondary" id="licBackBtn">← Назад</button>
                
                <div class="lic-status" id="licStatus">${message || ''}</div>
            </div>
        `;

        document.getElementById('licLoginBtn').addEventListener('click', handleLogin);
        document.getElementById('licBackBtn').addEventListener('click', () => {
            showTariffScreen(overlay);
        });

        // Enter для входа
        document.getElementById('licPassword').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
        document.getElementById('licKeyInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }

    async function handleLogin() {
        const email = document.getElementById('licEmail').value.trim();
        const password = document.getElementById('licPassword').value;
        const key = document.getElementById('licKeyInput').value.trim();
        const status = document.getElementById('licStatus');
        const btn = document.getElementById('licLoginBtn');

        if (!email || !password) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите email и пароль';
            return;
        }

        if (!key) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите лицензионный ключ';
            return;
        }
        
        btn.disabled = true;
        btn.style.opacity = '0.6';
        status.className = 'lic-status loading';
        status.textContent = '⏳ Вход и активация...';

        const result = await LicenseManager.login(email, password);

        if (result.success) {
            // Если лицензия уже активна — перезагружаем
            if (result.hasLicense && !result.isExpired) {
                status.className = 'lic-status success';
                status.textContent = result.message;
                setTimeout(() => {
                    window.location.reload();
                }, 800);
                return;
            }
            
            // Лицензии нет — активируем ключ
            status.className = 'lic-status loading';
            status.textContent = '⏳ Активация лицензии...';
            
            const activateResult = await LicenseManager.activateLicense(key);
            
            if (activateResult.success) {
                status.className = 'lic-status success';
                status.textContent = `✅ ${activateResult.message} (${activateResult.daysLeft} дней)`;
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                status.className = 'lic-status error';
                status.textContent = activateResult.message;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
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
    // ПОКАЗ БЕЙДЖА ПРОБНОЙ ВЕРСИИ
    // ═══════════════════════════════════════════════════════════

    function showTrialBadge() {
        const session = LicenseManager.getSession();
        if (session && session.isTrial) {
            // Создаём бейдж
            const badge = document.createElement('div');
            badge.id = 'trialBadge';
            badge.style.cssText = `
                position: fixed;
                top: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: linear-gradient(135deg, #ffd700 0%, #ffaa00 100%);
                color: #000;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                z-index: 9999;
                box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            
            const daysLeft = LicenseManager.getDaysLeft();
            badge.innerHTML = `
                <span>🆓 ПРОБНЫЙ ПЕРИОД</span>
                <span style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:10px;">${daysLeft} дн.</span>
                <span style="cursor:pointer;opacity:0.6;" onclick="this.parentElement.remove()">✕</span>
            `;
            
            document.body.appendChild(badge);
        }
    }

    async function handleLogin() {
        const email = document.getElementById('licEmail').value.trim();
        const password = document.getElementById('licPassword').value;
        const key = document.getElementById('licKeyInput').value.trim();
        const status = document.getElementById('licStatus');
        const btn = document.getElementById('licLoginBtn');

        if (!email || !password) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите email и пароль';
            return;
        }

        if (!key) {
            status.className = 'lic-status error';
            status.textContent = '❌ Введите лицензионный ключ';
            return;
        }
        
        btn.disabled = true;
        btn.style.opacity = '0.6';
        status.className = 'lic-status loading';
        status.textContent = '⏳ Вход и активация...';

        const result = await LicenseManager.login(email, password);

        if (result.success) {
            // Если лицензия уже активна — перезагружаем
            if (result.hasLicense && !result.isExpired) {
                status.className = 'lic-status success';
                status.textContent = result.message;
                setTimeout(() => {
                    window.location.reload();
                }, 800);
                return;
            }
            
            // Лицензии нет — активируем ключ
            status.className = 'lic-status loading';
            status.textContent = '⏳ Активация лицензии...';
            
            const activateResult = await LicenseManager.activateLicense(key);
            
            if (activateResult.success) {
                status.className = 'lic-status success';
                status.textContent = `✅ ${activateResult.message} (${activateResult.daysLeft} дней)`;
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                status.className = 'lic-status error';
                status.textContent = activateResult.message;
                btn.disabled = false;
                btn.style.opacity = '1';
            }
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
    // ПРОВЕРКА ПРИ ЗАПУСКЕ
    // ═══════════════════════════════════════════════════════════

    async function checkAndShowGate() {
        // Проверяем сессию
        const session = LicenseManager.getSession();
        
        // Если уже есть активная лицензия (не пробная) — пропускаем gate
        if (session && session.email && !session.isTrial) {
            const check = await LicenseManager.checkLicense();
            if (check.hasLicense && !check.isExpired) {
                // Всё ок, показываем программу
                return;
            }
        }

        // Если пробная версия ещё активна — пропускаем gate, но показываем бейдж
        if (session && session.isTrial) {
            const expired = session.expiresAt ? new Date(session.expiresAt) < new Date() : true;
            if (!expired) {
                showTrialBadge();
                return;
            }
        }

        // Показываем gate
        const overlay = createOverlay();
        document.body.appendChild(overlay);
        
        // Проверяем связь с сервером в фоне (не блокируем интерфейс)
        LicenseManager.ping().then(pingResult => {
            if (!pingResult.ok) {
                console.warn('License server unreachable:', pingResult);
            } else {
                console.log('License server is reachable');
            }
        }).catch(err => {
            console.warn('Ping error:', err);
        });
        
        // Показываем экран выбора тарифа
        showTariffScreen(overlay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndShowGate);
    } else {
        checkAndShowGate();
    }
})();
