// ═══════════════════════════════════════════════════════════════
// МИНИАТЮРЫ ДЕТАЛЕЙ (PART THUMBNAILS)
// ═══════════════════════════════════════════════════════════════
// v1.0 — генерация canvas-миниатюры для детали.
// Используется в контекстном меню "Добавить детали на лист" (ПКМ).
//
// window.createPartThumbnail(part, size) → HTMLCanvasElement
//   - part: объект детали { objects: [...], bounds: {width, height}, ... }
//   - size: размер квадратной миниатюры в px (по умолчанию 56)
//   - возвращает canvas с отрисованным контуром детали
// ═══════════════════════════════════════════════════════════════

(function () {
    'use strict';

    // Кеш миниатюр по partId + ревизии геометрии.
    // Ключ: `${part.id}:${size}:${objCount}:${boundsW}:${boundsH}`
    const _thumbCache = new Map();
    const MAX_CACHE = 64;

    function hashPart(part) {
        const w = part && part.bounds ? (+part.bounds.width).toFixed(2) : '0';
        const h = part && part.bounds ? (+part.bounds.height).toFixed(2) : '0';
        const n = part && part.objects ? part.objects.length : 0;
        return `${part.id}:${n}:${w}:${h}`;
    }

    // Вычисляет bounding box массива объектов детали.
    function computeObjectsBounds(objects) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let found = false;

        for (const obj of objects) {
            let pts = null;
            try {
                if (obj === null || obj === undefined) continue;
                if (typeof obj.getPoints === 'function') {
                    pts = obj.getPoints();
                } else if (Array.isArray(obj.points) && obj.points.length) {
                    pts = obj.points;
                } else if (Array.isArray(obj.vertices) && obj.vertices.length) {
                    pts = obj.vertices;
                } else if (Array.isArray(obj.fitPoints) && obj.fitPoints.length) {
                    pts = obj.fitPoints;
                } else if (obj.type === 'circle' || obj.type === 'arc') {
                    const r = obj.radius || 0;
                    pts = [
                        { x: obj.cx - r, y: obj.cy - r },
                        { x: obj.cx + r, y: obj.cy + r }
                    ];
                } else if (obj.type === 'ellipse') {
                    pts = [
                        { x: obj.cx - (obj.rx || 0), y: obj.cy - (obj.ry || 0) },
                        { x: obj.cx + (obj.rx || 0), y: obj.cy + (obj.ry || 0) }
                    ];
                } else if (obj.type === 'rect') {
                    pts = [
                        { x: obj.x, y: obj.y },
                        { x: obj.x + (obj.width || 0), y: obj.y + (obj.height || 0) }
                    ];
                } else if (obj.type === 'line') {
                    pts = [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
                } else if (obj.type === 'text') {
                    pts = [{ x: obj.x, y: obj.y }, { x: obj.x + 20, y: obj.y + (obj.fontSize || 14) }];
                }
            } catch (e) {
                pts = null;
            }
            if (!pts) continue;

            for (const p of pts) {
                if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
                if (!isFinite(p.x) || !isFinite(p.y)) continue;
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
                found = true;
            }
        }

        if (!found) return null;
        return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }

    function createPartThumbnail(part, size) {
        size = Math.max(24, Math.min(200, size || 56));

        // Попытка взять из кеша
        const key = hashPart(part) + ':' + size;
        const cached = _thumbCache.get(key);
        if (cached) {
            // Возвращаем клон canvas, чтобы потребитель мог безопасно вставлять
            const clone = document.createElement('canvas');
            clone.width = cached.width;
            clone.height = cached.height;
            clone.getContext('2d').drawImage(cached, 0, 0);
            return clone;
        }

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Фон
        ctx.fillStyle = '#0f0f0f';
        ctx.fillRect(0, 0, size, size);

        const hasObjects = part && Array.isArray(part.objects) && part.objects.length > 0;

        if (!hasObjects) {
            ctx.fillStyle = '#555';
            ctx.font = `${Math.floor(size * 0.45)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('—', size / 2, size / 2);
            return canvas;
        }

        // Вычисляем границы
        let b = computeObjectsBounds(part.objects);
        if (!b || b.width <= 0.001 || b.height <= 0.001) {
            // Fallback на part.bounds
            if (part.bounds && part.bounds.width > 0 && part.bounds.height > 0) {
                b = { minX: 0, minY: 0, maxX: part.bounds.width, maxY: part.bounds.height,
                      width: part.bounds.width, height: part.bounds.height };
            } else {
                ctx.fillStyle = '#555';
                ctx.font = `${Math.floor(size * 0.45)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', size / 2, size / 2);
                return canvas;
            }
        }

        // Учёт возможного нулевого размера по одной из осей (например, только горизонтальная линия)
        const partW = Math.max(b.width, 0.001);
        const partH = Math.max(b.height, 0.001);

        const padding = 5;
        const availW = size - padding * 2;
        const availH = size - padding * 2;
        const scale = Math.min(availW / partW, availH / partH);
        const drawW = partW * scale;
        const drawH = partH * scale;
        const offsetX = padding + (availW - drawW) / 2;
        const offsetY = padding + (availH - drawH) / 2;

        // Сохраняем и применяем трансформацию: деталь вписывается в canvas
        ctx.save();
        ctx.translate(offsetX - b.minX * scale, offsetY - b.minY * scale);
        ctx.scale(scale, scale);

        // Настройки отрисовки по умолчанию.
        //.lineWidth = ширина в системе координат детали → на экране =  * scale.
        //Чтобы получить ~1.4px на экране, делим на scale.
        ctx.lineWidth = Math.max(0.15, 1.4 / scale);
        ctx.strokeStyle = '#00aadd';
        ctx.fillStyle = '#00aadd';
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const obj of part.objects) {
            try {
                if (obj && typeof obj.draw === 'function') {
                    obj.draw(ctx);
                }
            } catch (e) {
                // пропускаем проблемные объекты
            }
        }

        ctx.restore();

        // Сохра в кеш
        if (_thumbCache.size >= MAX_CACHE) {
            // удаляем первый (FIFO)
            const firstKey = _thumbCache.keys().next().value;
            _thumbCache.delete(firstKey);
        }
        _thumbCache.set(key, canvas);

        // Возвращаем клон, чтобы оригинал в кеше не мутировал
        const result = document.createElement('canvas');
        result.width = canvas.width;
        result.height = canvas.height;
        result.getContext('2d').drawImage(canvas, 0, 0);
        return result;
    }

    // Публичный API
    window.createPartThumbnail = createPartThumbnail;

    // Очистка кеша (например, при удалении/изменении детали)
    window.clearPartThumbnailCache = function () {
        _thumbCache.clear();
    };

    console.log('[part-thumbnail.js] v1.0 loaded — window.createPartThumbnail(part, size)');
})();
