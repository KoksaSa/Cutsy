// ═══════════════════════════════════════════════════════
// КОНФИГУРАЦИЯ ПРОИЗВОДИТЕЛЬНОСТИ
// ═══════════════════════════════════════════════════════

window.APP_CONFIG = {
    // Включить отладочные логи (false для продакшена)
    DEBUG: false,
    
    // Максимум объектов до предупреждения о производительности
    MAX_OBJECTS_WARNING: 5000,
    
    // Максимум деталей на листе до предупреждения
    MAX_NESTED_PARTS_WARNING: 2000,
    
    // Включить Web Worker для нестинга (true = быстрее)
    USE_WORKER: true,
    
    // Шаг зума (чем меньше, тем плавнее, но медленнее)
    ZOOM_STEP: 0.1,
    
    // Максимальный FPS для рендеринга (0 = без ограничений)
    TARGET_FPS: 60
};

// Вспомогательная функция для логов
window.LOG = function(...args) {
    if (window.APP_CONFIG?.DEBUG) {
        console.log(...args);
    }
};

window.WARN = function(...args) {
    console.warn(...args);
};

window.ERROR = function(...args) {
    console.error(...args);
};
