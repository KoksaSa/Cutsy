// ═══════════════════════════════════════════════════════════════
// group-tool.js — v1.0 — Группировка/Разгруппировка объектов
// ═══════════════════════════════════════════════════════════════
// Позволяет объединять выделенные объекты в "макроэлемент" (группу)
// и перемещать их как единое целое, схватив ЛКМ за заливку.
//
// Горячие клавиши:
//   Ctrl+G — сгруппировать выделенные объекты
//   Ctrl+Shift+G — разгруппировать
//
// Свойства объектов:
//   obj._groupId — ID группы (число). Объекты с одинаковым _groupId
//   принадлежат одной группе. undefined = не в группе.
// ═══════════════════════════════════════════════════════════════

(function() {
'use strict';

let groupCounter = 1;
window.groupCounter = groupCounter;

/**
 * Сгруппировать выделенные объекты.
 * Назначает всем selectedObjects одинаковый _groupId.
 */
window.groupSelected = function() {
    if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length < 2) {
        return false;
    }
    const gid = groupCounter++;
    window.groupCounter = groupCounter;
    for (const obj of selectedObjects) {
        if (obj) obj._groupId = gid;
    }
    if (typeof render === 'function') render();
    console.log(`📦 Группировка: ${selectedObjects.length} объектов → группа #${gid}`);
    return true;
};

/**
 * Разгруппировать выделенные объекты.
 * Удаляет _groupId у всех selectedObjects.
 */
window.ungroupSelected = function() {
    if (typeof selectedObjects === 'undefined' || !selectedObjects || selectedObjects.length === 0) {
        return false;
    }
    let count = 0;
    for (const obj of selectedObjects) {
        if (obj && obj._groupId !== undefined) {
            delete obj._groupId;
            count++;
        }
    }
    if (typeof render === 'function') render();
    console.log(`📦 Разгруппировка: ${count} объектов`);
    return count > 0;
};

/**
 * Получить все объекты, принадлежащие той же группе, что и obj.
 * @param {Object} obj — объект с _groupId
 * @returns {Array} массив объектов той же группы (включая obj)
 */
window.getGroupObjects = function(obj) {
    if (!obj || obj._groupId === undefined) return [obj];
    if (typeof objects === 'undefined') return [obj];
    return objects.filter(o => o && o._groupId === obj._groupId);
};

/**
 * Проверяет, является ли клик внутри bbox группы.
 * Используется для "захвата за заливку" — клик внутри контура группы
 * выделяет всю группу, даже если не попал на линию.
 * @param {number} x — X клика
 * @param {number} y — Y клика
 * @returns {Object|null} любой объект группы, если клик внутри bbox группы
 */
window.findGroupAtPoint = function(x, y) {
    if (typeof objects === 'undefined' || !objects) return null;

    // Собираем все уникальные groupId
    const groupIds = new Set();
    for (const obj of objects) {
        if (obj && obj._groupId !== undefined) {
            groupIds.add(obj._groupId);
        }
    }
    if (groupIds.size === 0) return null;

    // Для каждой группы проверяем, внутри ли bbox клик
    for (const gid of groupIds) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let anyObj = null;
        for (const obj of objects) {
            if (!obj || obj._groupId !== gid) continue;
            if (!anyObj) anyObj = obj;
            if (typeof obj.getPoints === 'function') {
                try {
                    const pts = obj.getPoints();
                    for (const p of pts) {
                        if (p && typeof p.x === 'number') {
                            if (p.x < minX) minX = p.x;
                            if (p.x > maxX) maxX = p.x;
                            if (p.y < minY) minY = p.y;
                            if (p.y > maxY) maxY = p.y;
                        }
                    }
                } catch(e) {}
            } else if (obj.type === 'line') {
                if (obj.x1 < minX) minX = obj.x1; if (obj.x1 > maxX) maxX = obj.x1;
                if (obj.x2 < minX) minX = obj.x2; if (obj.x2 > maxX) maxX = obj.x2;
                if (obj.y1 < minY) minY = obj.y1; if (obj.y1 > maxY) maxY = obj.y1;
                if (obj.y2 < minY) minY = obj.y2; if (obj.y2 > maxY) maxY = obj.y2;
            } else if (obj.type === 'circle' || obj.type === 'arc') {
                const r = obj.radius || 0;
                if (obj.cx - r < minX) minX = obj.cx - r;
                if (obj.cx + r > maxX) maxX = obj.cx + r;
                if (obj.cy - r < minY) minY = obj.cy - r;
                if (obj.cy + r > maxY) maxY = obj.cy + r;
            } else if (obj.type === 'rect') {
                if (obj.x < minX) minX = obj.x;
                if (obj.x + obj.width > maxX) maxX = obj.x + obj.width;
                if (obj.y < minY) minY = obj.y;
                if (obj.y + obj.height > maxY) maxY = obj.y + obj.height;
            }
        }
        if (anyObj && minX !== Infinity && maxX !== -Infinity) {
            if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
                return anyObj;  // Возвращаем любой объект группы
            }
        }
    }
    return null;
};

console.log('✅ group-tool.js v1.0 загружен — groupSelected / ungroupSelected / findGroupAtPoint');
})();
