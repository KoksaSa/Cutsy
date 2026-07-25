// ═══════════════════════════════════════════════════════════════
// ХРАНИЛИЩЕ КЭША v3.28 — сериализация/десериализация деталей
// С поддержкой полилиний (открытых и замкнутых), дуг, сплайнов
// ИСПРАВЛЕНО: closed сохраняется и восстанавливается корректно
// ИСПРАВЛЕНО: polyline/lwpolyline/spline → createPolyline() с методами
// ═══════════════════════════════════════════════════════════════

// Флаг: нужно ли сохранить кэш (dirty flag)
let cacheDirty = false;
let cacheSaveTimer = null;

// ═══════════════════════════════════════════════════════════════
// ПРОТОТИП ПОЛИЛИНИИ — все методы хранятся один раз
// ═══════════════════════════════════════════════════════════════

const PolylinePrototype = {
    draw: function(ctx) {
        if (!this.points || this.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        if (this.closed) {
            ctx.closePath();
        }
        ctx.stroke();
    },

    getPoints: function() {
        if (!this.points || this.points.length === 0) return [];
        if (this.closed && this.points.length >= 2) {
            const pts = this.points.slice();
            pts.push({ x: this.points[0].x, y: this.points[0].y });
            return pts;
        }
        return this.points.slice();
    },

    contains: function(x, y) {
        if (!this.points || this.points.length < 2) return false;

        if (this.closed && this.points.length >= 3) {
            if (pointInPolygon(x, y, this.points)) return true;
        }

        const segmentCount = this.closed
            ? this.points.length
            : this.points.length - 1;

        for (let i = 0; i < segmentCount; i++) {
            const p1 = this.points[i];
            const p2 = this.points[(i + 1) % this.points.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 0.001) continue;
            const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / (len * len)));
            const px = p1.x + t * dx;
            const py = p1.y + t * dy;
            if (Math.sqrt((x - px) * (x - px) + (y - py) * (y - py)) < 3) return true;
        }

        return false;
    }
};

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

function pointInPolygon(x, y, polygon) {
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function arcToPolyline(cx, cy, radius, startAngle, endAngle, direction, segments) {
    segments = segments || 36;
    radius = Math.abs(radius);
    if (radius < 0.001) return [{ x: cx, y: cy }];

    let sweep;
    if (direction === 'CW') {
        sweep = startAngle - endAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    } else {
        sweep = endAngle - startAngle;
        if (sweep < 0) sweep += Math.PI * 2;
    }

    const step = sweep / segments;
    const dir = direction === 'CW' ? -1 : 1;
    const pts = [];

    for (let i = 0; i <= segments; i++) {
        const angle = startAngle + dir * step * i;
        pts.push({
            x: cx + Math.cos(angle) * radius,
            y: cy + Math.sin(angle) * radius
        });
    }
    return pts;
}

// ═══════════════════════════════════════════════════════════════
// СОЗДАНИЕ ПОЛИЛИНИЙ
// ═══════════════════════════════════════════════════════════════

function createPolyline(data) {
    const pl = {
        type: data.type || 'polyline',
        points: (data.points || []).map(p => ({ x: p.x, y: p.y })),
        closed: data.closed === true,
        id: data.id || Date.now() + Math.random(),
        color: data.color || '#000000'
    };
    Object.setPrototypeOf(pl, PolylinePrototype);
    return pl;
}

function addPolylineMethods(pl) {
    Object.setPrototypeOf(pl, PolylinePrototype);
    if (pl.closed !== true) pl.closed = false;
    return pl;
}

// ═══════════════════════════════════════════════════════════════
// СЕРИАЛИЗАЦИЯ / ДЕСЕРИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

/**
 * Сериализует один объект детали в формат для localStorage.
 * КЛЮЧЕВОЕ: closed сохраняется как boolean (obj.closed === true)
 */
function serializeObject(obj) {
    if (!obj || !obj.type) return null;

    try {
        switch (obj.type) {
            case 'line':
                var lineData = { type: 'line', x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, id: obj.id };
                if (obj.color) lineData.color = obj.color;
                return lineData;

            case 'circle':
                var circleData = { type: 'circle', cx: obj.cx, cy: obj.cy, radius: obj.radius, id: obj.id };
                if (obj.color) circleData.color = obj.color;
                return circleData;

            case 'rect':
                var rectData = { type: 'rect', x: obj.x, y: obj.y, width: obj.width, height: obj.height, id: obj.id };
                if (obj.color) rectData.color = obj.color;
                return rectData;

            case 'polygon':
                var polygonData = { type: 'polygon', cx: obj.cx, cy: obj.cy, radius: obj.radius, sides: obj.sides, id: obj.id };
                if (obj.color) polygonData.color = obj.color;
                return polygonData;

            case 'arc':
                if (typeof obj.cx === 'number' && typeof obj.cy === 'number' &&
                    typeof obj.radius === 'number' && obj.radius > 0 &&
                    typeof obj.startAngle === 'number' &&
                    typeof obj.endAngle === 'number') {
                    return {
                        type: 'arc', cx: obj.cx, cy: obj.cy, radius: obj.radius,
                        startAngle: obj.startAngle, endAngle: obj.endAngle,
                        direction: obj.direction || 'CCW', id: obj.id
                    };
                } else {
                    var arcPts = typeof obj.getPoints === 'function' ? obj.getPoints(48) : [];
                    if (!arcPts || arcPts.length === 0) {
                        arcPts = arcToPolyline(obj.cx || 0, obj.cy || 0, obj.radius || 1,
                            obj.startAngle || 0, obj.endAngle || Math.PI * 2, obj.direction || 'CCW', 48);
                    }
                    return { type: 'polyline', points: arcPts.map(p => ({ x: p.x, y: p.y })), closed: false, id: obj.id };
                }

            case 'spline':
            case 'polyline':
            case 'lwpolyline':
                var pts = obj.points;
                if (!pts || !Array.isArray(pts)) {
                    if (typeof obj.getPoints === 'function') pts = obj.getPoints();
                }
                if (!pts || !Array.isArray(pts)) {
                    console.warn('[serializeObject] ' + obj.type + ': точки не найдены!');
                    pts = [];
                }
                var polylineData = {
                    type: obj.type === 'spline' ? 'polyline' : obj.type,
                    points: pts.map(p => ({ x: p.x, y: p.y })),
                    closed: obj.closed === true,
                    id: obj.id
                };
                if (obj.color) polylineData.color = obj.color;
                return polylineData;

            default:
                var unknownPts = obj.points || (typeof obj.getPoints === 'function' ? obj.getPoints() : []);
                if (unknownPts && unknownPts.length >= 2) {
                    return { type: 'polyline', points: unknownPts.map(p => ({ x: p.x, y: p.y })), closed: obj.closed === true, id: obj.id };
                }
                try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return null; }
        }
    } catch (e) {
        console.error('[serializeObject] ошибка:', obj.type, e);
        return null;
    }
}

/**
 * Десериализует один объект из формата localStorage.
 * КЛЮЧЕВОЕ: polyline/lwpolyline/spline → createPolyline() с методами и closed
 */
function deserializeObject(data) {
    if (!data || !data.type) return null;

    try {
        switch (data.type) {
            case 'line':
                if (typeof Line !== 'undefined') {
                    var lineObj = new Line(data.x1, data.y1, data.x2, data.y2);
                    if (data.id) lineObj.id = data.id;
                    if (data.color) lineObj.color = data.color;
                    return lineObj;
                }
                var plainLine = { type: 'line', x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2, id: data.id };
                if (data.color) plainLine.color = data.color;
                return plainLine;

            case 'circle':
                if (typeof Circle !== 'undefined') {
                    var circleObj = new Circle(data.cx, data.cy, data.radius);
                    if (data.id) circleObj.id = data.id;
                    if (data.color) circleObj.color = data.color;
                    return circleObj;
                }
                var plainCircle = { type: 'circle', cx: data.cx, cy: data.cy, radius: data.radius, id: data.id };
                if (data.color) plainCircle.color = data.color;
                return plainCircle;

            case 'rect':
                if (typeof Rect !== 'undefined') {
                    var rectObj = new Rect(data.x, data.y, data.width, data.height);
                    if (data.id) rectObj.id = data.id;
                    if (data.color) rectObj.color = data.color;
                    return rectObj;
                }
                var plainRect = { type: 'rect', x: data.x, y: data.y, width: data.width, height: data.height, id: data.id };
                if (data.color) plainRect.color = data.color;
                return plainRect;

            case 'polygon':
                if (typeof Polygon !== 'undefined') {
                    var polygonObj = new Polygon(data.cx, data.cy, data.radius, data.sides);
                    if (data.id) polygonObj.id = data.id;
                    if (data.color) polygonObj.color = data.color;
                    return polygonObj;
                }
                var plainPolygon = { type: 'polygon', cx: data.cx, cy: data.cy, radius: data.radius, sides: data.sides, id: data.id };
                if (data.color) plainPolygon.color = data.color;
                return plainPolygon;

            case 'arc':
                if (typeof Arc !== 'undefined' &&
                    typeof data.cx === 'number' && typeof data.cy === 'number' &&
                    typeof data.radius === 'number' && data.radius > 0 &&
                    typeof data.startAngle === 'number' && typeof data.endAngle === 'number') {
                    try {
                        var arc = new Arc(data.cx, data.cy, data.radius,
                            data.startAngle, data.endAngle, data.direction || 'CCW');
                        arc.id = data.id;
                        return arc;
                    } catch (arcErr) {
                        console.warn('[deserializeObject] Arc не создан, fallback:', arcErr.message);
                    }
                }
                // Fallback: аппроксимация полилинией
                if (typeof data.cx === 'number' && typeof data.radius === 'number') {
                    var arcPoints = arcToPolyline(data.cx, data.cy, data.radius,
                        data.startAngle || 0, data.endAngle || Math.PI * 2, data.direction || 'CCW', 48);
                    var first = arcPoints[0], last = arcPoints[arcPoints.length - 1];
                    var arcClosed = Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2) < 0.1;
                    return createPolyline({ type: 'polyline', points: arcPoints, closed: arcClosed, id: data.id });
                }
                return null;

            case 'spline':
                // Сплайн всегда конвертируется в полилинию с методами
                const splinePl = createPolyline({
                    type: 'polyline',
                    points: data.points || [],
                    closed: data.closed !== false,
                    id: data.id
                });
                if (data.color) splinePl.color = data.color;
                return splinePl;

            case 'polyline':
            case 'lwpolyline':
                // КЛЮЧЕВОЕ: используем createPolyline() для восстановления
                // с методами draw/getPoints/contains и правильным closed
                const pl = createPolyline({
                    type: data.type,
                    points: data.points,
                    closed: data.closed,
                    id: data.id,
                    color: data.color
                });
                return pl;

            default:
                if (data.points && Array.isArray(data.points) && data.points.length >= 2) {
                    const defaultPl = createPolyline({ type: 'polyline', points: data.points, closed: data.closed === true, id: data.id });
                    if (data.color) defaultPl.color = data.color;
                    return defaultPl;
                }
                return data;
        }
    } catch (e) {
        console.error('[deserializeObject] ошибка:', data.type, e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// СЕРИАЛИЗАЦИЯ / ДЕСЕРИАЛИЗАЦИЯ КОНТУРА
// ═══════════════════════════════════════════════════════════════

function serializeContour(contour) {
    if (!contour) return null;

    if (Array.isArray(contour)) {
        return contour.map(function(item) {
            if (item && item.type) {
                try { return serializeObject(item); } catch (e) { return item; }
            }
            return item;  // простой {x, y} — как есть
        });
    }

    if (typeof contour === 'object') {
        var result = {};
        if (contour.outer) {
            result.outer = Array.isArray(contour.outer)
                ? contour.outer.map(function(item) {
                    if (item && item.type) { try { return serializeObject(item); } catch (e) { return item; } }
                    return item;
                })
                : contour.outer;
        }
        if (contour.inner && Array.isArray(contour.inner)) {
            result.inner = contour.inner.map(function(ic) {
                if (Array.isArray(ic)) {
                    return ic.map(function(item) {
                        if (item && item.type) { try { return serializeObject(item); } catch (e) { return item; } }
                        return item;
                    });
                }
                return ic;
            });
        }
        Object.keys(contour).forEach(function(key) {
            if (key !== 'outer' && key !== 'inner') result[key] = contour[key];
        });
        return result;
    }

    return contour;
}

function deserializeContour(contourData) {
    if (!contourData) return null;

    if (Array.isArray(contourData)) {
        return contourData.map(function(item) {
            if (item && item.type) {
                try { return deserializeObject(item); } catch (e) { return item; }
            }
            return item;  // простой {x, y} — как есть
        });
    }

    if (typeof contourData === 'object') {
        var result = {};
        if (contourData.outer) {
            result.outer = Array.isArray(contourData.outer)
                ? contourData.outer.map(function(item) {
                    if (item && item.type) { try { return deserializeObject(item); } catch (e) { return item; } }
                    return item;
                })
                : contourData.outer;
        }
        if (contourData.inner && Array.isArray(contourData.inner)) {
            result.inner = contourData.inner.map(function(ic) {
                if (Array.isArray(ic)) {
                    return ic.map(function(item) {
                        if (item && item.type) { try { return deserializeObject(item); } catch (e) { return item; } }
                        return item;
                    });
                }
                return ic;
            });
        }
        Object.keys(contourData).forEach(function(key) {
            if (key !== 'outer' && key !== 'inner') result[key] = contourData[key];
        });
        return result;
    }

    return contourData;
}

// ═══════════════════════════════════════════════════════════════
// СЕРИАЛИЗАЦИЯ ДЕТАЛИ
// ═══════════════════════════════════════════════════════════════

function serializePart(part) {
    var objects = (part.objects || [])
        .map(function(obj) {
            try { return serializeObject(obj); } catch (e) { return null; }
        })
        .filter(function(obj) { return obj !== null; });

    var boundsData = null;
    if (part.bounds) {
        boundsData = {
            minX: part.bounds.minX, minY: part.bounds.minY,
            maxX: part.bounds.maxX, maxY: part.bounds.maxY,
            width: part.bounds.width, height: part.bounds.height
        };
    }

    return {
        id: part.id, name: part.name, quantity: part.quantity,
        thickness: part.thickness, nestingEnabled: part.nestingEnabled,
        visible: part.visible, rotationMode: part.rotationMode,
        oneCutEnabled: part.oneCutEnabled, noRotate: part.noRotate,
        spacing: part.spacing, bounds: boundsData,
        contour: serializeContour(part.contour),
        width: part.width || 0, height: part.height || 0,
        area: part.area || 0, perimeter: part.perimeter || 0,
        objects: objects
    };
}

// ═══════════════════════════════════════════════════════════════
// СОХРАНЕНИЕ / ЗАГРУЗКА КЭША
// ═══════════════════════════════════════════════════════════════

function saveToCache() {
    try {
        if (typeof parts === 'undefined' || !parts) return;

        var serialized = parts.map(serializePart);
        var json = JSON.stringify(serialized);
        var compressed = typeof LZString !== 'undefined' ? LZString.compressToUTF16(json) : json;
        localStorage.setItem('nesting_parts_cache', compressed);

        // Сохраняем nestedParts
        if (typeof nestedParts !== 'undefined' && nestedParts && nestedParts.length > 0) {
            var serializedNested = nestedParts.map(function(nested) {
                var serObjects = (nested.objects || [])
                    .map(function(obj) { try { return serializeObject(obj); } catch (e) { return null; } })
                    .filter(function(o) { return o !== null; });
                return {
                    partId: nested.partId, x: nested.x, y: nested.y,
                    width: nested.width, height: nested.height,
                    baseWidth: nested.baseWidth, baseHeight: nested.baseHeight,
                    angle: nested.angle, refPoint: nested.refPoint,
                    flipped: nested.flipped, objects: serObjects
                };
            });
            var nestedJson = JSON.stringify(serializedNested);
            var nestedCompressed = typeof LZString !== 'undefined' ? LZString.compressToUTF16(nestedJson) : nestedJson;
            localStorage.setItem('nesting_nested_parts_cache', nestedCompressed);
        } else if (typeof nestedParts !== 'undefined') {
            localStorage.removeItem('nesting_nested_parts_cache');
        }

        // Сохраняем sheetRemnant
        if (typeof sheetRemnant !== 'undefined' && sheetRemnant && sheetRemnant.outerContour && sheetRemnant.outerContour.length > 0) {
            var serRemnant = function(obj) {
                if (!obj || !obj.type) return null;
                try { return serializeObject(obj); } catch (e) { return null; }
            };
            var remnantData = {
                outerContour: sheetRemnant.outerContour.map(serRemnant).filter(function(o) { return o !== null; }),
                innerContours: (sheetRemnant.innerContours || []).map(function(c) { return c.map(serRemnant).filter(function(o) { return o !== null; }); }),
                size: sheetRemnant.size, bounds: sheetRemnant.bounds, scale: sheetRemnant.scale
            };
            var remnantJson = JSON.stringify(remnantData);
            var remnantCompressed = typeof LZString !== 'undefined' ? LZString.compressToUTF16(remnantJson) : remnantJson;
            localStorage.setItem('nesting_sheet_remnant_cache', remnantCompressed);
        } else {
            localStorage.removeItem('nesting_sheet_remnant_cache');
        }

        cacheDirty = false;
    } catch (e) {
        console.error('[saveToCache] ошибка:', e);
        try {
            var fallbackJson = JSON.stringify(parts.map(serializePart));
            localStorage.setItem('nesting_parts_cache', fallbackJson);
            cacheDirty = false;
        } catch (e2) {
            console.error('[saveToCache] не удалось сохранить:', e2);
        }
    }
}

function loadFromCache() {
    try {
        var stored = localStorage.getItem('nesting_parts_cache');
        if (!stored) return null;

        var json;
        if (typeof LZString !== 'undefined') {
            try { json = LZString.decompressFromUTF16(stored); } catch (e) {}
        }
        if (!json) json = stored;
        if (!json) return null;

        var serialized = JSON.parse(json);
        if (!Array.isArray(serialized)) return null;

        var loadedParts = serialized.map(function(partData) {
            var objects = (partData.objects || [])
                .map(function(objData) {
                    try { return deserializeObject(objData); } catch (e) { return null; }
                })
                .filter(function(obj) { return obj !== null; });

            var part = {
                id: partData.id, name: partData.name,
                quantity: partData.quantity || 1,
                thickness: partData.thickness || 0.8,
                nestingEnabled: partData.nestingEnabled !== false,
                visible: partData.visible || false,
                rotationMode: partData.rotationMode || 'auto',
                oneCutEnabled: partData.oneCutEnabled || false,
                noRotate: partData.noRotate || false,
                spacing: partData.spacing !== undefined ? partData.spacing : 3,
                objects: objects
            };

            // Bounds
            if (partData.bounds) {
                var b = partData.bounds;
                part.bounds = {
                    minX: b.minX, minY: b.minY,
                    maxX: b.maxX !== undefined ? b.maxX : (b.minX + (b.width || 0)),
                    maxY: b.maxY !== undefined ? b.maxY : (b.minY + (b.height || 0)),
                    width: b.width, height: b.height
                };
            } else if (objects.length > 0 && typeof calculateBounds === 'function') {
                part.bounds = calculateBounds(objects);
            } else {
                part.bounds = null;
            }

            // Contour
            if (partData.contour) {
                part.contour = deserializeContour(partData.contour);
            } else if (objects.length > 0 && typeof createContourFromObjects === 'function') {
                part.contour = createContourFromObjects(objects, part.bounds);
            } else {
                part.contour = null;
            }

            // Width/Height
            if (partData.width && partData.width > 0) {
                part.width = partData.width;
            } else if (part.bounds && part.bounds.maxX !== undefined && part.bounds.minX !== undefined) {
                part.width = part.bounds.maxX - part.bounds.minX;
            } else {
                part.width = 0;
            }
            if (partData.height && partData.height > 0) {
                part.height = partData.height;
            } else if (part.bounds && part.bounds.maxY !== undefined && part.bounds.minY !== undefined) {
                part.height = part.bounds.maxY - part.bounds.minY;
            } else {
                part.height = 0;
            }

            // Area/Perimeter
            if (partData.area > 0 || partData.perimeter > 0) {
                part.area = partData.area || 0;
                part.perimeter = partData.perimeter || 0;
            } else if (typeof calculatePartMetrics === 'function') {
                try {
                    var metrics = calculatePartMetrics(part);
                    part.area = metrics.area;
                    part.perimeter = metrics.perimeter;
                } catch (e) {
                    part.area = partData.area || 0;
                    part.perimeter = partData.perimeter || 0;
                }
            } else {
                part.area = partData.area || 0;
                part.perimeter = partData.perimeter || 0;
            }

            return part;
        });

        return loadedParts;
    } catch (e) {
        console.error('[loadFromCache] ошибка:', e);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// АВТОСОХРАНЕНИЕ С DEBOUNCE
// ═══════════════════════════════════════════════════════════════

function markCacheDirty() {
    cacheDirty = true;
    scheduleCacheSave();
}

function scheduleCacheSave() {
    if (cacheSaveTimer) clearTimeout(cacheSaveTimer);
    cacheSaveTimer = setTimeout(function() {
        if (cacheDirty) saveToCache();
        cacheSaveTimer = null;
    }, 500);
}

function flushCache() {
    if (cacheSaveTimer) { clearTimeout(cacheSaveTimer); cacheSaveTimer = null; }
    if (cacheDirty) saveToCache();
}

// ═══════════════════════════════════════════════════════════════
// АВТОВОССТАНОВЛЕНИЕ ИЗ КЭША
// ═══════════════════════════════════════════════════════════════

function restoreFromCache() {
    try {
        var loadedParts = loadFromCache();
        var hasData = false;

        if (loadedParts && loadedParts.length > 0) {
            if (typeof parts !== 'undefined') {
                parts.length = 0;
                loadedParts.forEach(function(p) {
                    // Восстанавливаем методы для polyline-объектов,
                    // если deserializeObject не смог (например, использовал new Polyline)
                    if (p.objects && Array.isArray(p.objects)) {
                        p.objects.forEach(function(obj) {
                            if (obj && (obj.type === 'polyline' || obj.type === 'lwpolyline' || obj.type === 'spline')) {
                                // Если closed не установлен — определяем по расстоянию
                                if (obj.closed === undefined || obj.closed === null) {
                                    if (obj.points && obj.points.length >= 3) {
                                        var p0 = obj.points[0], pN = obj.points[obj.points.length - 1];
                                        obj.closed = Math.sqrt((p0.x - pN.x) ** 2 + (p0.y - pN.y) ** 2) < 1;
                                    } else {
                                        obj.closed = false;
                                    }
                                }
                                // Если нет методов прототипа — добавляем
                                if (typeof obj.draw !== 'function' || typeof obj.contains !== 'function') {
                                    Object.setPrototypeOf(obj, PolylinePrototype);
                                }
                            }
                        });
                    }
                    parts.push(p);
                });
            }
            hasData = true;
        }

        // Восстанавливаем nestedParts
        var storedNested = localStorage.getItem('nesting_nested_parts_cache');
        if (storedNested && typeof nestedParts !== 'undefined') {
            var nestedJson;
            if (typeof LZString !== 'undefined') {
                try { nestedJson = LZString.decompressFromUTF16(storedNested); } catch (e) { nestedJson = storedNested; }
            }
            if (!nestedJson) nestedJson = storedNested;
            if (nestedJson) {
                try {
                    var loadedNested = JSON.parse(nestedJson);
                    if (Array.isArray(loadedNested)) {
                        nestedParts.length = 0;
                        loadedNested.forEach(function(n) {
                            if (n.objects && Array.isArray(n.objects)) {
                                n.objects = n.objects.map(function(objData) {
                                    try { return deserializeObject(objData); } catch (e) { return objData; }
                                }).filter(function(o) { return o !== null; });
                            }
                            nestedParts.push(n);
                        });
                        hasData = true;
                    }
                } catch (e) {
                    console.error('[restoreFromCache] nestedParts ошибка:', e);
                }
            }
        }

        // Восстанавливаем sheetRemnant
        var storedRemnant = localStorage.getItem('nesting_sheet_remnant_cache');
        if (storedRemnant && typeof sheetRemnant !== 'undefined') {
            var remnantJson;
            if (typeof LZString !== 'undefined') {
                try { remnantJson = LZString.decompressFromUTF16(storedRemnant); } catch (e) { remnantJson = storedRemnant; }
            }
            if (!remnantJson) remnantJson = storedRemnant;
            if (remnantJson) {
                try {
                    var loadedRemnant = JSON.parse(remnantJson);
                    if (loadedRemnant && loadedRemnant.outerContour) {
                        var deserRemn = function(d) { if (!d || !d.type) return null; return deserializeObject(d); };
                        sheetRemnant.outerContour = loadedRemnant.outerContour.map(deserRemn).filter(function(o) { return o !== null; });
                        sheetRemnant.innerContours = (loadedRemnant.innerContours || []).map(function(c) {
                            return c.map(deserRemn).filter(function(o) { return o !== null; });
                        });
                        sheetRemnant.size = loadedRemnant.size;
                        sheetRemnant.bounds = loadedRemnant.bounds;
                        sheetRemnant.scale = loadedRemnant.scale;
                        hasData = true;
                    }
                } catch (e) {
                    console.error('[restoreFromCache] sheetRemnant ошибка:', e);
                }
            }
        }

        if (hasData) {
            if (typeof updatePartsList === 'function') updatePartsList();
            if (typeof render === 'function') render();
            if (typeof syncGlobalsToStore === 'function') syncGlobalsToStore();
        }

        return hasData;
    } catch (e) {
        console.error('[restoreFromCache] ошибка:', e);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════
// ЭКСПОРТ
// ═══════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.saveToCache = saveToCache;
    window.flushCache = flushCache;
    window.markCacheDirty = markCacheDirty;
    window.restoreFromCache = restoreFromCache;
    window.createPolyline = createPolyline;
    window.addPolylineMethods = addPolylineMethods;
    window.PolylinePrototype = PolylinePrototype;
    window.serializeObject = serializeObject;
    window.deserializeObject = deserializeObject;
    window.serializeContour = serializeContour;
    window.deserializeContour = deserializeContour;
    window.serializePart = serializePart;

    window.addEventListener('beforeunload', function() {
        flushCache();
    });
}