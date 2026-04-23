// ═══════════════════════════════════════════════════════════════
// NESTING WEB WORKER - Асинхронная раскладка деталей
// ═══════════════════════════════════════════════════════════════

// Импортируем функции из nesting.js (через importScripts)
// Примечание: nesting.js должен быть адаптирован для worker

// Кэш для выпуклых оболочек
const partHullCache = new Map();

function clearPartHullCache() {
    partHullCache.clear();
}

// Обработчик сообщений от основного потока
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (type === 'START_NESTING') {
        // Начинаем раскладку
        const { parts, sheetSize, options } = data;
        
        // Очищаем кэш
        clearPartHullCache();
        
        // Запускаем раскладку
        try {
            const result = performNestingWorker(parts, sheetSize, options);
            
            // Отправляем результат
            self.postMessage({
                type: 'NESTING_COMPLETE',
                data: result
            });
        } catch (error) {
            // Отправляем ошибку
            self.postMessage({
                type: 'NESTING_ERROR',
                data: { error: error.message }
            });
        }
    } else if (type === 'CANCEL') {
        // Отмена раскладки
        self.postMessage({
            type: 'NESTING_CANCELLED'
        });
        close();
    }
};

// Worker-версия performNesting
function performNestingWorker(parts, sheetSize, options) {
    console.log(`🚀 [WORKER] Начало раскладки в Worker: ${parts.length} деталей, лист ${sheetSize.width}×${sheetSize.height}`);
    
    const { minGap = 3, cancelCallback = null } = options || {};
    
    if (!parts || parts.length === 0) {
        return { error: 'Нет деталей для раскладки' };
    }

    // Фильтруем только отмеченные детали
    const partsToNest = parts.filter(p => p.nestingEnabled !== false);

    if (partsToNest.length === 0) {
        return { error: 'Нет отмеченных деталей' };
    }

    // Сортируем детали по убыванию площади
    const sortedParts = [...partsToNest].sort((a, b) => {
        const areaA = a.bounds.width * a.bounds.height;
        const areaB = b.bounds.width * b.bounds.height;
        return areaB - areaA;
    });

    const nestedParts = [];
    const placedPolygons = [];
    const unplacedParts = [];

    // Последовательное размещение
    for (let partIdx = 0; partIdx < sortedParts.length; partIdx++) {
        const part = sortedParts[partIdx];
        
        // Проверка отмены
        if (cancelCallback && cancelCallback()) {
            return { 
                nestedParts, 
                unplacedParts, 
                cancelled: true,
                progress: partIdx / sortedParts.length
            };
        }
        
        let placedCount = 0;
        let unplacedCount = 0;

        // Размещаем все экземпляры этой детали
        for (let q = 0; q < part.quantity; q++) {
            // Проверка отмены
            if (cancelCallback && cancelCallback()) {
                return { 
                    nestedParts, 
                    unplacedParts, 
                    cancelled: true,
                    progress: partIdx / sortedParts.length
                };
            }
            
            const position = findPositionWithNFPWorker(
                placedPolygons, 
                part, 
                sheetSize.width, 
                sheetSize.height,
                minGap,
                cancelCallback
            );

            if (position) {
                nestedParts.push({
                    partId: part.id,
                    x: position.x,
                    y: position.y,
                    width: position.bboxWidth,
                    height: position.bboxHeight,
                    baseWidth: part.bounds.width,
                    baseHeight: part.bounds.height,
                    rotation: position.rotation,
                    angle: position.angle,
                    polygon: position.positionedHull
                });
                
                placedPolygons.push({
                    positionedHull: position.positionedHull,
                    x: position.x,
                    y: position.y,
                    partId: part.id,
                    part: part,
                    angle: position.angle,
                    width: position.bboxWidth,
                    height: position.bboxHeight
                });
                
                placedCount++;
            } else {
                unplacedCount++;
            }
        }

        if (unplacedCount > 0) {
            unplacedParts.push({
                partId: part.id,
                quantity: unplacedCount,
                placed: placedCount,
                total: part.quantity
            });
        }
        
        // Отправляем прогресс
        self.postMessage({
            type: 'NESTING_PROGRESS',
            data: {
                currentPart: partIdx + 1,
                totalParts: sortedParts.length,
                placedCount: nestedParts.length,
                partName: part.name || `Деталь #${part.id}`
            }
        });
    }

    // Расчёт статистики
    const totalArea = sheetSize.width * sheetSize.height;
    const usedArea = nestedParts.reduce((sum, p) => {
        const hull = getPartConvexHullWorker(p);
        return sum + polygonAreaWorker(hull);
    }, 0);
    const utilization = (usedArea / totalArea * 100).toFixed(1);

    return {
        nestedParts,
        unplacedParts,
        utilization: parseFloat(utilization),
        cancelled: false,
        progress: 1
    };
}

// Worker-версия findPositionWithNFP
function findPositionWithNFPWorker(placedParts, newPart, sheetWidth, sheetHeight, minGap, cancelCallback) {
    console.log(`🔍 [WORKER NFP] Поиск позиции для детали "${newPart.name || newPart.id}", размещено: ${placedParts.length}`);
    
    // Используем PartSpacing детали если задано (по умолчанию minGap = 3)
    const partGap = (typeof newPart.spacing === 'number') ? newPart.spacing : minGap;
    const step = 10;

    // Получаем выпуклую оболочку
    const partHull = getPartConvexHullWorker(newPart);
    if (partHull.length < 3) return null;

    const bbox = newPart.bounds;
    const centerX = bbox.width / 2;
    const centerY = bbox.height / 2;

    // Проверяем, прямоугольная ли деталь
    const isRectangular = newPart.objects && newPart.objects.every(obj => 
        obj.type === 'rect' || obj.type === 'line'
    );

    const rotationAngles = isRectangular ? [0, 90] : [0, 90, 180, 270];

    for (let i = 0; i < rotationAngles.length; i++) {
        if (cancelCallback && cancelCallback()) {
            return null;
        }
        
        const angle = (rotationAngles[i] * Math.PI) / 180;
        const rotation = i;

        const rotatedHull = rotatePolygonWorker(partHull, angle, centerX, centerY);
        const refPoint = getReferencePointWorker(rotatedHull);
        const normalizedHull = rotatedHull.map(p => ({
            x: p.x - refPoint.x,
            y: p.y - refPoint.y
        }));

        const rotatedBbox = getBoundingBoxWorker(normalizedHull);

        if (rotatedBbox.width + partGap * 2 > sheetWidth ||
            rotatedBbox.height + partGap * 2 > sheetHeight) {
            continue;
        }

        for (let y = partGap; y <= sheetHeight - rotatedBbox.height - partGap; y += step) {
            if (cancelCallback && cancelCallback()) {
                return null;
            }
            
            for (let x = partGap; x <= sheetWidth - rotatedBbox.width - partGap; x += step) {
                const positionedHull = translatePolygonWorker(normalizedHull, x, y);

                if (!isPolygonInsideSheetWorker(positionedHull, sheetWidth, sheetHeight, partGap)) {
                    continue;
                }

                let canPlace = true;
                for (const placed of placedParts) {
                    if (polygonsIntersectWorker(positionedHull, placed.positionedHull, partGap)) {
                        canPlace = false;
                        break;
                    }
                }

                if (canPlace) {
                    return {
                        x, y,
                        rotation,
                        angle,
                        positionedHull,
                        bboxWidth: rotatedBbox.width,
                        bboxHeight: rotatedBbox.height
                    };
                }
            }
        }
    }
    return null;
}

// Вспомогательные функции (упрощённые версии для worker)

function getPartConvexHullWorker(part) {
    if (partHullCache.has(part.id)) {
        return partHullCache.get(part.id);
    }
    
    const bbox = part.bounds;
    const hull = [
        { x: bbox.minX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.minY },
        { x: bbox.maxX, y: bbox.maxY },
        { x: bbox.minX, y: bbox.maxY }
    ];
    
    partHullCache.set(part.id, hull);
    return hull;
}

function rotatePolygonWorker(polygon, angle, centerX, centerY) {
    if (angle === 0) return polygon.map(p => ({ ...p }));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return polygon.map(p => ({
        x: centerX + (p.x - centerX) * cos - (p.y - centerY) * sin,
        y: centerY + (p.x - centerX) * sin + (p.y - centerY) * cos
    }));
}

function getReferencePointWorker(polygon) {
    let ref = polygon[0];
    for (const p of polygon) {
        if (p.y < ref.y || (p.y === ref.y && p.x < ref.x)) {
            ref = p;
        }
    }
    return ref;
}

function getBoundingBoxWorker(polygon) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const p of polygon) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function translatePolygonWorker(polygon, dx, dy) {
    return polygon.map(p => ({ x: p.x + dx, y: p.y + dy }));
}

function isPolygonInsideSheetWorker(polygon, sheetWidth, sheetHeight, minGap) {
    for (const p of polygon) {
        if (p.x < minGap || p.x > sheetWidth - minGap ||
            p.y < minGap || p.y > sheetHeight - minGap) {
            return false;
        }
    }
    return true;
}

function polygonsIntersectWorker(poly1, poly2, minGap) {
    const gap = Math.max(minGap, 3);
    
    // Быстрая проверка по bounding box
    const bbox1 = getBoundingBoxWorker(poly1);
    const bbox2 = getBoundingBoxWorker(poly2);
    if (bbox1.maxX + gap < bbox2.minX || bbox2.maxX + gap < bbox1.minX ||
        bbox1.maxY + gap < bbox2.minY || bbox2.maxY + gap < bbox1.minY) {
        return false;
    }

    // Проверка пересечения рёбер
    for (let i = 0; i < poly1.length; i++) {
        const a1 = poly1[i];
        const a2 = poly1[(i + 1) % poly1.length];
        for (let j = 0; j < poly2.length; j++) {
            const b1 = poly2[j];
            const b2 = poly2[(j + 1) % poly2.length];
            if (segmentsIntersectWorker(a1, a2, b1, b2)) {
                return true;
            }
        }
    }

    return false;
}

function segmentsIntersectWorker(a1, a2, b1, b2) {
    const ccw = (o, a, b) => {
        const val = (b.y - o.y) * (a.x - b.x) - (b.x - o.x) * (a.y - b.y);
        return Math.abs(val) < 0.0001 ? 0 : (val > 0 ? 1 : -1);
    };
    const d1 = ccw(b1, b2, a1);
    const d2 = ccw(b1, b2, a2);
    const d3 = ccw(a1, a2, b1);
    const d4 = ccw(a1, a2, b2);
    return (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && 
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0)));
}

function polygonAreaWorker(polygon) {
    if (polygon.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y;
        area -= polygon[j].x * polygon[i].y;
    }
    return Math.abs(area / 2);
}
