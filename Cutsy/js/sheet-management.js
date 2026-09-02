// ═══════════════════════════════════════════════════════════
// sheet-management.js — ИСПРАВЛЕННАЯ ВЕРСИЯ
// Критические и серьёзные баги устранены
// ═══════════════════════════════════════════════════════════

// === Управление размерами листов ===
const CUSTOM_SHEETS_KEY = 'custom_sheets_v1';

// [FIX #4] Утилита безопасного парсинга целого
function safeParseInt(value, defaultValue) {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? defaultValue : parsed;
}

// Загрузка пользовательских размеров
function loadCustomSheets() {
    try { // [FIX #10] Защита от повреждённых данных
        const saved = localStorage.getItem(CUSTOM_SHEETS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.warn('[loadCustomSheets] Данные повреждены, очищаем:', e);
        localStorage.removeItem(CUSTOM_SHEETS_KEY);
        return [];
    }
}

// Сохранение пользовательских размеров
function saveCustomSheets(sheets) {
    try { // [FIX #12] Защита от переполнения localStorage
        localStorage.setItem(CUSTOM_SHEETS_KEY, JSON.stringify(sheets));
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22) {
            console.error('[saveCustomSheets] localStorage переполнен');
            alert('Кэш переполнен. Удалите ненужные размеры листов.');
        }
    }
}

// Отображение списка пользовательских размеров
function renderCustomSheetsList() {
    const customSheets = loadCustomSheets();
    const container = document.getElementById('customSheetsList');

    // [FIX #9] Null-проверка контейнера
    if (!container) return;

    if (customSheets.length === 0) {
        container.innerHTML = '';
        return;
    }

    // Определяем текущий лист для подсветки
    const currentW = sheetSize.width;
    const currentH = sheetSize.height;

    container.innerHTML = '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">' +
        customSheets.map((sheet, idx) => {
            const isActive = (sheet.width === currentW && sheet.height === currentH);
            const bg = isActive ? '#2d7a5a' : '#2d5a4a';
            const border = isActive ? 'border:1px solid #00e676;' : '';
            const badge = isActive ? '✅ ' : '';
            return `
            <div style="display:flex;align-items:center;gap:4px;padding:4px 8px;background:${bg};border-radius:4px;font-size:11px;${border}">
                <span>${badge}${sheet.width} × ${sheet.height} мм</span>
                <button onclick="selectCustomSheet(${idx}); event.stopPropagation();" style="padding:2px 6px;background:#007acc;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;" title="Выбрать">&#10003;</button>
                <button onclick="deleteCustomSheet(${idx}); event.stopPropagation();" style="padding:2px 6px;background:#c72e2e;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px;" title="Удалить">&#10005;</button>
            </div>`;
        }).join('') + '</div>';
}

// Выбор пользовательского размера
window.selectCustomSheet = function(idx) {
    const customSheets = loadCustomSheets();
    const sheet = customSheets[idx];
    if (sheet) {
        sheetSize = { width: sheet.width, height: sheet.height };
        document.getElementById('sheetWidth').value = sheet.width;
        document.getElementById('sheetHeight').value = sheet.height;
        renderCustomSheetsList();  // Обновляем подсветку
        render();
    }
};

// Удаление пользовательского размера
window.deleteCustomSheet = function(idx) {
    const customSheets = loadCustomSheets();
    customSheets.splice(idx, 1);
    saveCustomSheets(customSheets);
    renderCustomSheetsList();
};

// Сохранение нового пользовательского размера
document.getElementById('saveCustomSheet').addEventListener('click', () => {
    let width = safeParseInt(document.getElementById('sheetWidth').value, 1250);  // [FIX #4]
    let height = safeParseInt(document.getElementById('sheetHeight').value, 2500); // [FIX #4]

    if (width <= 0 || height <= 0) {
        alert('Размер листа должен быть больше 0');
        return;
    }

    // [FIX #5] Ограничение сверху
    if (width > 10000 || height > 10000) {
        alert('Размер листа не должен превышать 10000 мм');
        return;
    }

    const customSheets = loadCustomSheets();
    customSheets.push({ width, height });
    saveCustomSheets(customSheets);
    renderCustomSheetsList();

    sheetSize = { width, height };
    renderCustomSheetsList();  // Обновляем подсветку
});

// Выбор размера листа
// v4.47: Кнопка "Загрузить фото" (вынесена из select)
document.getElementById('loadPhotoRemnantBtn').addEventListener('click', () => {
    const input = document.getElementById('sheetRemnantInput');
    if (input) {
        input.value = '';
        input.click();
    }
});

document.getElementById('sheetSize').addEventListener('change', () => {
    const value = document.getElementById('sheetSize').value;
    const customDiv = document.getElementById('customSheetSize');

// Сохраняем предыдущее значение
    document.getElementById('sheetSize').dataset.prevValue = value;

    if (value === 'custom') {
        customDiv.style.display = 'flex';
    } else {
        customDiv.style.display = 'none';
        const [w, h] = value.split('x').map(Number);
        sheetSize = { width: w, height: h };

        // [FIX #1] Безопасная работа с useRemnant
        if (typeof useRemnant !== 'undefined') useRemnant = false;
        if (typeof window !== 'undefined') window.useRemnant = false;

        // ─── АВТОРАСКЛАДКА — при выборе стандартного листа ───────────────
        const autoNestingCheckbox = document.getElementById('autoNestingCheckbox');
        if (autoNestingCheckbox && autoNestingCheckbox.checked && parts.length > 0) {
            console.log('🚀 Авторасскладка (выбор листа): запуск раскладки...');
            setTimeout(async () => {
                try {
                    const nestBtn = document.getElementById('nestMultiParts');
                    if (nestBtn && typeof nestBtn.onclick === 'function') {
                        nestBtn.onclick();
                    } else if (nestBtn) {
                        nestBtn.dispatchEvent(new MouseEvent('click'));
                    }
                } catch (err) {
                    console.error('❌ Ошибка авторасскладки:', err);
                }
            }, 500);
        }
    }

    // Скрываем фото при переключении на стандартный лист
    sheetBackgroundImage = null;
    if (typeof window !== 'undefined') window.sheetBackgroundImage = null;

    render();
});

// Обработчик загрузки фото остатка
document.getElementById('sheetRemnantInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        loadSheetRemnantImage(file);
    }
    e.target.value = '';
});

// ═══════════════════════════════════════════════════════════
// УДАЛИТЬ ОСТАТОК ЛИСТА
// ═══════════════════════════════════════════════════════════
document.getElementById('deleteRemnant').addEventListener('click', () => {
    if (!sheetRemnant) {
        alert('Нет остатка листа для удаления');
        return;
    }

    if (confirm('Удалить остаток листа?\n\nВсе данные об остатке будут удалены.')) {
        sheetRemnant = null;
        if (typeof window !== 'undefined') window.sheetRemnant = null;
        if (typeof useRemnant !== 'undefined') useRemnant = false;
        if (typeof window !== 'undefined') window.useRemnant = false;
        sheetBackgroundImage = null;
        if (typeof window !== 'undefined') window.sheetBackgroundImage = null;

        if (typeof hideRemnantSheetItem === 'function') {
            hideRemnantSheetItem();
        }

        localStorage.removeItem('nesting_sheet_remnant_cache');
        localStorage.removeItem('cadSheetRemnant');
        localStorage.removeItem('sheetRemnant');
        if (typeof saveToCache === 'function') saveToCache();

        // Переключаемся на стандартный лист
        sheetSize = { width: 1250, height: 2500 };
        document.getElementById('sheetSize').value = '1250x2500';
        document.getElementById('sheetSize').dataset.prevValue = '1250x2500';

        render();
    }
});

// Кнопка "Выбрать остаток"
document.getElementById('selectRemnant').addEventListener('click', () => {
    if (sheetRemnant) {
        switchToRemnantSheet();
    }
});

// Валидация ширины листа
document.getElementById('sheetWidth').addEventListener('change', () => {
    let width = safeParseInt(document.getElementById('sheetWidth').value, 1250); // [FIX #4]

    if (width <= 0) {
        alert('Ширина должна быть больше 0');
        width = 1250;
        document.getElementById('sheetWidth').value = width;
    }
    // [FIX #5] Ограничение сверху
    if (width > 10000) {
        alert('Ширина не должна превышать 10000 мм');
        width = 10000;
        document.getElementById('sheetWidth').value = width;
    }

    sheetSize.width = width;
    renderCustomSheetsList();  // Обновляем подсветку
    render();
});

// Валидация высоты листа
document.getElementById('sheetHeight').addEventListener('change', () => {
    let height = safeParseInt(document.getElementById('sheetHeight').value, 2500); // [FIX #4]

    if (height <= 0) {
        alert('Высота должна быть больше 0');
        height = 2500;
        document.getElementById('sheetHeight').value = height;
    }
    // [FIX #5] Ограничение сверху
    if (height > 10000) {
        alert('Высота не должна превышать 10000 мм');
        height = 10000;
        document.getElementById('sheetHeight').value = height;
    }

    sheetSize.height = height;
    renderCustomSheetsList();  // Обновляем подсветку
    render();
});

// Загружаем пользовательские размеры при старте
renderCustomSheetsList();

// ═══════════════════════════════════════════════════════════
// [FIX #8] ОБЩИЕ ФУНКЦИИ СОХРАНЕНИЯ/ЗАГРУЗКИ ЛИСТА
// Устраняют дублирование кода в prev/next/delete
// ═══════════════════════════════════════════════════════════
function saveCurrentSheet() {
    if (!window.allSheets || !window.allSheets[window.currentSheetIndex]) return;

    const current = window.allSheets[window.currentSheetIndex];
    current.nestedParts = [...nestedParts];
    current.markupRects = [...(window.markupRects || markupRects || [])];
    current.cutRemnantLine = window.cutRemnantLine ? { ...window.cutRemnantLine } : null;
    current.showCutRemnantLine = window.showCutRemnantLine;
}

function loadSheet(index) {
    if (!window.allSheets || !window.allSheets[index]) return;

    const sheet = window.allSheets[index];
    nestedParts = sheet.nestedParts || [];
    sheetSize = { ...sheet.sheetSize };

<<<<<<< HEAD
=======
    // v5.06: Загрузка толщины листа
    if (sheet.thickness != null) {
        // толщина сохранена — используем
    } else {
        sheet.thickness = 0.8; // fallback для старых листов
    }

>>>>>>> master
    markupRects = sheet.markupRects || [];
    window.markupRects = markupRects;
    window.cutRemnantLine = sheet.cutRemnantLine || null;
    window.showCutRemnantLine = sheet.showCutRemnantLine || false;
    selectedRectIndex = -1;
    if (typeof window !== 'undefined') window.selectedRectIndex = -1;

    // Обновляем кнопку линии обрезки
    const cutBtn = document.getElementById('toggleCutRemnant');
    if (cutBtn) {
        if (window.showCutRemnantLine) {
            cutBtn.style.background = '#7a2d2d';
            cutBtn.textContent = 'Линия обрезки: ВКЛ';
        } else {
            cutBtn.style.background = '#7a5a2d';
            cutBtn.textContent = 'Линия обрезки';
        }
    }

    // Обновляем поля размера листа
    const widthEl = document.getElementById('sheetWidth');
    const heightEl = document.getElementById('sheetHeight');
    if (widthEl) widthEl.value = sheetSize.width;
    if (heightEl) heightEl.value = sheetSize.height;
}

// Показать/скрыть лист
document.getElementById('showSheet').addEventListener('click', () => {
    showSheetView = !showSheetView;
    document.getElementById('showSheet').textContent = showSheetView ? 'Скрыть лист' : 'Показать лист';

    // Показываем/скрываем кнопки разметки остатка, наложения и поворота
    const markupRectTools = document.getElementById('markupRectTools');
    if (markupRectTools) markupRectTools.style.display = showSheetView ? 'block' : 'none';

    // [FIX #2] Null-проверка для cutRemnantTools
    const cutRemnantToolsEl = document.getElementById('cutRemnantTools');
    if (cutRemnantToolsEl) cutRemnantToolsEl.style.display = showSheetView ? 'block' : 'none';

    // v4.56: Линейка — показывать только когда показан лист
    const rulerToolsEl = document.getElementById('rulerTools');
    if (rulerToolsEl) rulerToolsEl.style.display = showSheetView ? 'block' : 'none';

    const overlapTools = document.getElementById('overlapTools');
    if (overlapTools) overlapTools.style.display = showSheetView ? 'block' : 'none';

    const nestedPartTools = document.getElementById('nestedPartTools');
    if (nestedPartTools) nestedPartTools.style.display = showSheetView ? 'block' : 'none';

    // Если показываем лист и листов ещё нет - создаём первый лист
    if (showSheetView && (!window.allSheets || window.allSheets.length === 0)) {
        window.allSheets = [{
            id: 1,
            name: 'Лист 1',
            sheetSize: { ...sheetSize },
<<<<<<< HEAD
=======
            thickness: 0.8, // v5.06: толщина по умолчанию
>>>>>>> master
            nestedParts: [],
            markupRects: []
        }];
        window.currentSheetIndex = 0;
        nestedParts = [];
        markupRects = [];
        if (typeof window !== 'undefined') window.markupRects = [];
    }

    updateSheetNavigation();
    render();
});

// Очистить раскладку
document.getElementById('clearNesting').addEventListener('click', () => {
    if (nestedParts.length === 0 && (!window.allSheets || window.allSheets.length === 0)) {
        return;
    }

    if (confirm('Очистить раскладку со всех листов?\n\nВсе размещённые детали и прямоугольники разметки будут удалены.')) {
        if (typeof saveState === 'function') saveState();

        // [FIX #3] НЕ обнуляем allSheets — пересоздаём первый лист
        window.allSheets = [{
            id: 1,
            name: 'Лист 1',
            sheetSize: { ...sheetSize },
<<<<<<< HEAD
=======
            thickness: 0.8, // v5.06: толщина по умолчанию
>>>>>>> master
            nestedParts: [],
            markupRects: []
        }];
        window.currentSheetIndex = 0;
        nestedParts = [];
        markupRects = [];
        if (typeof window !== 'undefined') window.markupRects = [];

        selectedNestedParts = [];
        selectedRectIndex = -1;

        // Сбрасываем галочки раскладки
        parts.forEach(p => { p.nestingEnabled = true; });

        // Скрываем кнопки
        const markupRectTools = document.getElementById('markupRectTools');
        if (markupRectTools) markupRectTools.style.display = 'none';

        const cutRemnantToolsEl = document.getElementById('cutRemnantTools'); // [FIX #2]
        if (cutRemnantToolsEl) cutRemnantToolsEl.style.display = 'none';

        const overlapTools = document.getElementById('overlapTools');
        if (overlapTools) overlapTools.style.display = 'none';

        const nestedPartTools = document.getElementById('nestedPartTools');
        if (nestedPartTools) nestedPartTools.style.display = 'none';

        updateSheetNavigation();
        render();
        updatePartsList();
    }
});

// ═══════════════════════════════════════════════════════════════
// ДОБАВИТЬ ЛИСТ
// ═══════════════════════════════════════════════════════════════
document.getElementById('addSheet').addEventListener('click', () => {
    if (parts.length === 0) {
        alert('Сначала создайте детали');
        return;
    }

    const sheetWidthInput = prompt('Введите ширину листа (мм):', sheetSize.width);
    if (sheetWidthInput === null) return;
<<<<<<< HEAD
    const width = safeParseInt(sheetWidthInput, 1250); // [FIX #4]

    const sheetHeightInput = prompt('Введите высоту листа (мм):', sheetSize.height);
    if (sheetHeightInput === null) return;
    const height = safeParseInt(sheetHeightInput, 2500); // [FIX #4]

    // [FIX #5] Валидация
=======
    const width = safeParseInt(sheetWidthInput, 1250);

    const sheetHeightInput = prompt('Введите высоту листа (мм):', sheetSize.height);
    if (sheetHeightInput === null) return;
    const height = safeParseInt(sheetHeightInput, 2500);

    // v5.06: Запрос толщины листа
    const currentSheet = window.allSheets && window.allSheets.length > 0 ? window.allSheets[window.allSheets.length - 1] : null;
    const defaultThickness = currentSheet?.thickness || 0.8;
    const sheetThicknessInput = prompt('Введите толщину листа (мм):', defaultThickness);
    if (sheetThicknessInput === null) return;
    const thickness = parseFloat(sheetThicknessInput) || 0.8;

    // Валидация
>>>>>>> master
    if (width <= 0 || height <= 0) {
        alert('Размер листа должен быть больше 0');
        return;
    }
    if (width > 10000 || height > 10000) {
        alert('Размер листа не должен превышать 10000 мм');
        return;
    }
<<<<<<< HEAD

    if (typeof saveState === 'function') saveState();

    // [FIX #18] Защита от null allSheets
=======
    if (thickness <= 0 || thickness > 100) {
        alert('Толщина листа должна быть от 0.1 до 100 мм');
        return;
    }

    if (typeof saveState === 'function') saveState();

>>>>>>> master
    if (!window.allSheets) {
        window.allSheets = [];
        window.currentSheetIndex = 0;
    }

<<<<<<< HEAD
    // [FIX #7] sheetNum = реальный индекс + 1
=======
>>>>>>> master
    const newSheet = {
        sheetNum: window.allSheets.length + 1,
        nestedParts: [],
        unplacedParts: [],
        utilization: 0,
        sheetSize: { width, height },
<<<<<<< HEAD
=======
        thickness: thickness, // v5.06: толщина листа
>>>>>>> master
        markupRects: [],
        cutRemnantLine: null,
        showCutRemnantLine: false
    };

<<<<<<< HEAD
    // [FIX #6] Сохраняем текущий лист перед добавлением нового
=======
>>>>>>> master
    saveCurrentSheet();

    window.allSheets.push(newSheet);
    window.currentSheetIndex = window.allSheets.length - 1;

    sheetSize = { width, height };
    nestedParts = [];
    markupRects = [];
    selectedNestedParts = [];
    selectedRectIndex = -1;

    showSheetView = true;
    document.getElementById('showSheet').textContent = 'Скрыть лист';

    const widthEl = document.getElementById('sheetWidth');
    const heightEl = document.getElementById('sheetHeight');
    if (widthEl) widthEl.value = width;
    if (heightEl) heightEl.value = height;

    updateSheetNavigation();
    render();
    updatePartsList();
});

// ═══════════════════════════════════════════════════════════════
// НАВИГАЦИЯ ПО ЛИСТАМ
// ═══════════════════════════════════════════════════════════════
function updateSheetNavigation() {
    const nav = document.getElementById('sheetNavigator');
    const sheetInfo = document.getElementById('sheetInfo');
    const prevBtn = document.getElementById('prevSheet');
    const nextBtn = document.getElementById('nextSheet');
    const resizeBtn = document.getElementById('resizeSheet');
    const deleteBtn = document.getElementById('deleteSheet');

    if (!nav) return;

    if (!showSheetView || !window.allSheets || window.allSheets.length === 0) {
        nav.style.display = 'none';
        return;
    }

    nav.style.display = 'flex';

    const currentSheet = window.allSheets[window.currentSheetIndex];
    const thickness = currentSheet?.thickness ? currentSheet.thickness.toFixed(1) : '0.8';

    if (sheetInfo) {
        sheetInfo.textContent = t('sheet_nav_info', {
            current: window.currentSheetIndex + 1,
            total: window.allSheets.length,
            thickness: thickness
        });
    }

    if (prevBtn) {
        prevBtn.disabled = window.currentSheetIndex === 0;
        prevBtn.style.opacity = window.currentSheetIndex === 0 ? '0.5' : '1';
    }

    const isTrial = typeof LicenseManager !== 'undefined' && LicenseManager.isTrial();
    if (nextBtn) {
        if (isTrial) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.3';
            nextBtn.style.cursor = 'not-allowed';
            nextBtn.title = 'Доступен только первый лист раскладки';
        } else {
            nextBtn.disabled = window.currentSheetIndex === window.allSheets.length - 1;
            nextBtn.style.opacity = window.currentSheetIndex === window.allSheets.length - 1 ? '0.5' : '1';
            nextBtn.title = '';
        }
    }

    if (deleteBtn) {
        if (window.allSheets.length === 1) {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.3';
            deleteBtn.style.cursor = 'not-allowed';
        } else {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '1';
            deleteBtn.style.cursor = 'pointer';
        }
    }
}

// Переключение на предыдущий лист
document.getElementById('prevSheet').addEventListener('click', () => {
    if (window.allSheets && window.currentSheetIndex > 0) {
        // [FIX #6] saveState + [FIX #8] общая функция
        if (typeof saveState === 'function') saveState();
        saveCurrentSheet();

        window.currentSheetIndex--;
        loadSheet(window.currentSheetIndex);

        updateSheetNavigation();
        render();
        updatePartsList();
    }
});

// Переключение на следующий лист
document.getElementById('nextSheet').addEventListener('click', () => {
    if (window.allSheets && window.currentSheetIndex < window.allSheets.length - 1) {
        if (typeof saveState === 'function') saveState();
        saveCurrentSheet();

        window.currentSheetIndex++;
        loadSheet(window.currentSheetIndex);

        updateSheetNavigation();
        render();
        updatePartsList();
    }
});

// ═══════════════════════════════════════════════════════════════
// ИЗМЕНИТЬ РАЗМЕР ЛИСТА
// ═══════════════════════════════════════════════════════════════
document.getElementById('resizeSheet').addEventListener('click', () => {
    if (!window.allSheets || window.allSheets.length === 0) {
        alert('Нет листов для изменения');
        return;
    }

    const currentSheet = window.allSheets[window.currentSheetIndex];
    const oldWidth = currentSheet.sheetSize.width;
    const oldHeight = currentSheet.sheetSize.height;
<<<<<<< HEAD

    const newWidth = prompt('Введите новую ширину листа (мм):', oldWidth);
    if (newWidth === null) return;
    const width = safeParseInt(newWidth, oldWidth); // [FIX #4]

    const newHeight = prompt('Введите новую высоту листа (мм):', oldHeight);
    if (newHeight === null) return;
    const height = safeParseInt(newHeight, oldHeight); // [FIX #4]

    // [FIX #5] Валидация
=======
    const oldThickness = currentSheet.thickness || 0.8;

    const newWidth = prompt('Введите новую ширину листа (мм):', oldWidth);
    if (newWidth === null) return;
    const width = safeParseInt(newWidth, oldWidth);

    const newHeight = prompt('Введите новую высоту листа (мм):', oldHeight);
    if (newHeight === null) return;
    const height = safeParseInt(newHeight, oldHeight);

    // v5.06: Запрос толщины листа
    const newThickness = prompt('Введите толщину листа (мм):', oldThickness);
    if (newThickness === null) return;
    const thickness = parseFloat(newThickness) || 0.8;

    // Валидация
>>>>>>> master
    if (width <= 0 || height <= 0) {
        alert('Размер листа должен быть больше 0');
        return;
    }
    if (width > 10000 || height > 10000) {
        alert('Размер листа не должен превышать 10000 мм');
        return;
    }
<<<<<<< HEAD
=======
    if (thickness <= 0 || thickness > 100) {
        alert('Толщина листа должна быть от 0.1 до 100 мм');
        return;
    }
>>>>>>> master

    if (typeof saveState === 'function') saveState();

    currentSheet.nestedParts = [...nestedParts];
    currentSheet.markupRects = [...(window.markupRects || markupRects || [])];
    currentSheet.sheetSize = { width, height };
<<<<<<< HEAD
=======
    currentSheet.thickness = thickness; // v5.06: сохраняем толщину
>>>>>>> master

    sheetSize = { width, height };
    const widthEl = document.getElementById('sheetWidth');
    const heightEl = document.getElementById('sheetHeight');
    if (widthEl) widthEl.value = width;
    if (heightEl) heightEl.value = height;

    // Проверяем, не выходят ли детали за новые границы
    const outOfBounds = nestedParts.some(n =>
        n.x + n.width > width || n.y + n.height > height
    );
    if (outOfBounds) {
        alert('Внимание! Некоторые детали выходят за новые границы листа.\nПроверьте раскладку.');
    }

    render();
    updateSheetNavigation();
});

// ═══════════════════════════════════════════════════════════════
// УДАЛИТЬ ЛИСТ
// ═══════════════════════════════════════════════════════════════
document.getElementById('deleteSheet').addEventListener('click', () => {
    if (!window.allSheets || window.allSheets.length === 0) {
        alert('Нет листов для удаления');
        return;
    }

    if (window.allSheets.length === 1) {
        alert('Нельзя удалить единственный лист');
        return;
    }

    const sheetNum = window.currentSheetIndex + 1;
    if (confirm(`Удалить лист ${sheetNum}?\n\nВсе детали на этом листе будут удалены.`)) {
        if (typeof saveState === 'function') saveState();

        // [FIX #8] Используем общую функцию сохранения
        saveCurrentSheet();

        window.allSheets.splice(window.currentSheetIndex, 1);

        if (window.currentSheetIndex >= window.allSheets.length) {
            window.currentSheetIndex = window.allSheets.length - 1;
        }

        // [FIX #8] Используем общую функцию загрузки
        loadSheet(window.currentSheetIndex);

        updateSheetNavigation();
        render();
        updatePartsList();
    }
});