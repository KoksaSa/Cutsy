// ═══════════════════════════════════════════════════════════
// ОТРАЖЕНИЕ ВЫДЕЛЕННЫХ ОБЪЕКТОВ НА ХОЛСТЕ (с созданием копии)
// v4.60: Исправлены проблемы:
//   - Добавлена обработка lwpolyline, spline, ellipse, text
//   - Всем новым объектам присваивается id
//   - Копируются метаданные (layer, color, _isContinuous и т.д.)
//   - polygon_from_lines заменён на нормальный polyline
//   - Исправлен offset для polygon (cx/cy вместо x/y)
//   - Улучшен calculateSelectionBounds (поддержка всех типов)
//   - Меню не закрывается при клике внутри
// ═══════════════════════════════════════════════════════════

/**
 * Вычислить bounding box для выделенных объектов
 * v4.60: Поддерживает все типы объектов (включая DXF-импортированные)
 */
function calculateSelectionBounds(selectedObjects) {
    if (!selectedObjects || selectedObjects.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    selectedObjects.forEach(obj => {
        if (!obj) return;

        // Получаем точки объекта разными способами
        let points = [];
        if (typeof obj.getPoints === 'function') {
            points = obj.getPoints();
        } else if (typeof obj.getVertices === 'function') {
            points = obj.getVertices();
        } else if (obj.points) {
            points = obj.points;
        } else if (obj.vertices) {
            points = obj.vertices;
        } else if (obj.fitPoints) {
            points = obj.fitPoints;
        } else if (obj.controlPoints) {
            points = obj.controlPoints;
        } else if (obj.type === 'line') {
            points = [{x: obj.x1, y: obj.y1}, {x: obj.x2, y: obj.y2}];
        } else if (obj.type === 'circle' || obj.type === 'arc') {
            const r = Math.abs(obj.radius || 0);
            points = [
                {x: obj.cx - r, y: obj.cy - r},
                {x: obj.cx + r, y: obj.cy + r}
            ];
        } else if (obj.type === 'rect') {
            points = [
                {x: obj.x, y: obj.y},
                {x: obj.x + obj.width, y: obj.y + obj.height}
            ];
        } else if (obj.type === 'ellipse') {
            const rx = Math.abs(obj.rx || 0), ry = Math.abs(obj.ry || 0);
            points = [
                {x: obj.cx - rx, y: obj.cy - ry},
                {x: obj.cx + rx, y: obj.cy + ry}
            ];
        } else if (obj.type === 'text') {
            points = [{x: obj.x, y: obj.y}, {x: obj.x + (obj.width || 0), y: obj.y + (obj.height || 20)}];
        }

        points.forEach(pt => {
            if (pt && typeof pt.x === 'number' && typeof pt.y === 'number') {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        });
    });

    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY };
}

/**
 * Копировать метаданные объекта (layer, color, _isContinuous и т.д.)
 */
function copyObjectMetadata(source, target) {
    if (!source || !target) return;
    const metaKeys = [
        'layer', 'color', '_isContinuous', '_effectiveLineType',
        '_layerIsAuxiliary', '_fromDimensionBlock', 'closed',
        'isClosed', '_holeLines', '_holeCircles', '_hasHoles',
        'thickness', 'name'
    ];
    for (const key of metaKeys) {
        if (source[key] !== undefined) {
            target[key] = source[key];
        }
    }
    // Присваиваем уникальный id
    target.id = Date.now() + Math.random();
}

/**
 * Создать копию объекта с отражением
 * v4.60: Поддерживает все типы объектов
 */
function createFlippedObject(obj, axis, axisPosition) {
    if (!obj) return null;

    let newObj = null;
    const flipX = axis === 'X'; // true = отражение по вертикальной оси (X инвертируется)
    const flip = (val) => flipX
        ? axisPosition - (val - axisPosition)
        : val;
    const flipY = (val) => !flipX
        ? axisPosition - (val - axisPosition)
        : val;

    if (obj.type === 'line') {
        newObj = new Line(
            flip(obj.x1), flipY(obj.y1),
            flip(obj.x2), flipY(obj.y2)
        );
    }
    else if (obj.type === 'circle') {
        newObj = new Circle(flip(obj.cx), flipY(obj.cy), obj.radius);
    }
    else if (obj.type === 'rect') {
        // Для rect нужно сместить x/y чтобы после отражения осталось в том же bbox
        const newX = flipX ? flip(obj.x) - obj.width : obj.x;
        const newY = !flipX ? flipY(obj.y) - obj.height : obj.y;
        newObj = new Rect(newX, newY, obj.width, obj.height);
    }
    else if (obj.type === 'polygon') {
        // v4.68: Если polygon имеет points (CustomPolygon) — отражаем точки напрямую.
        // Иначе — правильный Polygon (cx/cy/radius/sides).
        if (obj.points && obj.points.length >= 3) {
            const points = obj.points.map(p => ({ x: flip(p.x), y: flipY(p.y) }));
            newObj = { type: 'polygon', points, closed: true, id: Date.now() + Math.random() };
            newObj.color = obj.color || '#00aadd';
            newObj.getVertices = function() { return this.points; };
            newObj.getPoints = function() { return this.points; };
            newObj.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.strokeStyle = this.color || '#00aadd';
                ctx.beginPath(); ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
                ctx.closePath(); ctx.stroke();
            };
            newObj.contains = function(x, y) { return false; };
            newObj.move = function(dx, dy) { this.points.forEach(p => { p.x += dx; p.y += dy; }); };
            newObj.clone = function() { const c = {...this}; c.points = this.points.map(p => ({x:p.x,y:p.y})); c.id = Date.now()+Math.random(); return c; };
        } else {
            const newCx = flip(obj.cx);
            const newCy = flipY(obj.cy);
            newObj = new Polygon(newCx, newCy, obj.radius, obj.sides);
        }
    }
    else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        // v4.60: Обработка и polyline, и lwpolyline (из DXF)
        const points = (obj.points || obj.vertices || []).map(p => ({
            x: flip(p.x),
            y: flipY(p.y)
        }));
        // Создаём как plain object (как в dxf-import.js)
        newObj = {
            type: obj.type,
            points: points,
            closed: obj.closed === true,
            id: Date.now() + Math.random()
        };
        // Добавляем методы если доступна функция addPolylineMethods
        if (typeof addPolylineMethods === 'function') {
            newObj = addPolylineMethods(newObj);
        } else {
            // Минимальные методы для отрисовки
            newObj.draw = function(ctx) {
                if (!this.points || this.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(this.points[0].x, this.points[0].y);
                for (let i = 1; i < this.points.length; i++) {
                    ctx.lineTo(this.points[i].x, this.points[i].y);
                }
                if (this.closed) ctx.closePath();
                ctx.stroke();
            };
            newObj.contains = function(x, y) {
                if (!this.points || this.points.length < 2) return false;
                const segCount = this.closed ? this.points.length : this.points.length - 1;
                for (let i = 0; i < segCount; i++) {
                    const p1 = this.points[i];
                    const p2 = this.points[(i + 1) % this.points.length];
                    const dx = p2.x - p1.x, dy = p2.y - p1.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    if (len < 0.001) continue;
                    const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                    const px = p1.x + t * dx, py = p1.y + t * dy;
                    if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 3) return true;
                }
                return false;
            };
            newObj.getPoints = function() { return this.points; };
            newObj.getVertices = function() { return this.points; };
        }
    }
    else if (obj.type === 'spline') {
        // v4.60: Отражение сплайна (через fitPoints/controlPoints)
        const srcPts = obj.fitPoints || obj.controlPoints || obj.points || obj.vertices || [];
        const newPts = srcPts.map(p => ({
            x: flip(p.x),
            y: flipY(p.y)
        }));
        newObj = {
            type: 'spline',
            fitPoints: newPts,
            controlPoints: newPts,
            points: newPts,
            vertices: newPts,
            closed: obj.closed === true,
            isClosed: obj.isClosed === true,
            id: Date.now() + Math.random()
        };
        // Методы для отрисовки
        newObj.draw = function(ctx) {
            const pts = this.fitPoints || this.controlPoints || this.points || [];
            if (pts.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            if (this.closed || this.isClosed) ctx.closePath();
            ctx.stroke();
        };
        newObj.getPoints = function() { return this.fitPoints || this.points || []; };
        newObj.contains = function(x, y) {
            const pts = this.fitPoints || this.points || [];
            if (pts.length < 2) return false;
            const segCount = (this.closed || this.isClosed) ? pts.length : pts.length - 1;
            for (let i = 0; i < segCount; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len < 0.001) continue;
                const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
                const px = p1.x + t * dx, py = p1.y + t * dy;
                if (Math.sqrt((x - px) ** 2 + (y - py) ** 2) < 3) return true;
            }
            return false;
        };
    }
    else if (obj.type === 'ellipse') {
        // v4.60: Отражение эллипса
        newObj = {
            type: 'ellipse',
            cx: flip(obj.cx),
            cy: flipY(obj.cy),
            rx: obj.rx,
            ry: obj.ry,
            id: Date.now() + Math.random()
        };
        newObj.draw = function(ctx) {
            ctx.save();
            ctx.translate(this.cx, this.cy);
            ctx.scale(this.rx, this.ry);
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.stroke();
        };
        newObj.getPoints = function() {
            const pts = [];
            for (let i = 0; i < 36; i++) {
                const a = (2 * Math.PI * i) / 36;
                pts.push({ x: this.cx + Math.cos(a) * this.rx, y: this.cy + Math.sin(a) * this.ry });
            }
            return pts;
        };
        newObj.contains = function(x, y) {
            const dx = (x - this.cx) / this.rx;
            const dy = (y - this.cy) / this.ry;
            return Math.sqrt(dx * dx + dy * dy) < 1.1;
        };
    }
    else if (obj.type === 'arc') {
        // v4.60: Улучшенное отражение дуги
        if (flipX) {
            // Отражение по вертикальной оси (X инвертируется)
            // Углы зеркалятся: angle → π - angle
            newObj = new Arc(
                flip(obj.cx),
                obj.cy,
                obj.radius,
                Math.PI - obj.startAngle,
                Math.PI - obj.endAngle,
                obj.direction === 'CW' ? 'CCW' : 'CW'
            );
        } else {
            // Отражение по горизонтальной оси (Y инвертируется)
            // Углы зеркалятся: angle → -angle
            newObj = new Arc(
                obj.cx,
                flipY(obj.cy),
                obj.radius,
                -obj.startAngle,
                -obj.endAngle,
                obj.direction === 'CW' ? 'CCW' : 'CW'
            );
        }
    }
    else if (obj.type === 'text') {
        // v4.60: Отражение текста (только позиция, текст не зеркалим)
        newObj = {
            type: 'text',
            x: flip(obj.x),
            y: flipY(obj.y),
            text: obj.text,
            fontSize: obj.fontSize,
            id: Date.now() + Math.random()
        };
        if (typeof Text !== 'undefined') {
            newObj = new Text(newObj.x, newObj.y, obj.text, obj.fontSize || 14);
        }
    }

    // v4.60: Копируем метаданные для всех типов
    if (newObj) {
        copyObjectMetadata(obj, newObj);
    }

    return newObj;
}

/**
 * Показать меню выбора оси отражения
 */
function showFlipMenu(x, y) {
    // Удаляем старое меню если есть
    const oldMenu = document.getElementById('flipSelectionMenu');
    if (oldMenu) oldMenu.remove();

    const menu = document.createElement('div');
    menu.id = 'flipSelectionMenu';
    menu.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y}px;
        background: #252526;
        border: 1px solid #3c3c3c;
        border-radius: 4px;
        padding: 8px 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        z-index: 10000;
        min-width: 240px;
    `;

    menu.innerHTML = `
        <div style="padding:8px 12px;color:#007acc;font-size:12px;font-weight:bold;border-bottom:1px solid #3c3c3c;margin-bottom:4px;">
            🪞 Отразить (создать копию)
        </div>
        <div style="padding:4px 12px;color:#aaa;font-size:11px;">
            Отступ: <input type="number" id="flipOffsetInput" value="10" min="0" max="500" step="0.5"
                style="width:60px;padding:2px 4px;background:#3c3c3c;color:#fff;border:1px solid #555;border-radius:3px;text-align:center;"> мм
        </div>
        <div class="flip-option" data-edge="left" style="padding:8px 12px;color:#fff;font-size:12px;cursor:pointer;">
            ↔️ Отразить по ЛЕВОЙ границе
        </div>
        <div class="flip-option" data-edge="right" style="padding:8px 12px;color:#fff;font-size:12px;cursor:pointer;">
            ↔️ Отразить по ПРАВОЙ границе
        </div>
        <div class="flip-option" data-edge="top" style="padding:8px 12px;color:#fff;font-size:12px;cursor:pointer;">
            ↕️ Отразить по ВЕРХНЕЙ границе
        </div>
        <div class="flip-option" data-edge="bottom" style="padding:8px 12px;color:#fff;font-size:12px;cursor:pointer;">
            ↕️ Отразить по НИЖНЕЙ границе
        </div>
    `;

    document.body.appendChild(menu);

    // Обработчики кликов (v4.60: stopPropagation чтобы меню не закрывалось)
    menu.querySelectorAll('.flip-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const edge = option.dataset.edge;
            const offsetPx = parseFloat(document.getElementById('flipOffsetInput').value) || 0;
            executeFlip(edge, offsetPx);
            menu.remove();
            document.removeEventListener('mousedown', closeHandler);
            document.removeEventListener('keydown', closeHandler);
        });

        option.addEventListener('mouseenter', () => {
            option.style.background = '#3c3c3c';
        });

        option.addEventListener('mouseleave', () => {
            option.style.background = '';
        });
    });

    // v4.60: Закрытие по ESC или клику ВНЕ меню (не внутри)
    const closeHandler = (e) => {
        if (e.type === 'keydown' && e.key !== 'Escape') return;
        if (e.type === 'mousedown' && menu.contains(e.target)) return; // Не закрываем при клике внутри
        menu.remove();
        document.removeEventListener('mousedown', closeHandler);
        document.removeEventListener('keydown', closeHandler);
    };

    // Задержка чтобы не сработало на тот же клик что открыл меню
    setTimeout(() => {
        document.addEventListener('mousedown', closeHandler);
        document.addEventListener('keydown', closeHandler);
    }, 100);
}

/**
 * Применить отступ к отражённому объекту
 * v4.60: Исправлен offset для polygon (cx/cy вместо x/y)
 */
function applyOffsetToFlippedObject(obj, offsetX, offsetY) {
    if (!obj) return;

    if (obj.type === 'line') {
        obj.x1 += offsetX;
        obj.y1 += offsetY;
        obj.x2 += offsetX;
        obj.y2 += offsetY;
        if (typeof obj.recalc === 'function') obj.recalc();
    }
    else if (obj.type === 'circle') {
        obj.cx += offsetX;
        obj.cy += offsetY;
    }
    else if (obj.type === 'rect') {
        obj.x += offsetX;
        obj.y += offsetY;
    }
    else if (obj.type === 'polygon') {
        // v4.60: ИСПРАВЛЕНО — polygon использует cx/cy, не x/y
        obj.cx += offsetX;
        obj.cy += offsetY;
    }
    else if (obj.type === 'polyline' || obj.type === 'lwpolyline') {
        if (obj.points) {
            obj.points.forEach(p => {
                p.x += offsetX;
                p.y += offsetY;
            });
        }
    }
    else if (obj.type === 'spline') {
        // v4.60: Смещаем все массивы точек
        ['fitPoints', 'controlPoints', 'points', 'vertices'].forEach(key => {
            if (obj[key]) {
                obj[key].forEach(p => {
                    p.x += offsetX;
                    p.y += offsetY;
                });
            }
        });
    }
    else if (obj.type === 'ellipse') {
        obj.cx += offsetX;
        obj.cy += offsetY;
    }
    else if (obj.type === 'text') {
        obj.x += offsetX;
        obj.y += offsetY;
    }
    else if (obj.type === 'arc') {
        obj.cx += offsetX;
        obj.cy += offsetY;
    }
}

/**
 * Выполнить отражение
 */
function executeFlip(edge, offsetMM = 10) {
    if (!selectedObjects || selectedObjects.length === 0) {
        alert('⚠️ Выделите объекты для отражения');
        return;
    }

    // Вычисляем bounding box
    const bounds = calculateSelectionBounds(selectedObjects);
    if (!bounds) {
        alert('⚠️ Не удалось вычислить границы объектов');
        return;
    }

    // Определяем ось и позицию
    let axis, axisPosition;
    let offsetDirection = { x: 0, y: 0 };
    const offsetWorld = offsetMM;

    switch(edge) {
        case 'left':
            axis = 'X';
            axisPosition = bounds.minX;
            offsetDirection = { x: -offsetWorld, y: 0 };
            break;
        case 'right':
            axis = 'X';
            axisPosition = bounds.maxX;
            offsetDirection = { x: offsetWorld, y: 0 };
            break;
        case 'top':
            axis = 'Y';
            axisPosition = bounds.minY;
            offsetDirection = { x: 0, y: -offsetWorld };
            break;
        case 'bottom':
            axis = 'Y';
            axisPosition = bounds.maxY;
            offsetDirection = { x: 0, y: offsetWorld };
            break;
    }

    console.log(`🪞 [Flip] Отражение по ${edge} границе: axis=${axis}, position=${axisPosition}`);
    console.log(`   Bounding box: (${bounds.minX.toFixed(1)}, ${bounds.minY.toFixed(1)}) - (${bounds.maxX.toFixed(1)}, ${bounds.maxY.toFixed(1)})`);
    console.log(`   Отступ: ${offsetMM} мм`);

    // Сохраняем состояние для Undo
    saveState();

    // Создаём отражённые копии
    const flippedObjects = [];

    selectedObjects.forEach(obj => {
        const flipped = createFlippedObject(obj, axis, axisPosition);
        if (flipped) {
            // Применяем отступ
            if (offsetDirection.x !== 0 || offsetDirection.y !== 0) {
                applyOffsetToFlippedObject(flipped, offsetDirection.x, offsetDirection.y);
            }

            // v4.60: Все объекты теперь нормальные Shape-объекты (без polygon_from_lines)
            objects.push(flipped);
            flippedObjects.push(flipped);
        }
    });

    console.log(`✅ Создано ${flippedObjects.length} отражённых объектов с отступом ${offsetMM} мм`);

    // Выделяем новые объекты
    selectedObjects.length = 0; selectedObjects.push(...flippedObjects);

    // Обновляем UI
    render();
    updateObjectsList();
    showProperties(selectedObjects[0]);

    console.log(`🎉 Отражение завершено!`);
}

// Экспорт функций
window.calculateSelectionBounds = calculateSelectionBounds;
window.createFlippedObject = createFlippedObject;
window.showFlipMenu = showFlipMenu;
window.executeFlip = executeFlip;

console.log('✅ flip-selection.js загружен (v4.60)');