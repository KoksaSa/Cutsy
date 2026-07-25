// ═══════════════════════════════════════════════════════════════
// keyboard-move.js — v1.0 — Перемещение объектов стрелками клавиатуры
// ═══════════════════════════════════════════════════════════════
// Стрелки перемещают ВЫДЕЛЕННЫЕ объекты (selectedObjects):
//   - Краткое нажатие: шаг 1мм
//   - Долгое нажатие (удержание > 500мс): шаг 10мм
//
// Ctrl+стрелки — всегда шаг 10мм (независимо от длительности).
// Стрелки работают только когда:
//   - Нет активного ввода в текстовом поле (input/textarea)
//   - Не активен инструмент рисования (select режим)
//   - Есть выделенные объекты
//
// После перемещения вызывается saveState() (один раз на отпускание)
// и render() для обновления холста.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

const STEP_SMALL = 1.0;   // мм — краткое нажатие
const STEP_LARGE = 10.0;  // мм — долгое нажатие / Ctrl
const HOLD_THRESHOLD = 500; // мс — порог перехода на большой шаг

// Состояние удержания клавиш
const keyState = {}; // {ArrowUp: {startTime, fired, lastStep}}

// v1.1: Накопленная дельта перемещения стрелками (для отображения в #coords)
let keyboardMoveDelta = { x: 0, y: 0 };
let keyboardMoveActive = false; // активна ли серия перемещений стрелками

/**
 * Сбрасывает накопленную дельту (вызывается при клике мышью или новом старте).
 */
window.resetKeyboardMoveDelta = function() {
    keyboardMoveDelta = { x: 0, y: 0 };
    keyboardMoveActive = false;
};

// Сброс дельты при клике мышью (начало нового drag)
if (typeof canvas !== 'undefined' && canvas) {
    canvas.addEventListener('mousedown', () => {
        window.resetKeyboardMoveDelta();
    }, true); // capture phase — перехватываем раньше
}

window.addEventListener('keydown', (e) => {
    // Не обрабатываем, если фокус в текстовом поле
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    // Только стрелки
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

    // Проверяем, что есть выделенные объекты
    if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length === 0) return;

    // Не обрабатываем в режиме рисования (кроме select)
    if (typeof currentTool !== 'undefined' && currentTool !== 'select' && currentTool !== 'fillet' && currentTool !== 'chamfer' && currentTool !== 'eraser') {
        // Разрешаем только в select-режиме
        if (currentTool !== 'select') return;
    }

    e.preventDefault(); // предотвращаем скролл страницы

    // Если клавиша уже нажата (повтор keydown) — игнорируем, обрабатываем в таймере
    if (keyState[e.key] && keyState[e.key].active) {
        return;
    }

    // Определяем шаг: Ctrl = всегда большой
    const useLargeStep = (typeof isCtrlPressed !== 'undefined' && isCtrlPressed) || e.ctrlKey;
    const step = useLargeStep ? STEP_LARGE : STEP_SMALL;

    // Выполняем первое перемещение сразу
    moveSelectedByKey(e.key, step);
    if (typeof saveState === 'function') {
        saveState();
    } else if (typeof window.saveState === 'function') {
        window.saveState();
    }

    // Запускаем таймер для долгого нажатия
    keyState[e.key] = {
        active: true,
        startTime: Date.now(),
        fired: true,
        largeStepStarted: false,
        intervalId: null
    };

    // Через HOLD_THRESHOLD мс — переключаемся на большой шаг (если не Ctrl)
    keyState[e.key].timeoutId = setTimeout(() => {
        if (!keyState[e.key] || !keyState[e.key].active) return;
        if (useLargeStep) return; // уже большой шаг
        keyState[e.key].largeStepStarted = true;
        // Повторяем перемещение с большим шагом каждые 80мс
        keyState[e.key].intervalId = setInterval(() => {
            if (!keyState[e.key] || !keyState[e.key].active) return;
            moveSelectedByKey(e.key, STEP_LARGE);
            if (typeof window.saveState === 'function') window.saveState();
        }, 80);
    }, HOLD_THRESHOLD);
});

window.addEventListener('keyup', (e) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const state = keyState[e.key];
    if (state) {
        state.active = false;
        if (state.timeoutId) clearTimeout(state.timeoutId);
        if (state.intervalId) clearInterval(state.intervalId);
    }
    delete keyState[e.key];
});

// Сброс при потере фокуса
window.addEventListener('blur', () => {
    for (const key of Object.keys(keyState)) {
        const state = keyState[key];
        if (state) {
            state.active = false;
            if (state.timeoutId) clearTimeout(state.timeoutId);
            if (state.intervalId) clearInterval(state.intervalId);
        }
        delete keyState[key];
    }
});

/**
 * Перемещает выделенные объекты в направлении стрелки.
 * @param {string} arrowKey — 'ArrowUp'/'ArrowDown'/'ArrowLeft'/'ArrowRight'
 * @param {number} step — шаг в мм
 */
function moveSelectedByKey(arrowKey, step) {
    let dx = 0, dy = 0;
    switch (arrowKey) {
        case 'ArrowUp':    dy = -step; break; // canvas Y-down: вверх = уменьшение Y
        case 'ArrowDown':  dy =  step; break;
        case 'ArrowLeft':  dx = -step; break;
        case 'ArrowRight': dx =  step; break;
        default: return;
    }

    // v1.1: Накапливаем дельту (для отображения в #coords)
    keyboardMoveActive = true;
    keyboardMoveDelta.x += dx;
    keyboardMoveDelta.y += dy;

    // Обновляем #coords как при мышином drag
    const coordsEl = document.getElementById('coords');
    if (coordsEl) {
        // Инверсия Y для отображения (CAD-style: вверх = +Y)
        const dispDx = Math.round(keyboardMoveDelta.x);
        const dispDy = Math.round(-keyboardMoveDelta.y);
        coordsEl.textContent = `ΔX: ${dispDx > 0 ? '+' : ''}${dispDx}, ΔY: ${dispDy > 0 ? '+' : ''}${dispDy} мм`;
    }

    if (typeof selectedObjects === 'undefined' || !selectedObjects) return;

    for (const obj of selectedObjects) {
        if (!obj) continue;
        if (typeof obj.move === 'function') {
            obj.move(dx, dy);
        } else {
            // Fallback: перемещаем вручную по типу
            moveObjectManual(obj, dx, dy);
        }
    }

    // Если редактируем деталь — обновляем bounds
    if (typeof isEditingPart !== 'undefined' && isEditingPart &&
        typeof editingPartId !== 'undefined' && editingPartId !== null &&
        typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
        const part = parts.find(p => samePartId(p.id, editingPartId));
        if (part) updatePartBounds(part);
    }

    // Обновляем холст
    if (typeof render === 'function') {
        render();
    } else if (typeof window.render === 'function') {
        window.render();
    }

    // Воспроизводим звук (если доступен)
    if (typeof playMoveSound === 'function') {
        playMoveSound();
    }
}

/**
 * Ручное перемещение объекта (fallback если нет метода move).
 */
function moveObjectManual(obj, dx, dy) {
    if (obj.type === 'line') {
        obj.x1 += dx; obj.y1 += dy;
        obj.x2 += dx; obj.y2 += dy;
    } else if (obj.type === 'circle' || obj.type === 'arc') {
        obj.cx += dx; obj.cy += dy;
    } else if (obj.type === 'rect') {
        obj.x += dx; obj.y += dy;
    } else if (obj.type === 'polygon') {
        if (obj.cx !== undefined) { obj.cx += dx; obj.cy += dy; }
        if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
    } else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
        if (obj.vertices) obj.vertices.forEach(p => { p.x += dx; p.y += dy; });
    } else if (obj.type === 'text') {
        if (obj.x !== undefined) { obj.x += dx; obj.y += dy; }
        else if (obj.center) { obj.center.x += dx; obj.center.y += dy; }
    }
}

console.log('✅ keyboard-move.js загружен (v1.0) — стрелки: перемещение выделенных объектов (1мм, удержание 10мм)');

})();
