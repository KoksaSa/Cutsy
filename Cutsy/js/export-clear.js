// ═══════════════════════════════════════════════════════════
// export-clear.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

// Экспорт раскладки в DXF
document.getElementById('exportDxf').addEventListener('click', () => {
    if (nestedParts.length === 0) {
        alert('⚠️ Нет деталей для экспорта');
        return;
    }
    exportSheetToDXF();
});

document.getElementById('clearAll').addEventListener('click', () => {
    if (objects.length === 0 && dimensionLines.length === 0 && parts.length === 0) return;
    if (confirm('Вы уверены, что хотите удалить все объекты, размеры и детали?')) {
        saveState();
        objects = [];
        dimensionLines = [];
        selectedObjects = [];
        selectedDimension = null;
        selectedEdge = null;
        parts = [];
        nestedParts = [];
        updatePartsList();
        showProperties(null);

        // Скрываем лист с раскладкой
        showSheetView = false;
        document.getElementById('showSheet').textContent = '👁️ Показать лист';

        // Скрываем панель инструментов раскладки
        const sheetTools = document.getElementById('sheetTools');
        if (sheetTools) sheetTools.style.display = 'none';

        // Сбрасываем зум и панорамирование (как после F5)
        panX = 0;
        panY = 0;
        zoom = 1;

        render();
        // Очищаем кэш (новые ключи)
        localStorage.removeItem('nesting_parts_cache');
        localStorage.removeItem('nesting_nested_parts_cache');
        localStorage.removeItem('nesting_sheet_remnant_cache');
        // Очищаем кэш (старые ключи для совместимости)
        localStorage.removeItem('cadParts');
        localStorage.removeItem('cadNestedParts');
        localStorage.removeItem('cadSheetRemnant');
    }
});

// ═══════════════════════════════════════════════════════════
// Кнопка "Очистить холст" — удаляет все объекты и скрывает размеры
// ═══════════════════════════════════════════════════════════
document.getElementById('clearCanvas')?.addEventListener('click', () => {
    if (objects.length === 0 && dimensionLines.length === 0) return;
    
    // Сохраняем состояние для undo
    saveState();
    
    // Удаляем все объекты с холста
    objects = [];
    selectedObjects = [];
    
    // Скрываем все размеры
    if (typeof clearDimensions === 'function') {
        clearDimensions();
    } else {
        dimensionLines = [];
        angleDimensions = [];
    }
    
    selectedDimension = null;
    selectedEdge = null;
    
    // Обновляем UI
    if (typeof updatePartsList === 'function') updatePartsList();
    if (typeof showProperties === 'function') showProperties(null);
    
    // Сбрасываем зум и панорамирование
    panX = 0;
    panY = 0;
    zoom = 1;
    
    render();
});

