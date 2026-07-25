// ═══════════════════════════════════════════════════════════════
// pattern-tool.js — v2.0 — Инструменты Паттерн (Fusion 360 style)
// ═══════════════════════════════════════════════════════════════
// Два инструмента для создания массива копий:
//
// НА ЛИСТЕ (showSheetView + selectedNestedParts):
//   Drag-режим с превью — как диагональная раскладка.
//   1. Клик по кнопке → prompt (шаги/радиус) → режим dragging
//   2. Движение мыши → превью призрачных копий
//   3. Стрелки ↑↓ → изменение количества
//   4. Клик на листе → применить (создать копии)
//   5. Escape → отмена
//
// НА ХОЛСТЕ (не showSheetView, редактирование детали):
//   Старый prompt-режим (ввод всех параметров через prompt).
//
// Поддерживаемые типы: line, circle, arc, rect, polygon, polyline,
// lwpolyline, text, spline, ellipse.
// ═══════════════════════════════════════════════════════════════

(function() {
    'use strict';

    const SUPPORTED_TYPES = ['line', 'circle', 'arc', 'rect', 'polygon', 'polyline', 'lwpolyline', 'text', 'spline', 'ellipse'];

    // ═══════════════════════════════════════════════════════════════
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ (для холста/детали)
    // ═══════════════════════════════════════════════════════════════

    function getSelectedObjects() {
        if (typeof selectedObjects !== 'undefined' && selectedObjects && selectedObjects.length > 0) {
            return selectedObjects;
        }
        if (typeof window.selectedObjects !== 'undefined' && window.selectedObjects && window.selectedObjects.length > 0) {
            return window.selectedObjects;
        }
        return [];
    }

    function cloneObject(obj) {
        if (!obj || !obj.type) return null;
        if (typeof obj.clone === 'function') {
            try {
                const copy = obj.clone();
                if (copy) {
                    copy.id = Date.now() + Math.random();
                    if (obj.color) copy.color = obj.color;
                    return copy;
                }
            } catch (e) {}
        }
        if (obj.type === 'line') {
            const copy = new Line(obj.x1, obj.y1, obj.x2, obj.y2);
            copy.id = Date.now() + Math.random();
            if (obj.color) copy.color = obj.color;
            return copy;
        }
        if (obj.type === 'circle') {
            const copy = new Circle(obj.cx, obj.cy, obj.radius);
            copy.id = Date.now() + Math.random();
            if (obj.color) copy.color = obj.color;
            return copy;
        }
        if (obj.type === 'arc') {
            const copy = new Arc(obj.cx, obj.cy, obj.radius, obj.startAngle, obj.endAngle, obj.direction);
            copy.id = Date.now() + Math.random();
            if (obj.color) copy.color = obj.color;
            return copy;
        }
        if (obj.type === 'rect') {
            const copy = new Rect(obj.x, obj.y, obj.width, obj.height);
            copy.id = Date.now() + Math.random();
            if (obj.color) copy.color = obj.color;
            return copy;
        }
        if (obj.type === 'text') {
            const copy = new Text(obj.x, obj.y, obj.text, obj.fontSize);
            copy.id = Date.now() + Math.random();
            if (obj.rotation) copy.rotation = obj.rotation;
            return copy;
        }
        // v2.5: fallback для polygon (plain), polyline, lwpolyline, spline, ellipse
        const copy = { ...obj };
        copy.id = Date.now() + Math.random();
        if (obj.points) copy.points = obj.points.map(p => ({ x: p.x, y: p.y }));
        if (obj.vertices) copy.vertices = obj.vertices.map(p => ({ x: p.x, y: p.y }));
        if (obj.fitPoints) copy.fitPoints = obj.fitPoints.map(p => ({ x: p.x, y: p.y }));
        if (obj.controlPoints) copy.controlPoints = obj.controlPoints.map(p => ({ x: p.x, y: p.y }));
        // v2.5: ellipse (dxf) — majorAxisEndPoint (вектор)
        if (obj.majorAxisEndPoint) copy.majorAxisEndPoint = { x: obj.majorAxisEndPoint.x, y: obj.majorAxisEndPoint.y };
        return copy;
    }

    function moveObject(obj, dx, dy) {
        if (!obj || !obj.type) return;
        if (typeof obj.move === 'function') {
            try { obj.move(dx, dy); return; } catch (e) {}
        }
        if (obj.type === 'line') {
            obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy;
        } else if (obj.type === 'circle' || obj.type === 'arc' || obj.type === 'ellipse') {
            obj.cx += dx; obj.cy += dy;
        } else if (obj.type === 'rect' || obj.type === 'text') {
            obj.x += dx; obj.y += dy;
        } else if (obj.type === 'polygon') {
            if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
            else { obj.cx += dx; obj.cy += dy; }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline' || obj.type === 'spline') {
            if (obj.points) obj.points.forEach(p => { p.x += dx; p.y += dy; });
            if (obj.vertices) obj.vertices.forEach(p => { p.x += dx; p.y += dy; });
            if (obj.fitPoints) obj.fitPoints.forEach(p => { p.x += dx; p.y += dy; });
            if (obj.controlPoints) obj.controlPoints.forEach(p => { p.x += dx; p.y += dy; });
        }
    }

    function rotateObjectAround(obj, cx, cy, angleRad) {
        if (!obj || !obj.type || angleRad === 0) return;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        const rp = (x, y) => ({
            x: cx + (x - cx) * cos - (y - cy) * sin,
            y: cx + (x - cx) * sin + (y - cy) * cos
        });
        if (obj.type === 'line') {
            const p1 = rp(obj.x1, obj.y1);
            const p2 = rp(obj.x2, obj.y2);
            obj.x1 = p1.x; obj.y1 = p1.y; obj.x2 = p2.x; obj.y2 = p2.y;
        } else if (obj.type === 'circle' || obj.type === 'arc' || obj.type === 'ellipse') {
            const c = rp(obj.cx, obj.cy);
            obj.cx = c.x; obj.cy = c.y;
            if (obj.type === 'arc') { obj.startAngle += angleRad; obj.endAngle += angleRad; }
        } else if (obj.type === 'rect' || obj.type === 'text') {
            const c = rp(obj.x, obj.y);
            obj.x = c.x; obj.y = c.y;
            if (obj.type === 'text') obj.rotation = (obj.rotation || 0) + angleRad;
        } else if (obj.type === 'polygon') {
            if (obj.points) obj.points = obj.points.map(p => rp(p.x, p.y));
            else { const c = rp(obj.cx, obj.cy); obj.cx = c.x; obj.cy = c.y; }
        } else if (obj.type === 'polyline' || obj.type === 'lwpolyline' || obj.type === 'spline') {
            const tr = (pts) => pts ? pts.map(p => rp(p.x, p.y)) : pts;
            obj.points = tr(obj.points); obj.vertices = tr(obj.vertices);
            obj.fitPoints = tr(obj.fitPoints); obj.controlPoints = tr(obj.controlPoints);
        }
    }

    function getSelectionCenter(objs) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;
        for (const o of objs) {
            if (!o) continue;
            let pts = null;
            if (typeof o.getPoints === 'function') {
                try { pts = o.getPoints(); } catch (e) { pts = null; }
            }
            if (!pts) {
                if (o.type === 'line') pts = [{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}];
                else if (o.type === 'circle' || o.type === 'arc') {
                    const r = o.radius || 0;
                    pts = [{x:o.cx-r,y:o.cy-r},{x:o.cx+r,y:o.cy+r}];
                } else if (o.type === 'ellipse') {
                    // v2.5: ellipse имеет rx/ry (разные полуоси)
                    const rx = o.rx || 0, ry = o.ry || 0;
                    pts = [{x:o.cx-rx,y:o.cy-ry},{x:o.cx+rx,y:o.cy+ry}];
                } else if (o.type === 'rect') {
                    pts = [{x:o.x,y:o.y},{x:o.x+(o.width||0),y:o.y+(o.height||0)}];
                } else if (o.type === 'text') {
                    pts = [{x:o.x,y:o.y},{x:o.x+20,y:o.y+(o.fontSize||14)}];
                } else {
                    pts = o.points || o.vertices || o.fitPoints || [];
                }
            }
            for (const p of pts) {
                if (!p || typeof p.x !== 'number') continue;
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
                found = true;
            }
        }
        if (!found) return { x: 0, y: 0 };
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    // ═══════════════════════════════════════════════════════════════
    // ПРЯМОУГОЛЬНЫЙ ПАТТЕРН — АКТИВАЦИЯ
    // ═══════════════════════════════════════════════════════════════

    window.activateRectPatternTool = function() {
        // ─── РЕЖИМ ЛИСТА: drag с превью (как diagonal pattern) ───
        if (typeof showSheetView !== 'undefined' && showSheetView &&
            typeof selectedNestedParts !== 'undefined' && selectedNestedParts && selectedNestedParts.length > 0) {
            return activateRectPatternOnSheet();
        }

        // ─── РЕЖИМ ХОЛСТА: drag с превью (объекты детали) ───
        return activateRectPatternOnCanvas();
    };

    function activateRectPatternOnSheet() {
        // v2.9: Убран prompt — сразу WaitCenter (как круговой паттерн).
        // count из localStorage (по умолчанию 4).
        // stepX/stepY вычисляются из (endPoint - startPoint) / (cols-1, rows-1).
        const lastCount = parseInt(localStorage.getItem('lastRectPatternCount')) || 4;
        const count = Math.max(2, Math.min(100, lastCount));

        const sources = selectedNestedParts
            .map(idx => (typeof nestedParts !== 'undefined' && nestedParts[idx]) ? nestedParts[idx] : null)
            .filter(n => n);

        if (sources.length === 0) {
            alert('⚠️ Не удалось получить выделенные детали');
            return;
        }

        // Центр выделения (startPoint по умолчанию — будет установлен кликом)
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        for (const s of sources) {
            gMinX = Math.min(gMinX, s.x);
            gMinY = Math.min(gMinY, s.y);
            gMaxX = Math.max(gMaxX, s.x + s.width);
            gMaxY = Math.max(gMaxY, s.y + s.height);
        }
        const groupCenter = { x: (gMinX + gMaxX) / 2, y: (gMinY + gMaxY) / 2 };

        // v2.9: WaitCenter — ожидание клика для указания первого угла прямоугольника
        if (typeof appState !== 'undefined') {
            appState.rectPatternWaitCenter = true;
            appState.rectPatternDragging = false;
            appState.rectPatternSources = sources;
            appState.rectPatternIsSheetMode = true;
            appState.rectPatternStartPoint = null;
            appState.rectPatternGroupCenter = groupCenter;
            appState.rectPatternEndPoint = null;
            appState.rectPatternStepX = 50;
            appState.rectPatternStepY = 50;
            appState.rectPatternCount = count;
            appState.rectPatternCountManuallySet = true;
        }
        if (typeof window !== 'undefined') {
            window.rectPatternWaitCenter = true;
            window.rectPatternDragging = false;
            window.rectPatternSources = sources;
            window.rectPatternIsSheetMode = true;
            window.rectPatternStartPoint = null;
            window.rectPatternGroupCenter = groupCenter;
            window.rectPatternEndPoint = null;
            window.rectPatternStepX = 50;
            window.rectPatternStepY = 50;
            window.rectPatternCount = count;
            window.rectPatternCountManuallySet = true;
        }

        if (typeof render === 'function') render();
        console.log(`📐 Прямоугольный паттерн на листе: count=${count} — кликните для первого угла`);
    }

    function activateRectPatternOnCanvas() {
        const selObjs = getSelectedObjects();
        if (selObjs.length === 0) {
            alert('⚠️ Выделите объекты для прямоугольного паттерна');
            return;
        }
        const validObjs = selObjs.filter(o => o && SUPPORTED_TYPES.includes(o.type));
        if (validObjs.length === 0) {
            alert(`⚠️ Нет поддерживаемых объектов.\nПоддерживаются: ${SUPPORTED_TYPES.join(', ')}`);
            return;
        }

        // v2.9: Убран prompt — сразу WaitCenter.
        const lastCount = parseInt(localStorage.getItem('lastRectPatternCount')) || 4;
        const count = Math.max(2, Math.min(100, lastCount));

        const groupCenter = getSelectionCenter(validObjs);

        if (typeof appState !== 'undefined') {
            appState.rectPatternWaitCenter = true;
            appState.rectPatternDragging = false;
            appState.rectPatternSources = validObjs;
            appState.rectPatternIsSheetMode = false;
            appState.rectPatternStartPoint = null;
            appState.rectPatternGroupCenter = groupCenter;
            appState.rectPatternEndPoint = null;
            appState.rectPatternStepX = 50;
            appState.rectPatternStepY = 50;
            appState.rectPatternCount = count;
            appState.rectPatternCountManuallySet = true;
        }
        if (typeof window !== 'undefined') {
            window.rectPatternWaitCenter = true;
            window.rectPatternDragging = false;
            window.rectPatternSources = validObjs;
            window.rectPatternIsSheetMode = false;
            window.rectPatternStartPoint = null;
            window.rectPatternGroupCenter = groupCenter;
            window.rectPatternEndPoint = null;
            window.rectPatternStepX = 50;
            window.rectPatternStepY = 50;
            window.rectPatternCount = count;
            window.rectPatternCountManuallySet = true;
        }

        if (typeof render === 'function') render();
        console.log(`📐 Прямоугольный паттерн на холсте: count=${count} — кликните для первого угла`);
    }

    // ═══════════════════════════════════════════════════════════════
    // КРУГОВОЙ ПАТТЕРН — АКТИВАЦИЯ
    // ═══════════════════════════════════════════════════════════════

    window.activateCircularPatternTool = function() {
        if (typeof showSheetView !== 'undefined' && showSheetView &&
            typeof selectedNestedParts !== 'undefined' && selectedNestedParts && selectedNestedParts.length > 0) {
            return activateCircularPatternOnSheet();
        }
        return activateCircularPatternOnCanvas();
    };

    function activateCircularPatternOnSheet() {
        // v2.8: Убран prompt — сразу WaitCenter.
        // count и arcAngle из localStorage (по умолчанию 6, 360).
        // ↑↓ меняют count, ←→ меняют arcAngle, мышь = центр → растягивание.
        const lastCount = parseInt(localStorage.getItem('lastCircPatternCount')) || 6;
        const lastArc = parseFloat(localStorage.getItem('lastCircPatternArc')) || 360;
        const count = Math.max(2, Math.min(50, lastCount));
        const arcAngleDeg = Math.max(30, Math.min(360, lastArc));

        const sources = selectedNestedParts
            .map(idx => (typeof nestedParts !== 'undefined' && nestedParts[idx]) ? nestedParts[idx] : null)
            .filter(n => n);
        if (sources.length === 0) {
            alert('⚠️ Не удалось получить выделенные детали');
            return;
        }

        // v2.7: groupCenter — центр выделения (для расчёта смещений объектов).
        let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
        for (const s of sources) {
            gMinX = Math.min(gMinX, s.x);
            gMinY = Math.min(gMinY, s.y);
            gMaxX = Math.max(gMaxX, s.x + s.width);
            gMaxY = Math.max(gMaxY, s.y + s.height);
        }
        const groupCenter = { x: (gMinX + gMaxX) / 2, y: (gMinY + gMaxY) / 2 };

        if (typeof appState !== 'undefined') {
            appState.circPatternWaitCenter = true;
            appState.circPatternDragging = false;
            appState.circPatternSources = sources;
            appState.circPatternIsSheetMode = true;
            appState.circPatternCenter = null;
            appState.circPatternGroupCenter = groupCenter;
            appState.circPatternEndPoint = null;
            appState.circPatternRadius = 0;
            appState.circPatternCount = count;
            appState.circPatternArcAngle = arcAngleDeg;
            appState.circPatternStartAngle = 0;
            appState.circPatternCountManuallySet = true;
        }
        if (typeof window !== 'undefined') {
            window.circPatternWaitCenter = true;
            window.circPatternDragging = false;
            window.circPatternSources = sources;
            window.circPatternIsSheetMode = true;
            window.circPatternCenter = null;
            window.circPatternGroupCenter = groupCenter;
            window.circPatternEndPoint = null;
            window.circPatternRadius = 0;
            window.circPatternCount = count;
            window.circPatternArcAngle = arcAngleDeg;
            window.circPatternStartAngle = 0;
            window.circPatternCountManuallySet = true;
        }

        if (typeof render === 'function') render();
        console.log(`⭕ Круговой паттерн на листе: count=${count}, arc=${arcAngleDeg}° — кликните для центра`);
    }

    function activateCircularPatternOnCanvas() {
        const selObjs = getSelectedObjects();
        if (selObjs.length === 0) {
            alert('⚠️ Выделите объекты для кругового паттерна');
            return;
        }
        const validObjs = selObjs.filter(o => o && SUPPORTED_TYPES.includes(o.type));
        if (validObjs.length === 0) {
            alert(`⚠️ Нет поддерживаемых объектов.\nПоддерживаются: ${SUPPORTED_TYPES.join(', ')}`);
            return;
        }

        // v2.8: Убран prompt — сразу WaitCenter.
        const lastCount = parseInt(localStorage.getItem('lastCircPatternCount')) || 6;
        const lastArc = parseFloat(localStorage.getItem('lastCircPatternArc')) || 360;
        const count = Math.max(2, Math.min(50, lastCount));
        const arcAngleDeg = Math.max(30, Math.min(360, lastArc));

        // v2.7: groupCenter — центр выделения
        const groupCenter = getSelectionCenter(validObjs);

        if (typeof appState !== 'undefined') {
            appState.circPatternWaitCenter = true;
            appState.circPatternDragging = false;
            appState.circPatternSources = validObjs;
            appState.circPatternIsSheetMode = false;
            appState.circPatternCenter = null;
            appState.circPatternGroupCenter = groupCenter;
            appState.circPatternEndPoint = null;
            appState.circPatternRadius = 0;
            appState.circPatternCount = count;
            appState.circPatternArcAngle = arcAngleDeg;
            appState.circPatternStartAngle = 0;
            appState.circPatternCountManuallySet = true;
        }
        if (typeof window !== 'undefined') {
            window.circPatternWaitCenter = true;
            window.circPatternDragging = false;
            window.circPatternSources = validObjs;
            window.circPatternIsSheetMode = false;
            window.circPatternCenter = null;
            window.circPatternGroupCenter = groupCenter;
            window.circPatternEndPoint = null;
            window.circPatternRadius = 0;
            window.circPatternCount = count;
            window.circPatternArcAngle = arcAngleDeg;
            window.circPatternStartAngle = 0;
            window.circPatternCountManuallySet = true;
        }

        if (typeof render === 'function') render();
        console.log(`⭕ Круговой паттерн на холсте: count=${count}, arc=${arcAngleDeg}° — кликните для центра`);
    }

    // ═══════════════════════════════════════════════════════════════
    // СОЗДАНИЕ РЕАЛЬНЫХ КОПИЙ НА ЛИСТЕ (при клике — применить)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Создаёт прямоугольный паттерн на листе.
     * @param {Array} sources — массив nestedParts (исходные)
     * @param {Object} center — {x, y} центр выделения
     * @param {number} cols — колонок
     * @param {number} rows — рядов
     * @param {number} stepX — шаг по X
     * @param {number} stepY — шаг по Y
     */
    window.createRectPatternOnSheet = function(sources, center, cols, rows, stepX, stepY, groupCenter) {
        if (!sources || sources.length === 0 || cols < 1 || rows < 1) return;
        if (typeof saveState === 'function') saveState();

        // v2.9: groupCenter — центр выделения (из appState).
        // relOffsets = смещение детали от центра группы.
        // Объект помещается в позицию: center + relOffset + (col*stepX, row*stepY)
        const gc = groupCenter || center;
        const relOffsets = sources.map(src => ({
            dx: (src.x + src.width / 2) - gc.x,
            dy: (src.y + src.height / 2) - gc.y
        }));

        // v2.9: ПЕРЕМЕЩАЕМ ИСХОДНЫЕ ДЕТАЛИ НА (col=0, row=0) — позиция startPoint
        for (let s = 0; s < sources.length; s++) {
            const src = sources[s];
            const targetCenterX = center.x + relOffsets[s].dx;
            const targetCenterY = center.y + relOffsets[s].dy;
            const offsetX = targetCenterX - (src.x + src.width / 2);
            const offsetY = targetCenterY - (src.y + src.height / 2);
            src.x += offsetX;
            src.y += offsetY;
            if (src.polygon) {
                src.polygon = src.polygon.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
            }
        }

        // Создаём копии для остальных позиций
        const newItems = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (col === 0 && row === 0) continue;
                const groupCenterX = center.x + col * stepX;
                const groupCenterY = center.y + row * stepY;

                for (let s = 0; s < sources.length; s++) {
                    const src = sources[s];
                    const copyCenterX = groupCenterX + relOffsets[s].dx;
                    const copyCenterY = groupCenterY + relOffsets[s].dy;
                    const offsetX = copyCenterX - (src.x + src.width / 2);
                    const offsetY = copyCenterY - (src.y + src.height / 2);

                    const copy = {
                        partId: src.partId,
                        name: src.name,
                        x: src.x + offsetX,
                        y: src.y + offsetY,
                        width: src.width,
                        height: src.height,
                        baseWidth: src.baseWidth || src.width,
                        baseHeight: src.baseHeight || src.height,
                        rotation: src.rotation || 0,
                        angle: src.angle || 0,
                        polygon: src.polygon
                            ? src.polygon.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }))
                            : [],
                        outline: src.outline
                            ? src.outline.map(poly => poly.map(p => ({ ...p })))
                            : null,
                        refPoint: src.refPoint ? { ...src.refPoint } : null,
                        objects: src.objects && src.objects.length > 0
                            ? src.objects.map(o => ({ ...o }))
                            : undefined,
                        thickness: src.thickness,
                        material: src.material,
                        oneCutEnabled: src.oneCutEnabled || false
                    };
                    if (typeof nestedParts !== 'undefined') nestedParts.push(copy);
                    newItems.push(copy);
                }
            }
        }

        // Сохраняем в allSheets
        if (typeof appState !== 'undefined' && appState.allSheets && appState.allSheets.length > 0 && appState.currentSheetIndex >= 0) {
            appState.allSheets[appState.currentSheetIndex].nestedParts = nestedParts.map(n => ({
                ...n,
                polygon: n.polygon ? n.polygon.map(p => ({ ...p })) : undefined,
                outline: n.outline ? n.outline.map(poly => poly.map(p => ({ ...p }))) : undefined,
                refPoint: n.refPoint ? { ...n.refPoint } : undefined,
                objects: n.objects ? n.objects.map(o => ({ ...o })) : undefined
            }));
        }
        if (typeof saveToCache === 'function') saveToCache();
        if (typeof render === 'function') render();
        if (typeof updatePartsList === 'function') updatePartsList();
        console.log(`📐 Прямоугольный паттерн: ${cols}×${rows} = ${cols * rows} копий (добавлено ${newItems.length})`);
    };

    /**
     * Создаёт круговой паттерн на листе.
     * @param {Array} sources — массив nestedParts (исходные)
     * @param {Object} center — {x, y} центр вращения
     * @param {number} count — количество копий (включая исходную)
     * @param {number} radius — радиус окружности
     * @param {number} arcAngleDeg — угол дуги (градусы)
     * @param {number} startAngleRad — начальный угол поворота паттерна (радианы)
     */
    window.createCircularPatternOnSheet = function(sources, center, count, radius, arcAngleDeg, startAngleRad) {
        if (!sources || sources.length === 0 || count < 2) return;
        if (typeof saveState === 'function') saveState();

        const startAng = startAngleRad || 0;
        const angleStep = (arcAngleDeg * Math.PI / 180) / (arcAngleDeg === 360 ? count : (count - 1 || 1));

        // v2.7: groupCenter — центр выделения (из appState), НЕ центр окружности.
        // relOffsets = смещение детали от центра группы.
        // Объект помещается НА окружность: center + rotate(relOffset + (radius,0), angle)
        const groupCenter = (typeof appState !== 'undefined' && appState.circPatternGroupCenter)
            ? appState.circPatternGroupCenter : center;
        const relOffsets = sources.map(src => ({
            dx: (src.x + src.width / 2) - groupCenter.x,
            dy: (src.y + src.height / 2) - groupCenter.y
        }));

        // v2.4: ПЕРЕМЕЩАЕМ ИСХОДНЫЕ ДЕТАЛИ НА i=0 (startAngle — позиция курсора)
        // Раньше i=0 пропускался → пустота на курсоре. Теперь исходные детали
        // перемещаются на первую позицию дуги (i=0), копии заполняют i=1..count-1.
        {
            const angleRad = startAng;  // i=0
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            for (let s = 0; s < sources.length; s++) {
                const src = sources[s];
                const shiftedX = relOffsets[s].dx + radius;
                const shiftedY = relOffsets[s].dy;
                const rotX = shiftedX * cos - shiftedY * sin;
                const rotY = shiftedX * sin + shiftedY * cos;
                const newCenterX = center.x + rotX;
                const newCenterY = center.y + rotY;
                const offsetX = newCenterX - (src.x + src.width / 2);
                const offsetY = newCenterY - (src.y + src.height / 2);
                // Перемещаем исходную деталь (она — ссылка на nestedParts[idx])
                src.x += offsetX;
                src.y += offsetY;
                if (src.polygon) {
                    src.polygon = src.polygon.map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
                }
            }
        }

        // Создаём копии для i=1..count-1
        const newItems = [];
        for (let i = 1; i < count; i++) {
            const angleRad = startAng + i * angleStep;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            for (let s = 0; s < sources.length; s++) {
                const src = sources[s];
                // Исходная позиция центра детали относительно центра группы
                const relX = relOffsets[s].dx;
                const relY = relOffsets[s].dy;
                // Поворот относительной позиции + сдвиг на radius вдоль X
                const shiftedX = relX + radius;
                const shiftedY = relY;
                const rotX = shiftedX * cos - shiftedY * sin;
                const rotY = shiftedX * sin + shiftedY * cos;
                const copyCenterX = center.x + rotX;
                const copyCenterY = center.y + rotY;

                const offsetX = copyCenterX - (src.x + src.width / 2);
                const offsetY = copyCenterY - (src.y + src.height / 2);

                const copy = {
                    partId: src.partId,
                    name: src.name,
                    x: src.x + offsetX,
                    y: src.y + offsetY,
                    width: src.width,
                    height: src.height,
                    baseWidth: src.baseWidth || src.width,
                    baseHeight: src.baseHeight || src.height,
                    rotation: (src.rotation || 0) + angleRad * 180 / Math.PI,
                    angle: (src.angle || 0) + angleRad,
                    polygon: src.polygon
                        ? src.polygon.map(p => {
                            const px = p.x - src.x - src.width / 2;
                            const py = p.y - src.y - src.height / 2;
                            const rx = px * cos - py * sin;
                            const ry = px * sin + py * cos;
                            return { x: rx + copyCenterX, y: ry + copyCenterY };
                        })
                        : [],
                    outline: src.outline
                        ? src.outline.map(poly => poly.map(p => ({ ...p })))
                        : null,
                    refPoint: src.refPoint ? { ...src.refPoint } : null,
                    objects: src.objects && src.objects.length > 0
                        ? src.objects.map(o => ({ ...o }))
                        : undefined,
                    thickness: src.thickness,
                    material: src.material,
                    oneCutEnabled: src.oneCutEnabled || false
                };
                if (typeof nestedParts !== 'undefined') nestedParts.push(copy);
                newItems.push(copy);
            }
        }

        if (typeof appState !== 'undefined' && appState.allSheets && appState.allSheets.length > 0 && appState.currentSheetIndex >= 0) {
            appState.allSheets[appState.currentSheetIndex].nestedParts = nestedParts.map(n => ({
                ...n,
                polygon: n.polygon ? n.polygon.map(p => ({ ...p })) : undefined,
                outline: n.outline ? n.outline.map(poly => poly.map(p => ({ ...p }))) : undefined,
                refPoint: n.refPoint ? { ...n.refPoint } : undefined,
                objects: n.objects ? n.objects.map(o => ({ ...o })) : undefined
            }));
        }
        if (typeof saveToCache === 'function') saveToCache();
        if (typeof render === 'function') render();
        if (typeof updatePartsList === 'function') updatePartsList();
        console.log(`⭕ Круговой паттерн: ${count} копий, радиус=${radius}мм, дуга=${arcAngleDeg}°`);
    };

    /**
     * Отмена drag-режима (Escape или клик вне зоны).
     */
    window.cancelPatternDragging = function() {
        if (typeof appState !== 'undefined') {
            appState.rectPatternDragging = false;
            appState.rectPatternWaitCenter = false;  // v2.9
            appState.circPatternDragging = false;
            appState.circPatternWaitCenter = false;
            appState.rectPatternSources = null;
            appState.circPatternSources = null;
            appState.rectPatternIsSheetMode = false;
            appState.circPatternIsSheetMode = false;
            appState.rectPatternStartPoint = null;
            appState.rectPatternGroupCenter = null;  // v2.9
            appState.circPatternCenter = null;
            appState.circPatternGroupCenter = null;
            appState.rectPatternEndPoint = null;
            appState.circPatternEndPoint = null;
            appState.rectPatternCount = 4;
            appState.circPatternCount = 6;
            appState.circPatternArcAngle = 360;
            appState.circPatternStartAngle = 0;
            appState.rectPatternCountManuallySet = false;
            appState.circPatternCountManuallySet = false;
        }
        if (typeof window !== 'undefined') {
            window.rectPatternDragging = false;
            window.rectPatternWaitCenter = false;  // v2.9
            window.circPatternDragging = false;
            window.circPatternWaitCenter = false;
            window.rectPatternSources = null;
            window.circPatternSources = null;
            window.rectPatternIsSheetMode = false;
            window.circPatternIsSheetMode = false;
            window.rectPatternStartPoint = null;
            window.rectPatternGroupCenter = null;  // v2.9
            window.circPatternCenter = null;
            window.circPatternGroupCenter = null;
            window.rectPatternEndPoint = null;
            window.circPatternEndPoint = null;
            window.rectPatternCount = 4;
            window.circPatternCount = 6;
            window.circPatternArcAngle = 360;
            window.circPatternStartAngle = 0;
            window.rectPatternCountManuallySet = false;
            window.circPatternCountManuallySet = false;
        }
        if (typeof render === 'function') render();
    };

    // ═══════════════════════════════════════════════════════════════
    // СОЗДАНИЕ РЕАЛЬНЫХ КОПИЙ НА ХОЛСТЕ (при клике — применить)
    // ═══════════════════════════════════════════════════════════════

    /**
     * Создаёт прямоугольный паттерн на холсте (объекты детали).
     */
    window.createRectPatternOnCanvas = function(sources, center, cols, rows, stepX, stepY, groupCenter) {
        if (!sources || sources.length === 0 || cols < 1 || rows < 1) return;
        if (typeof window.saveState === 'function') window.saveState();

        // v2.9: groupCenter — центр выделения (из appState)
        const gc = groupCenter || center;
        const relOffsets = sources.map(o => {
            const c = o.center || { x: o.cx || o.x || 0, y: o.cy || o.y || 0 };
            return { dx: c.x - gc.x, dy: c.y - gc.y };
        });

        // v2.9: ПЕРЕМЕЩАЕМ ИСХОДНЫЕ ОБЪЕКТЫ НА (col=0, row=0) — позиция startPoint
        for (let s = 0; s < sources.length; s++) {
            const src = sources[s];
            const targetX = center.x + relOffsets[s].dx;
            const targetY = center.y + relOffsets[s].dy;
            const srcCenter = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
            moveObject(src, targetX - srcCenter.x, targetY - srcCenter.y);
        }

        const newObjs = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                if (col === 0 && row === 0) continue;
                const groupCenterX = center.x + col * stepX;
                const groupCenterY = center.y + row * stepY;
                for (let s = 0; s < sources.length; s++) {
                    const copy = cloneObject(sources[s]);
                    if (copy) {
                        const targetX = groupCenterX + relOffsets[s].dx;
                        const targetY = groupCenterY + relOffsets[s].dy;
                        const srcCenter = sources[s].center || { x: sources[s].cx || sources[s].x || 0, y: sources[s].cy || sources[s].y || 0 };
                        moveObject(copy, targetX - srcCenter.x, targetY - srcCenter.y);
                        if (typeof objects !== 'undefined') objects.push(copy);
                        newObjs.push(copy);
                    }
                }
            }
        }

        // Выделяем новые копии (+исходные)
        if (typeof selectedObjects !== 'undefined') {
            for (const no of newObjs) selectedObjects.push(no);
        }
        if (typeof window !== 'undefined') window.selectedObjects = selectedObjects;

        // Если редактируем деталь — обновляем bounds
        if (typeof isEditingPart !== 'undefined' && isEditingPart &&
            typeof editingPartId !== 'undefined' && editingPartId !== null &&
            typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) {
                for (const no of newObjs) part.objects.push(no);
                updatePartBounds(part);
            }
        }

        if (typeof window.render === 'function') window.render();
        if (typeof updateObjectsList === 'function') updateObjectsList();
        if (typeof saveToCache === 'function') saveToCache();
        console.log(`📐 Прямоугольный паттерн на холсте: ${cols}×${rows} = ${cols * rows} копий (добавлено ${newObjs.length})`);
    };

    /**
     * Создаёт круговой паттерн на холсте (объекты детали).
     * v2.3: добавлен startAngleRad — начальный поворот паттерна.
     */
    window.createCircularPatternOnCanvas = function(sources, center, count, radius, arcAngleDeg, startAngleRad) {
        if (!sources || sources.length === 0 || count < 2) return;
        if (typeof window.saveState === 'function') window.saveState();

        const startAng = startAngleRad || 0;
        const angleStep = (arcAngleDeg * Math.PI / 180) / (arcAngleDeg === 360 ? count : (count - 1 || 1));

        // v2.7: groupCenter — центр выделения (из appState), НЕ центр окружности.
        const groupCenter = (typeof appState !== 'undefined' && appState.circPatternGroupCenter)
            ? appState.circPatternGroupCenter : center;
        const relOffsets = sources.map(o => {
            const c = o.center || { x: o.cx || o.x || 0, y: o.cy || o.y || 0 };
            return { dx: c.x - groupCenter.x, dy: c.y - groupCenter.y };
        });

        // v2.4: ПЕРЕМЕЩАЕМ ИСХОДНЫЕ ОБЪЕКТЫ НА i=0 (startAngle — позиция курсора)
        // Раньше i=0 пропускался → пустота на курсоре. Теперь исходные объекты
        // перемещаются на первую позицию дуги (i=0), копии заполняют i=1..count-1.
        {
            const angleRad = startAng;  // i=0
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            for (let s = 0; s < sources.length; s++) {
                const src = sources[s];
                const relX = relOffsets[s].dx + radius;
                const relY = relOffsets[s].dy;
                const rotX = relX * cos - relY * sin;
                const rotY = relX * sin + relY * cos;
                const targetX = center.x + rotX;
                const targetY = center.y + rotY;
                const srcCenter = src.center || { x: src.cx || src.x || 0, y: src.cy || src.y || 0 };
                moveObject(src, targetX - srcCenter.x, targetY - srcCenter.y);
            }
        }

        // Создаём копии для i=1..count-1
        const newObjs = [];
        for (let i = 1; i < count; i++) {
            const angleRad = startAng + i * angleStep;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            for (let s = 0; s < sources.length; s++) {
                const copy = cloneObject(sources[s]);
                if (copy) {
                    // v2.2: Сдвиг на radius по X + поворот позиции вокруг center
                    // (БЕЗ rotateObjectAround — превью не поворачивает объекты)
                    const relX = relOffsets[s].dx + radius;
                    const relY = relOffsets[s].dy;
                    const rotX = relX * cos - relY * sin;
                    const rotY = relX * sin + relY * cos;
                    const targetX = center.x + rotX;
                    const targetY = center.y + rotY;
                    const srcCenter = sources[s].center || { x: sources[s].cx || sources[s].x || 0, y: sources[s].cy || sources[s].y || 0 };
                    // Сдвигаем копию к targetX/Y (без поворота объекта)
                    moveObject(copy, targetX - srcCenter.x, targetY - srcCenter.y);
                    if (typeof objects !== 'undefined') objects.push(copy);
                    newObjs.push(copy);
                }
            }
        }

        if (typeof selectedObjects !== 'undefined') {
            for (const no of newObjs) selectedObjects.push(no);
        }
        if (typeof window !== 'undefined') window.selectedObjects = selectedObjects;

        if (typeof isEditingPart !== 'undefined' && isEditingPart &&
            typeof editingPartId !== 'undefined' && editingPartId !== null &&
            typeof parts !== 'undefined' && typeof updatePartBounds === 'function') {
            const part = parts.find(p => samePartId(p.id, editingPartId));
            if (part) {
                for (const no of newObjs) part.objects.push(no);
                updatePartBounds(part);
            }
        }

        if (typeof window.render === 'function') window.render();
        if (typeof updateObjectsList === 'function') updateObjectsList();
        if (typeof saveToCache === 'function') saveToCache();
        console.log(`⭕ Круговой паттерн на холсте: ${count} копий, радиус=${radius}мм, дуга=${arcAngleDeg}°`);
    };

    console.log('✅ pattern-tool.js v2.5 — activateRectPatternTool / activateCircularPatternTool (drag + prompt modes)');

    // v2.5: Экспортируем cloneObject и moveObject для использования в render.js превью
    // (чтобы превью работало со всеми типами объектов, включая spline/ellipse без clone())
    window.clonePatternObject = cloneObject;
    window.movePatternObject = moveObject;
})();
