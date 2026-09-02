// ═══════════════════════════════════════════════════════════
// pricing.js — v4.60 — Цены по материалам и толщинам
// ═══════════════════════════════════════════════════════════
// Поддерживает разные материалы:
//   - Сталь горячекатаная, холоднокатаная, нержавеющая
//   - Алюминий, медь, латунь
//   - ЛДСП, фанера, МДФ, ОСП
// Каждый материал имеет свою плотность (для расчёта веса)
// и свою сетку цен по толщинам.
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// БАЗА МАТЕРИАЛОВ (плотность в г/см³ = кг/м²·мм)
// ═══════════════════════════════════════════════════════════════
const MATERIALS = {
    'steel_hot': {
        name: 'Сталь горячекатаная',
        density: 7.85,  // г/см³
        category: 'metal',
        icon: '🔩'
    },
    'steel_galvanized': {
        name: 'Сталь оцинкованная',
        density: 7.85,
        category: 'metal',
        icon: '🔩'
    },
    'steel_stainless': {
        name: 'Сталь нержавеющая',
        density: 8.00,
        category: 'metal',
        icon: '✨'
    },
    'aluminum': {
        name: 'Алюминий',
        density: 2.70,
        category: 'metal',
        icon: '⚪'
    },
    'copper': {
        name: 'Медь',
        density: 8.96,
        category: 'metal',
        icon: '🟠'
    },
    'brass': {
        name: 'Латунь',
        density: 8.50,
        category: 'metal',
        icon: '🟡'
    },
    'ldsp': {
        name: 'ЛДСП',
        density: 0.70,
        category: 'wood',
        icon: '🪵'
    },
    'mdf': {
        name: 'МДФ',
        density: 0.75,
        category: 'wood',
        icon: '🪵'
    },
    'plywood': {
        name: 'Фанера',
        density: 0.65,
        category: 'wood',
        icon: '🪵'
    },
    'osp': {
        name: 'ОСП (OSB)',
        density: 0.62,
        category: 'wood',
        icon: '🪵'
    },
    'plexiglass': {
        name: 'Оргстекло (акрил)',
        density: 1.19,
        category: 'plastic',
        icon: '🔷'
    },
    'polycarbonate': {
        name: 'Поликарбонат',
        density: 1.20,
        category: 'plastic',
        icon: '🔷'
    }
};

// Материал по умолчанию
const DEFAULT_MATERIAL = 'steel_hot';

// ═══════════════════════════════════════════════════════════════
// УТИЛИТЫ ДЛЯ МАТЕРИАЛОВ
// ═══════════════════════════════════════════════════════════════

/**
 * Получить материал по ключу (с fallback на default)
 */
function getMaterial(key) {
    return MATERIALS[key] || MATERIALS[DEFAULT_MATERIAL];
}

/**
 * Получить плотность материала (г/см³)
 */
function getMaterialDensity(materialKey) {
    return getMaterial(materialKey).density;
}

/**
 * Получить текущий выбранный материал (из localStorage)
 */
function getCurrentMaterial() {
    return localStorage.getItem('cadCurrentMaterial') || DEFAULT_MATERIAL;
}

/**
 * Установить текущий материал
 */
function setCurrentMaterial(key) {
    localStorage.setItem('cadCurrentMaterial', key);
}

/**
 * Рассчитать вес детали (кг)
 * @param {number} areaMm2 - площадь в мм²
 * @param {number} thicknessMm - толщина в мм
 * @param {string} materialKey - ключ материала
 * @returns {number} вес в кг
 *
 * Формула: area(мм²) × thickness(мм) × density(г/см³) / 1000000 = кг
 * Проверка: 1м² × 1мм × 7.85 = 1000000 × 1 × 7.85 / 1000000 = 7.85 кг ✓
 */
function calculateWeight(areaMm2, thicknessMm, materialKey) {
    const density = getMaterialDensity(materialKey);
    return areaMm2 * thicknessMm * density / 1000000;
}

// ═══════════════════════════════════════════════════════════════
// ЗАГРУЗКА/СОХРАНЕНИЕ ЦЕН (теперь с учётом материала)
// ═══════════════════════════════════════════════════════════════
// Структура цен изменилась:
//   Было:  { pricePerKg: { "1.0": 100 }, ... }  — только по толщине
//   Стало:  { pricePerKg: { "steel_hot": { "1.0": 100 } }, ... }  — по материалу + толщине
//
// МИГРАЦИЯ: если в localStorage старый формат, конвертируем в новый
// (цены переносятся на текущий материал)

function loadPricingSettings() {
    const saved = localStorage.getItem('cadPricingSettings');
    if (saved) {
        let parsed;
        try {
            parsed = JSON.parse(saved);
        } catch (e) {
            console.warn('[pricing] Данные цен повреждены, сбрасываем:', e);
            localStorage.removeItem('cadPricingSettings');
            return {
                pricePerKg: {}, pricePerM2: {}, pricePerMinute: 1,
                pricePerMeterCut: {}, pricePerPierce: {}
            };
        }
        // Миграция: если есть pricePerHour но нет pricePerMinute
        if (parsed.pricePerHour !== undefined && parsed.pricePerMinute === undefined) {
            parsed.pricePerMinute = Math.round(parsed.pricePerHour / 60);
            delete parsed.pricePerHour;
        }

        // v4.60: Миграция старого формата (без материала) → новый (с материалом)
        const currentMat = getCurrentMaterial();
        const migrate = (obj) => {
            if (!obj || typeof obj !== 'object') return {};
            // Проверяем: если значения — числа, это старый формат
            const keys = Object.keys(obj);
            if (keys.length > 0 && typeof obj[keys[0]] === 'number') {
                // Старый формат: { "1.0": 100 } → { [currentMat]: { "1.0": 100 } }
                const migrated = {};
                migrated[currentMat] = { ...obj };
                return migrated;
            }
            return obj; // Уже новый формат
        };

        return {
            pricePerKg: migrate(parsed.pricePerKg),
            pricePerM2: migrate(parsed.pricePerM2),
            pricePerMinute: parsed.pricePerMinute !== undefined ? parsed.pricePerMinute : 1,
            pricePerMeterCut: migrate(parsed.pricePerMeterCut),
            pricePerPierce: migrate(parsed.pricePerPierce)
        };
    }
    return {
        pricePerKg: {},
        pricePerM2: {},
        pricePerMinute: 1,
        pricePerMeterCut: {},
        pricePerPierce: {}
    };
}

function savePricingSettings(settings) {
    localStorage.setItem('cadPricingSettings', JSON.stringify(settings));
}

// ═══════════════════════════════════════════════════════════════
// ГЛОБАЛЬНЫЕ ФУНКЦИИ ДЛЯ ПОЛУЧЕНИЯ ЦЕН (с учётом материала)
// ═══════════════════════════════════════════════════════════════

window.getPricePerMeterCut = function(thickness) {
    const pricing = loadPricingSettings();
    const mat = getCurrentMaterial();
    const thKey = thickness.toFixed(1);
    // Ищем: материал → толщина, fallback на default материал
    const matPrices = pricing.pricePerMeterCut[mat] || pricing.pricePerMeterCut[DEFAULT_MATERIAL] || {};
    return matPrices[thKey] || matPrices[thickness] || matPrices[parseFloat(thickness)] || 0;
};

window.getPricePerKg = function(thickness) {
    const pricing = loadPricingSettings();
    const mat = getCurrentMaterial();
    const thKey = thickness.toFixed(1);
    const matPrices = pricing.pricePerKg[mat] || pricing.pricePerKg[DEFAULT_MATERIAL] || {};
    return matPrices[thKey] || matPrices[thickness] || matPrices[parseFloat(thickness)] || 0;
};

window.getPricePerM2 = function(thickness) {
    const pricing = loadPricingSettings();
    const mat = getCurrentMaterial();
    const thKey = thickness.toFixed(1);
    const matPrices = pricing.pricePerM2[mat] || pricing.pricePerM2[DEFAULT_MATERIAL] || {};
    return matPrices[thKey] || matPrices[thickness] || matPrices[parseFloat(thickness)] || 0;
};

window.getPricePerPierce = function(thickness) {
    const pricing = loadPricingSettings();
    const mat = getCurrentMaterial();
    const thKey = thickness.toFixed(1);
    const matPrices = pricing.pricePerPierce[mat] || pricing.pricePerPierce[DEFAULT_MATERIAL] || {};
    return matPrices[thKey] || matPrices[thickness] || matPrices[parseFloat(thickness)] || 0;
};

// Глобальный доступ к материалам и плотности
window.MATERIALS = MATERIALS;
window.getMaterialDensity = getMaterialDensity;
window.getCurrentMaterial = getCurrentMaterial;
window.setCurrentMaterial = setCurrentMaterial;
window.calculateWeight = calculateWeight;

// ═══════════════════════════════════════════════════════════════
// МОДАЛЬНОЕ ОКНО «УСТАНОВИТЬ ЦЕНЫ»
// ═══════════════════════════════════════════════════════════════

document.getElementById('setPricesBtn').addEventListener('click', () => {
    // 🔒 Проверка пробного тарифа — установка цен недоступна
    if (typeof LicenseManager !== 'undefined' && LicenseManager.isTrial()) {
        if (typeof LicenseManager.showUpgradeModal === 'function') {
            LicenseManager.showUpgradeModal('setCustomPrice');
        } else {
            alert('💰 Настройка цен доступна только в PRO-версии. Купите тариф для доступа.');
        }
        return;
    }

    // Удаляем старое окно если есть
    const oldModal = document.getElementById('pricingModal');
    if (oldModal) oldModal.remove();

    const pricing = loadPricingSettings();
    let currentMat = getCurrentMaterial();

    // Собираем уникальные толщины из деталей
    const thicknesses = new Set();
    parts.forEach(p => thicknesses.add((p.thickness || 0.8).toFixed(1)));
    const sortedTh = Array.from(thicknesses).sort((a, b) => parseFloat(a) - parseFloat(b));

    // Если деталей нет — показываем стандартные толщины
    if (sortedTh.length === 0) {
        ['0.5','0.7','0.8','1.0','1.2','1.5','2.0','2.5','3.0','4.0','5.0','6.0','8.0','10.0'].forEach(t => thicknesses.add(t));
    }
    const finalThicknesses = sortedTh.length > 0 ? sortedTh : Array.from(thicknesses).sort((a, b) => parseFloat(a) - parseFloat(b));

    // Группируем материалы по категориям для селектора
    const categories = {
        metal: { name: 'Металлы', items: [] },
        wood: { name: 'Дерево и листовые', items: [] },
        plastic: { name: 'Пластики', items: [] }
    };
    Object.entries(MATERIALS).forEach(([key, mat]) => {
        if (categories[mat.category]) {
            categories[mat.category].items.push({ key, ...mat });
        }
    });

    const materialOptions = Object.entries(categories).map(([catKey, cat]) => {
        const options = cat.items.map(item =>
            `<option value="${item.key}" ${item.key === currentMat ? 'selected' : ''}>${item.icon} ${item.name} (плотн. ${item.density} г/см³)</option>`
        ).join('');
        return `<optgroup label="${cat.name}">${options}</optgroup>`;
    }).join('');

    // Функция генерации строк цен для выбранного материала
    function generateThicknessRows(matKey) {
        const matPrices_kg = pricing.pricePerKg[matKey] || {};
        const matPrices_m2 = pricing.pricePerM2[matKey] || {};
        const matPrices_cut = pricing.pricePerMeterCut[matKey] || {};
        const matPrices_pierce = pricing.pricePerPierce[matKey] || {};

        return finalThicknesses.map(th => {
            const priceKg = matPrices_kg[th] || matPrices_kg[parseFloat(th)] || '';
            const priceM2 = matPrices_m2[th] || matPrices_m2[parseFloat(th)] || '';
            const priceCut = matPrices_cut[th] || matPrices_cut[parseFloat(th)] || '';
            const pricePierce = matPrices_pierce[th] || matPrices_pierce[parseFloat(th)] || '';
            return `
                <tr>
                    <td style="padding:2px 6px;font-weight:600;font-size:10px;">${th}мм</td>
                    <td style="padding:2px;"><input type="number" class="price-per-kg" data-thickness="${th}" value="${priceKg}" min="0" step="1" placeholder="—" style="width:60px;padding:2px 4px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:3px;font-size:10px;text-align:center;" title="Цена за кг"></td>
                    <td style="padding:2px;"><input type="number" class="price-per-m2" data-thickness="${th}" value="${priceM2}" min="0" step="10" placeholder="—" style="width:60px;padding:2px 4px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:3px;font-size:10px;text-align:center;" title="Цена за м²"></td>
                    <td style="padding:2px;"><input type="number" class="price-per-meter-cut" data-thickness="${th}" value="${priceCut}" min="0" step="0.5" placeholder="—" style="width:60px;padding:2px 4px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:3px;font-size:10px;text-align:center;" title="Цена за метр реза"></td>
                    <td style="padding:2px;"><input type="number" class="price-per-pierce" data-thickness="${th}" value="${pricePierce}" min="0" step="0.1" placeholder="—" style="width:60px;padding:2px 4px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:3px;font-size:10px;text-align:center;" title="Цена за прокол"></td>
                </tr>
            `;
        }).join('');
    }

    const overlay = document.createElement('div');
    overlay.id = 'pricingModal';
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
        <div class="modal-window" style="max-width:440px;width:95%;">
            <div class="modal-header" style="padding:8px 14px;">
                <h3 style="font-size:14px;">💰 Установить цены</h3>
                <button class="modal-close" id="closePricingModal" style="font-size:18px;line-height:1;">×</button>
            </div>
            <div class="modal-content" style="max-height:62vh;overflow-y:auto;padding:8px 12px;">
                <!-- v4.60: Селектор материала (компактный) -->
                <div style="margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                    <label style="color:#aaa;font-size:11px;white-space:nowrap;">🏷️ Материал:</label>
                    <select id="materialSelect" style="flex:1;padding:4px 6px;background:#1a1a2e;color:#fff;border:1px solid #555;border-radius:4px;font-size:11px;">
                        ${materialOptions}
                    </select>
                    <span style="color:#888;font-size:10px;white-space:nowrap;">пл. <strong id="materialDensity">${getMaterial(currentMat).density}</strong></span>
                </div>

                <table style="width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px;">
                    <thead>
                        <tr style="background:#2a2a2a;">
                            <th style="padding:4px 6px;text-align:left;color:#fff;font-size:10px;">Толщ.</th>
                            <th style="padding:4px 4px;text-align:center;color:#aaa;font-size:9px;">₽/кг</th>
                            <th style="padding:4px 4px;text-align:center;color:#aaa;font-size:9px;">₽/м²</th>
                            <th style="padding:4px 4px;text-align:center;color:#aaa;font-size:9px;">Рез ₽/м</th>
                            <th style="padding:4px 4px;text-align:center;color:#aaa;font-size:9px;">Прокол ₽</th>
                        </tr>
                    </thead>
                    <tbody id="thicknessTableBody">
                        ${generateThicknessRows(currentMat)}
                    </tbody>
                </table>
                <div style="display:flex;align-items:center;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid #333;">
                    <label style="color:#aaa;font-size:11px;white-space:nowrap;">⏱️ Время:</label>
                    <input type="number" id="pricePerMinuteInput" value="${pricing.pricePerMinute}" min="0" step="1" placeholder="₽/мин" style="width:70px;padding:3px 6px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:4px;font-size:11px;">
                    <span style="color:#888;font-size:10px;">₽/мин</span>
                </div>
            </div>
            <div class="modal-footer" style="display:flex;gap:6px;justify-content:flex-end;padding:6px 14px;border-top:1px solid #333;">
                <button id="cancelPricing" style="padding:4px 14px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Отмена</button>
                <button id="savePricing" style="padding:4px 14px;background:#2d7a5a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:11px;">💾 Сохранить</button>
            </div>
        </div>
    `;

    // Закрытие
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    overlay.querySelector('#closePricingModal').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#cancelPricing').addEventListener('click', () => overlay.remove());

    // v4.60: При смене материала — сохраняем текущие цены и загружаем цены нового материала
    const materialSelect = overlay.querySelector('#materialSelect');
    const tableBody = overlay.querySelector('#thicknessTableBody');
    const densityDisplay = overlay.querySelector('#materialDensity');

    // Временное хранилище цен (для всех материалов, которые редактировали)
    const tempPricing = JSON.parse(JSON.stringify(pricing));

    materialSelect.addEventListener('change', () => {
        // Сохраняем цены текущего материала во временное хранилище
        const prevMat = currentMat;
        const newKg = {}, newM2 = {}, newCut = {}, newPierce = {};
        overlay.querySelectorAll('.price-per-kg').forEach(input => {
            const val = parseFloat(input.value);
            if (val > 0) newKg[input.dataset.thickness] = val;
        });
        overlay.querySelectorAll('.price-per-m2').forEach(input => {
            const val = parseFloat(input.value);
            if (val > 0) newM2[input.dataset.thickness] = val;
        });
        overlay.querySelectorAll('.price-per-meter-cut').forEach(input => {
            const val = parseFloat(input.value);
            if (val > 0) newCut[input.dataset.thickness] = val;
        });
        overlay.querySelectorAll('.price-per-pierce').forEach(input => {
            const val = parseFloat(input.value);
            if (val > 0) newPierce[input.dataset.thickness] = val;
        });
        tempPricing.pricePerKg[prevMat] = newKg;
        tempPricing.pricePerM2[prevMat] = newM2;
        tempPricing.pricePerMeterCut[prevMat] = newCut;
        tempPricing.pricePerPierce[prevMat] = newPierce;

        // Меняем материал
        currentMat = materialSelect.value;
        densityDisplay.textContent = getMaterial(currentMat).density;

        // Обновляем строки цен для нового материала
        tableBody.innerHTML = generateThicknessRows(currentMat);
    });

    // Сохранение
    overlay.querySelector('#savePricing').addEventListener('click', () => {
        // Сохраняем цены текущего (последнего) материала
        const newKg = {}, newM2 = {}, newCut = {}, newPierce = {};
        overlay.querySelectorAll('.price-per-kg').forEach(input => {
            const th = input.dataset.thickness;
            const val = parseFloat(input.value);
            if (val > 0) newKg[th] = val;
        });
        overlay.querySelectorAll('.price-per-m2').forEach(input => {
            const th = input.dataset.thickness;
            const val = parseFloat(input.value);
            if (val > 0) newM2[th] = val;
        });
        overlay.querySelectorAll('.price-per-meter-cut').forEach(input => {
            const th = input.dataset.thickness;
            const val = parseFloat(input.value);
            if (val > 0) newCut[th] = val;
        });
        overlay.querySelectorAll('.price-per-pierce').forEach(input => {
            const th = input.dataset.thickness;
            const val = parseFloat(input.value);
            if (val > 0) newPierce[th] = val;
        });
        tempPricing.pricePerKg[currentMat] = newKg;
        tempPricing.pricePerM2[currentMat] = newM2;
        tempPricing.pricePerMeterCut[currentMat] = newCut;
        tempPricing.pricePerPierce[currentMat] = newPierce;

        // Устанавливаем текущий материал глобально
        setCurrentMaterial(currentMat);

        const settings = {
            pricePerKg: tempPricing.pricePerKg,
            pricePerM2: tempPricing.pricePerM2,
            pricePerMeterCut: tempPricing.pricePerMeterCut,
            pricePerPierce: tempPricing.pricePerPierce,
            pricePerMinute: parseFloat(document.getElementById('pricePerMinuteInput').value) || 0
        };

        savePricingSettings(settings);
        overlay.remove();

        // Уведомление
        const matInfo = getMaterial(currentMat);
        const thCount = Object.keys(newKg).length;
        alert(`✅ Цены сохранены!\n\n🏷️ Материал: ${matInfo.icon} ${matInfo.name}\n🔩 Плотность: ${matInfo.density} г/см³\n💰 Цена за кг: ${thCount} толщин\n⏱️ Время: ${settings.pricePerMinute} ₽/мин`);
    });

    document.body.appendChild(overlay);

    // Обработчики для взаимного исключения цен за кг и м²
    if (typeof window.initPricingMutualExclusion === 'function') {
        window.initPricingMutualExclusion(overlay);
    }
});