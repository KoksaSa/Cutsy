// ═══════════════════════════════════════════════════════════
// account-ui.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

(function() {
    function createAccountUI() {
        const session = LicenseManager ? LicenseManager.getSession() : null;
        if (!session || !session.email) return;

        const existing = document.getElementById('accountUI');
        if (existing) existing.remove();

        const ui = document.createElement('div');
        ui.id = 'accountUI';
        ui.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(26,26,46,0.95);border:1px solid #333;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;font-family:sans-serif;font-size:12px;color:#fff;backdrop-filter:blur(5px);';

        const isPro = session.hasLicense && !session.isExpired;
        const daysLeft = LicenseManager ? LicenseManager.getDaysLeft() : 0;
        const deviceCount = session.deviceCount || 0;
        const maxDevices = session.maxDevices || 1;
        const isTrial = session.isTrial || false;
        const nestingCount = LicenseManager ? LicenseManager.getNestingCount() : 0;

        // Дата следующей проверки
        let nextCheckHint = '';
        if (session.lastCheck) {
            const lastCheck = new Date(session.lastCheck);
            const nextCheck = new Date(lastCheck.getTime() + 7 * 24 * 60 * 60 * 1000);
            const daysUntilCheck = Math.ceil((nextCheck - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntilCheck > 0) {
                nextCheckHint = `Проверка лицензии через ${daysUntilCheck}д`;
            } else {
                nextCheckHint = 'Проверка при запуске';
            }
        }

        ui.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:14px;">👤</span>
                <span style="color:#ccc;">${session.email}</span>
            </div>
            <div style="width:1px;height:16px;background:#333;"></div>
            <a href="Presentation.html" style="text-decoration:none;color:#0096ff;font-weight:600;" title="Открыть презентацию" target="_blank">📄 Презентация</a>
            <div style="width:1px;height:16px;background:#333;"></div>
            ${isTrial ? `<div style="background:linear-gradient(135deg,#ffd700 0%,#ffed4e 100%);color:#000;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;" title="Пробный период: ${daysLeft} дней осталось | Раскладок: ${nestingCount}/5 | Экспорт DXF: заблокирован">🎯 ПРОБНЫЙ</div><div style="width:1px;height:16px;background:#333;"></div>` : ''}
            ${isPro ? `<a href="mailto:cutsypro@gmail.com?subject=Вопрос по лицензии&body=Здравствуйте! У меня возник вопрос по лицензии." style="text-decoration:none;color:#00d4aa;font-weight:600;" title="Написать в поддержку" target="_blank">✨ PRO</a>` : `<div style="color:#888;font-weight:600;" title="${nextCheckHint}">FREE</div>`}
            ${isPro ? `<a href="mailto:cutsypro@gmail.com?subject=Вопрос по лицензии&body=Здравствуйте! У меня возник вопрос по лицензии." style="text-decoration:none;color:#888;font-size:11px;" title="Написать в поддержку" target="_blank">${daysLeft}д</a>` : ''}
            <div style="width:1px;height:16px;background:#333;"></div>
            <div style="color:#888;font-size:11px;" title="Устройства: ${deviceCount}/${maxDevices}\n${nextCheckHint}${isTrial ? '\nРаскладок: ' + nestingCount + '/5' : ''}">
                💻 ${deviceCount}/${maxDevices}${isTrial ? ' | 📋' + nestingCount + '/5' : ''}
            </div>
            <div style="width:1px;height:16px;background:#333;"></div>
            <button id="accountLogout" style="background:transparent;border:none;color:#ff6b6b;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:4px;" title="Выйти">🚪</button>
        `;

        document.body.appendChild(ui);

        document.getElementById('accountLogout').addEventListener('click', function() {
            if (LicenseManager) {
                LicenseManager.logout();
                window.location.reload();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createAccountUI);
    } else {
        createAccountUI();
    }

    // ═══════════════════════════════════════════════════════════════
    // МОБИЛЬНАЯ АДАПТАЦИЯ - ИНИЦИАЛИЗАЦИЯ
    // ═══════════════════════════════════════════════════════════════
    (function() {
        // Проверка мобильного устройства
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            console.log('📱 [Mobile] Мобильное устройство обнаружено');

            // Добавляем класс для мобильных стилей
            document.body.classList.add('mobile-device');

            // Предотвращаем зум по двойному тапу
            document.addEventListener('dblclick', (e) => {
                e.preventDefault();
            }, { passive: false });

            // Предотвращаем контекстное меню при long press
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                return false;
            });

            // Инициализация touch событий для canvas
            const canvas = document.getElementById('canvas');
            if (canvas && typeof initTouchEvents === 'function') {
                initTouchEvents(canvas);
                console.log('📱 [Mobile] Touch события инициализированы');
            }

            // Предотвращаем зум на input полях iOS
            document.addEventListener('touchstart', function(e) {
                if (e.touches.length > 1) {
                    e.preventDefault();
                }
            }, { passive: false });
        }
    })();
})();

