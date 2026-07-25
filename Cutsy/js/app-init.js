// ═══════════════════════════════════════════════════════
// Блокировка правой кнопки мыши (защита от "Просмотра кода страницы")
// ═══════════════════════════════════════════════════════
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// ═══════════════════════════════════════════════════════
// ВОССТАНОВЛЕНИЕ ДЕТАЛЕЙ ИЗ КЭША ПРИ ЗАГРУЗКЕ
// ═══════════════════════════════════════════════════════
if (typeof restoreFromCache === 'function') {
    const restored = restoreFromCache();
    if (restored) {
        console.log('✅ [app-init] Детали восстановлены из кэша:', parts.length);

        // Восстанавливаем видимые детали — добавляем их объекты на canvas
        if (typeof parts !== 'undefined' && typeof objects !== 'undefined' && typeof selectedObjects !== 'undefined') {
            parts.forEach(function(part) {
                if (part.visible && part.objects && part.objects.length > 0) {
                    for (let i = 0; i < part.objects.length; i++) {
                        const obj = part.objects[i];
                        if (objects.indexOf(obj) === -1) {
                            objects.push(obj);
                        }
                        if (selectedObjects.indexOf(obj) === -1) {
                            selectedObjects.push(obj);
                        }
                    }
                    isEditingPart = true;
                    editingPartId = part.id;
                    if (typeof window !== 'undefined') {
                        window.isEditingPart = isEditingPart;
                        window.editingPartId = editingPartId;
                    }
                }
            });
            console.log('✅ [app-init] Видимые детали восстановлены на холсте');
        }

        // Обновляем UI
        if (typeof updatePartsList === 'function') updatePartsList();
        if (typeof render === 'function') render();
    } else {
        console.log('📭 [app-init] Кэш пуст, начинаем с чистого листа');
    }
} else {
    console.warn('⚠️ [app-init] restoreFromCache не определён');
}
