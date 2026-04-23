// js/license.js — функциональная проверка лицензии для Cutsy CAD
// Работает полностью офлайн, без сервера

console.log('🔐 [LICENSE] Загрузка LicenseManager...');

class LicenseManager {
    static PRO_KEY_PREFIX = 'CUTSY2-PRO-';
    
    // Проверка: активирована ли PRO-версия
    static isPro() {
        const key = localStorage.getItem('cutsy_license_key');
        const tier = localStorage.getItem('cutsy_tier');
        return tier === 'PRO' && key?.startsWith(this.PRO_KEY_PREFIX);
    }

    // Активация по ключу
    static activate(key) {
        if (!key?.startsWith(this.PRO_KEY_PREFIX)) {
            return { success: false, message: '❌ Неверный формат ключа' };
        }
        
        // Валидация контрольной суммы
        const checksum = key.slice(-8);
        const expected = this._calcChecksum(key.slice(0, -8));
        
        if (checksum !== expected) {
            return { success: false, message: '❌ Неверный ключ' };
        }
        
        // Сохраняем в браузере пользователя
        localStorage.setItem('cutsy_license_key', key);
        localStorage.setItem('cutsy_tier', 'PRO');
        localStorage.setItem('cutsy_activated_at', Date.now().toString());
        
        return { success: true, message: '✅ PRO-версия активирована!' };
    }

    // Выход из PRO (для теста)
    static deactivate() {
        localStorage.removeItem('cutsy_license_key');
        localStorage.removeItem('cutsy_tier');
        localStorage.removeItem('cutsy_activated_at');
    }

    // Проверка: можно ли использовать функцию?
    static canUse(feature, currentValue = null) {
        if (this.isPro()) return true; // PRO — всё можно
        
        const limits = {
            maxParts: 30,
            allowDxfExport: false,
            allowPricing: false,
            allowAutoNesting: false
        };
        
        switch(feature) {
            case 'addPart':
                return (currentValue || 0) < limits.maxParts;
            case 'exportDxf':
                return limits.allowDxfExport;
            case 'setCustomPrice':
                return limits.allowPricing;
            case 'autoNesting':
                return limits.allowAutoNesting;
            default:
                return true;
        }
    }

    // Показать окно с предложением купить PRO
    static showUpgradeModal(feature) {
        const messages = {
            addPart: '📦 Достигнут лимит в 30 деталей.',
            exportDxf: '🔧 Экспорт в DXF — функция PRO-версии.',
            setCustomPrice: '💰 Настройка цен доступна в PRO.',
            autoNesting: '⚡ Авто-раскладка — только в PRO.'
        };
        
        const modal = document.createElement('div');
        modal.className = 'license-modal-overlay';
        modal.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: flex; align-items: center; 
            justify-content: center; z-index: 10000; font-family: sans-serif;
        `;
        modal.innerHTML = `
            <div style="background:#1e1e1e; color:#fff; padding:25px; border-radius:12px; max-width:450px; box-shadow:0 10px 40px rgba(0,0,0,0.5);">
                <h3 style="margin:0 0 15px; color:#00d1b2;">✨ PRO-версия — 4 990 ₽</h3>
                <p style="margin:0 0 20px; line-height:1.4;">${messages[feature] || 'Эта функция доступна в PRO-версии.'}</p>
                <ul style="margin:0 0 25px 20px; line-height:1.6;">
                    <li>✅ Неограниченное число деталей</li>
                    <li>✅ Экспорт в DXF без водяных знаков</li>
                    <li>✅ Настройка цен за кг/прокол/время</li>
                    <li>✅ Авто-оптимизация раскладки (NFP)</li>
                    <li>✅ Поддержка в Telegram 7 дней</li>
                </ul>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button onclick="window.open('https://t.me/SilikinK', '_blank')" style="flex:1; padding:12px; background:#00d1b2; color:#000; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
                        💬 Написать в Telegram
                    </button>
                    <button onclick="this.closest('.license-modal-overlay').remove()" style="flex:1; padding:12px; background:#444; color:#fff; border:none; border-radius:6px; cursor:pointer;">
                        Позже
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    }

    // Внутренняя функция: расчёт контрольной суммы ключа
    static _calcChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase().slice(-8);
    }

    // Генерация нового ключа (для вас, как разработчика)
    static generateKey() {
        const r1 = Math.random().toString(36).slice(2, 6).toUpperCase();
        const r2 = Math.random().toString(36).slice(2, 6).toUpperCase();
        const base = `${this.PRO_KEY_PREFIX}${r1}-${r2}`;
        const checksum = this._calcChecksum(base);
        return `${base}-${checksum}`;
    }
}

// Делаем класс доступным глобально
window.LicenseManager = LicenseManager;

console.log('✅ [LICENSE] LicenseManager загружен успешно');
console.log('   Проверка:', window.LicenseManager ? 'OK' : 'FAILED');
