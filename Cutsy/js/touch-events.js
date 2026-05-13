// ═══════════════════════════════════════════════════════════════
// TOUCH ОБРАБОТЧИКИ ДЛЯ МОБИЛЬНЫХ УСТРОЙСТВ
// ═══════════════════════════════════════════════════════════════

/**
 * Преобразование touch координат в canvas координаты
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 * @param {Touch} touch - Touch объект
 * @returns {{x: number, y: number}} - Координаты в canvas
 */
function getTouchPos(canvas, touch) {
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return {
        x: (touch.clientX - rect.left) * scale,
        y: (touch.clientY - rect.top) * scale
    };
}

/**
 * Инициализация touch событий для canvas
 * @param {HTMLCanvasElement} canvas - Canvas элемент
 */
function initTouchEvents(canvas) {
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTouchPos = { x: 0, y: 0 };
    let isDragging = false;
    let dragThreshold = 10; // Порог для определения перетаскивания vs тапа

    console.log('📱 [TouchEvents] Инициализация touch событий');

    // Touch start
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            lastTouchPos = { x: touch.clientX, y: touch.clientY };
            isDragging = false;
            
            // Преобразуем в canvas координаты
            const pos = getTouchPos(canvas, touch);
            const x = pos.x;
            const y = pos.y;
            
            console.log('👆 [TouchStart] x=', x.toFixed(1), 'y=', y.toFixed(1));
            
            // Эмулируем mousedown через глобальный обработчик
            if (typeof window.onCanvasTouchStart === 'function') {
                window.onCanvasTouchStart(x, y, e);
            }
        } else if (e.touches.length === 2) {
            // Многокасательный жест (зум)
            console.log('🤏 [TouchStart] Два пальца - режим зума');
            isDragging = false;
            // Здесь можно добавить логику зума двумя пальцами
        }
    }, { passive: false });

    // Touch move
    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - lastTouchPos.x;
            const dy = touch.clientY - lastTouchPos.y;
            
            // Если движение больше порога — это перетаскивание
            if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                isDragging = true;
                console.log('👆 [TouchMove] Перетаскивание начато');
            }
            
            lastTouchPos = { x: touch.clientX, y: touch.clientY };
            
            // Преобразуем в canvas координаты
            const pos = getTouchPos(canvas, touch);
            const x = pos.x;
            const y = pos.y;
            
            // Эмулируем mousemove через глобальный обработчик
            if (typeof window.onCanvasTouchMove === 'function') {
                window.onCanvasTouchMove(x, y, e, isDragging);
            }
        } else if (e.touches.length === 2) {
            // Многокасательный жест — зум
            e.preventDefault();
            console.log('🤏 [TouchMove] Зум двумя пальями');
            // Здесь можно добавить логику зума двумя пальцами
        }
    }, { passive: false });

    // Touch end
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        console.log('👆 [TouchEnd] isDragging=', isDragging);
        
        // Эмулируем mouseup через глобальный обработчик
        if (typeof window.onCanvasTouchEnd === 'function') {
            window.onCanvasTouchEnd(e, isDragging);
        }
        
        // Если не было перетаскивания — это был тап
        if (!isDragging) {
            console.log('👆 [TouchEnd] Тап (не перетаскивание)');
        }
    }, { passive: false });

    // Touch cancel
    canvas.addEventListener('touchcancel', (e) => {
        console.log('👆 [TouchCancel]');
        if (typeof window.onCanvasTouchEnd === 'function') {
            window.onCanvasTouchEnd(e, false);
        }
    }, { passive: false });

    // Предотвращение контекстного меню при long press
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });
}

/**
 * Предотвращение зума по двойному тапу
 * @param {HTMLElement} element - Элемент для мониторинга
 */
function preventDoubleTapZoom(element) {
    let lastTouchEnd = 0;
    
    element.addEventListener('touchend', (e) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
            console.log('🚫 [DoubleTap] Предотвращен двойной тап');
            e.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

/**
 * Предотвращение контекстного меню при long press
 * @param {HTMLElement} element - Элемент для мониторинга
 */
function preventLongPressMenu(element) {
    let touchStart = 0;
    let touchTimer = null;
    
    element.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            touchStart = Date.now();
            touchTimer = setTimeout(() => {
                console.log('⏱️ [LongPress] Long press detected');
                // Здесь можно показать контекстное меню если нужно
            }, 500); // 500ms для long press
        }
    }, { passive: true });
    
    element.addEventListener('touchend', (e) => {
        if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
        }
    }, { passive: true });
}

// Экспорт функций в глобальную область видимости
if (typeof window !== 'undefined') {
    window.initTouchEvents = initTouchEvents;
    window.preventDoubleTapZoom = preventDoubleTapZoom;
    window.preventLongPressMenu = preventLongPressMenu;
    window.getTouchPos = getTouchPos;
}
