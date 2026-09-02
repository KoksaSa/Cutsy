// ═══════════════════════════════════════════════════════════════
// touch-events.js — v1.0 — Touch support для планшетов
// ═══════════════════════════════════════════════════════════════
// Маппинг touch событий в mouse события + pinch-to-zoom.
//
// Single touch → mousedown/mousemove/mouseup (рисование, выделение)
// Two-finger pinch → zoom (приближение/отдаление)
// Two-finger drag → pan (перемещение холста)
//
// touch-action: none на canvas предотвращает браузерный зум/скролл.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

// Состояние touch
let touchState = {
    mode: null,        // 'single' | 'pinch' | 'pan'
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startDist: 0,      // начальное расстояние между пальцами
    startZoom: 1,      // зум в начале pinch
    startPanX: 0,      // pan в начале pinch
    startPanY: 0,
    pinchCenter: null,  // центр между пальцами
    startMidX: 0,       // начальная середина между пальцами
    startMidY: 0,
    longPressTimer: null,
    hasMoved: false
};

const LONG_PRESS_DURATION = 500;  // мс — long press для контекстного меню
const MOVE_THRESHOLD = 5;         // px — порог движения (отменяет long press)

/**
 * Инициализация touch-событий на canvas.
 */
function initTouchEvents() {
    if (!canvas) {
        console.warn('[TOUCH] canvas не найден, touch-events не инициализированы');
        return;
    }

    // Предотвращаем браузерный зум/скролл на canvas
    canvas.style.touchAction = 'none';

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    console.log('✅ touch-events.js загружен (v1.0) — touch support активен');
}

/**
 * Получить центральную точку между двумя касаниями.
 */
function getTouchMid(touch1, touch2) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (touch1.clientX + touch2.clientX) / 2 - rect.left,
        y: (touch1.clientY + touch2.clientY) / 2 - rect.top
    };
}

/**
 * Расстояние между двумя касаниями.
 */
function getTouchDist(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.hypot(dx, dy);
}

/**
 * Создаёт и диспатчит синтетическое mouse-событие.
 */
function dispatchMouseEvent(type, touch, button = 0) {
    if (!touch) return;
    const rect = canvas.getBoundingClientRect();
    const mouseEvent = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        button: button,
        buttons: (type === 'mousemove') ? (button === 2 ? 2 : 1) : 0,
        clientX: touch.clientX,
        clientY: touch.clientY,
        screenX: touch.screenX,
        screenY: touch.screenY,
        // Координаты относительно canvas
        offsetX: touch.clientX - rect.left,
        offsetY: touch.clientY - rect.top
    });
    canvas.dispatchEvent(mouseEvent);
}

/**
 * Обработка touchstart.
 */
function handleTouchStart(e) {
    e.preventDefault();

    const touches = e.touches;

    if (touches.length === 1) {
        // Single touch — маппим в mousedown
        touchState.mode = 'single';
        touchState.startX = touches[0].clientX;
        touchState.startY = touches[0].clientY;
        touchState.lastX = touches[0].clientX;
        touchState.lastY = touches[0].clientY;
        touchState.hasMoved = false;

        // Long press для контекстного меню (правый клик)
        touchState.longPressTimer = setTimeout(() => {
            if (!touchState.hasMoved && touchState.mode === 'single') {
                dispatchMouseEvent('contextmenu', touches[0], 2);
                touchState.longPressTimer = null;
            }
        }, LONG_PRESS_DURATION);

        dispatchMouseEvent('mousedown', touches[0], 0);
    }
    else if (touches.length === 2) {
        // Two fingers — pinch-to-zoom или pan
        touchState.mode = 'pinch';
        touchState.startDist = getTouchDist(touches[0], touches[1]);
        touchState.startZoom = (typeof zoom !== 'undefined') ? zoom : 1;
        touchState.startPanX = (typeof panX !== 'undefined') ? panX : 0;
        touchState.startPanY = (typeof panY !== 'undefined') ? panY : 0;

        const mid = getTouchMid(touches[0], touches[1]);
        touchState.startMidX = mid.x;
        touchState.startMidY = mid.y;

        // Отменяем long press
        if (touchState.longPressTimer) {
            clearTimeout(touchState.longPressTimer);
            touchState.longPressTimer = null;
        }

        // Отменяем single-touch drag (dispatch mouseup)
        dispatchMouseEvent('mouseup', touches[0], 0);
    }
}

/**
 * Обработка touchmove.
 */
function handleTouchMove(e) {
    e.preventDefault();

    const touches = e.touches;

    if (touches.length === 1 && touchState.mode === 'single') {
        // Single touch — маппим в mousemove
        const dx = Math.abs(touches[0].clientX - touchState.startX);
        const dy = Math.abs(touches[0].clientY - touchState.startY);

        if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
            touchState.hasMoved = true;
            if (touchState.longPressTimer) {
                clearTimeout(touchState.longPressTimer);
                touchState.longPressTimer = null;
            }
        }

        dispatchMouseEvent('mousemove', touches[0], 0);
        touchState.lastX = touches[0].clientX;
        touchState.lastY = touches[0].clientY;
    }
    else if (touches.length === 2 && (touchState.mode === 'pinch' || touchState.mode === 'pan')) {
        // Pinch-to-zoom
        const dist = getTouchDist(touches[0], touches[1]);
        const mid = getTouchMid(touches[0], touches[1]);

        if (touchState.startDist > 0) {
            const scale = dist / touchState.startDist;
            let newZoom = touchState.startZoom * scale;

            // Ограничиваем зум
            const MIN_ZOOM = (typeof MIN_MAIN_ZOOM !== 'undefined') ? MIN_MAIN_ZOOM : 0.1;
            const MAX_ZOOM = (typeof MAX_MAIN_ZOOM !== 'undefined') ? MAX_MAIN_ZOOM : 50;
            newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

            // Pan: смещение центра между пальцами
            const panDx = mid.x - touchState.startMidX;
            const panDy = mid.y - touchState.startMidY;

            if (typeof zoom !== 'undefined') {
                zoom = newZoom;
                window.zoom = zoom;
            }
            if (typeof panX !== 'undefined') {
                panX = touchState.startPanX + panDx;
                window.panX = panX;
            }
            if (typeof panY !== 'undefined') {
                panY = touchState.startPanY + panDy;
                window.panY = panY;
            }

            // Обновляем холст
            if (typeof render === 'function') {
                render();
            } else if (typeof window.render === 'function') {
                window.render();
            }
        }
    }
}

/**
 * Обработка touchend.
 */
function handleTouchEnd(e) {
    e.preventDefault();

    // Отменяем long press
    if (touchState.longPressTimer) {
        clearTimeout(touchState.longPressTimer);
        touchState.longPressTimer = null;
    }

    if (touchState.mode === 'single') {
        // Single touch end — dispatch mouseup
        // Используем lastX/lastY т.к. touches[0] может быть пустым
        const fakeTouch = {
            clientX: touchState.lastX,
            clientY: touchState.lastY,
            screenX: 0,
            screenY: 0
        };
        dispatchMouseEvent('mouseup', fakeTouch, 0);
    }

    // Если осталось одно касание — переключаемся в single mode
    const remaining = e.touches;
    if (remaining.length === 1) {
        touchState.mode = 'single';
        touchState.startX = remaining[0].clientX;
        touchState.startY = remaining[0].clientY;
        touchState.lastX = remaining[0].clientX;
        touchState.lastY = remaining[0].clientY;
        touchState.hasMoved = false;
        // НЕ dispatch mousedown — это продолжение жеста
    } else {
        touchState.mode = null;
    }
}

// Инициализация при загрузке
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTouchEvents);
} else {
    initTouchEvents();
}

})();