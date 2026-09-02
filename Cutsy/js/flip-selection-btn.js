// ═══════════════════════════════════════════════════════════
// flip-selection-btn.js — извлечено из index.html
// ═══════════════════════════════════════════════════════════

// Обработчик кнопки отражения выделенных объектов
document.getElementById('flipSelectionBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!selectedObjects || selectedObjects.length === 0) {
        alert('⚠️ Выделите объекты для отражения');
        return;
    }
    // Показываем меню в центре экрана
    showFlipMenu(window.innerWidth / 2 - 100, window.innerHeight / 2 - 80);
});

