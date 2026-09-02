// ═══════════════════════════════════════════════════════════
// markup-tools.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

// Переключатель режима разметки (кнопка справа)
document.getElementById('toggleMarkupRectRight').addEventListener('click', () => {
    if (!showSheetView) {
        alert('📋 Сначала включите отображение листа (кнопка "👁️ Показать лист")');
        return;
    }
    isDrawingRect = !isDrawingRect;
    const btn = document.getElementById('toggleMarkupRectRight');
    if (isDrawingRect) {
        btn.style.background = '#7a5a2d';
        const modeLabels = { rect: '▢ Прямоугольник', circle: '⭕ Круг', polygon: '⬡ Ломаная' };
        btn.textContent = '✅ ' + (modeLabels[currentMarkupMode] || 'Разметка');
    } else {
        btn.style.background = '#5a4a2d';
        btn.textContent = '⬜ Разметка остатка';
        currentRect = null;
        currentCircle = null;
        markupPolygonPoints = [];
        isDrawingMarkupPolygon = false;
        selectedRectIndex = -1;
    }
    render();
});

// Выпадающий список выбора типа разметки
const markupDropdown = document.getElementById('markupModeDropdown');
const markupModeMenu = document.getElementById('markupModeMenu');

if (markupDropdown && markupModeMenu) {
    markupDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        markupModeMenu.style.display = markupModeMenu.style.display === 'none' ? 'block' : 'none';
    });

    markupModeMenu.querySelectorAll('[data-mode]').forEach(item => {
        item.addEventListener('click', (e) => {
            currentMarkupMode = e.target.dataset.mode;
            markupModeMenu.style.display = 'none';

            // Автоматически включаем режим разметки если выбран тип
            if (!isDrawingRect) {
                isDrawingRect = true;
            }

            const btn = document.getElementById('toggleMarkupRectRight');
            const modeLabels = { rect: '▢ Прямоугольник', circle: '⭕ Круг', polygon: '⬡ Ломаная' };
            btn.style.background = '#7a5a2d';
            btn.textContent = '✅ ' + (modeLabels[currentMarkupMode] || 'Разметка');

            render();
        });
    });

    // Закрытие меню при клике вне
    document.addEventListener('click', () => {
        markupModeMenu.style.display = 'none';
    });
}

// Очистка всех прямоугольников разметки
document.getElementById('clearMarkupRects').addEventListener('click', () => {
    if (!showSheetView) {
        alert('📋 Сначала включите отображение листа (кнопка "👁️ Показать лист")');
        return;
    }
    if (markupRects.length === 0) {
        alert('ℹ️ Нет прямоугольников разметки');
        return;
    }
    // Очищаем без подтверждения
    markupRects = [];
    selectedRectIndex = -1;
    window.markupRects = [];  // Обновляем глобальную переменную
    window.selectedRectIndex = -1;  // Обновляем глобальную переменную

    // Сохраняем пустой массив в текущем листе
    if (window.allSheets && window.allSheets[window.currentSheetIndex]) {
        window.allSheets[window.currentSheetIndex].markupRects = [];
    }

    render();
    console.log('✅ Разметка очищена');
});

// ═══════════════════════════════════════════════════════════════
// КНОПКА "ЛИНИЯ ОБРЕЗКИ"
// ═══════════════════════════════════════════════════════════════
document.getElementById('toggleCutRemnant').addEventListener('click', () => {
    if (!showSheetView) {
        alert('📋 Сначала включите отображение листа (кнопка "👁️ Показать лист")');
        return;
    }

    const currentSheet = window.allSheets && window.allSheets.length > 0
        ? window.allSheets[window.currentSheetIndex || 0] : null;

    // Переключаем состояние для текущего листа
    const newState = currentSheet ? !currentSheet.showCutRemnantLine : !window.showCutRemnantLine;

    if (currentSheet) {
        currentSheet.showCutRemnantLine = newState;
        window.showCutRemnantLine = newState;

        if (newState) {
            // Вычисляем начальную позицию: нижняя граница самой нижней детали
            if (!currentSheet.cutRemnantLine && nestedParts.length > 0) {
                let maxY = 0;
                nestedParts.forEach(nested => {
                    const bottomEdge = nested.y + nested.height;
                    if (bottomEdge > maxY) maxY = bottomEdge;
                });
                currentSheet.cutRemnantLine = { y: maxY };
            }
            window.cutRemnantLine = currentSheet.cutRemnantLine;
        }
    } else {
        window.showCutRemnantLine = newState;
        if (newState && !window.cutRemnantLine && nestedParts.length > 0) {
            let maxY = 0;
            nestedParts.forEach(nested => {
                const bottomEdge = nested.y + nested.height;
                if (bottomEdge > maxY) maxY = bottomEdge;
            });
            window.cutRemnantLine = { y: maxY };
        }
    }

    const btn = document.getElementById('toggleCutRemnant');
    if (newState) {
        btn.style.background = '#7a2d2d';
        btn.textContent = '✅ Линия обрезки: ВКЛ';
    } else {
        btn.style.background = '#7a5a2d';
        btn.textContent = '✂️ Линия обрезки';
        window.isDraggingCutLine = false;
    }
    render();
});

