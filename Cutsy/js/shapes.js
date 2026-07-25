// i: SilikinK Project
// ═══════════════════════════════════════════════════════════════
// КЛАССЫ ФИГУР (SHAPES)
// ═══════════════════════════════════════════════════════════════
// Вынесено из index.html для удобства поддержки

// ═══════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// ═══════════════════════════════════════════════════════════════

function pointToLineDistance(px, py, x1, y1, x2, y2) {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    let param = lenSq !== 0 ? dot / lenSq : -1;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.sqrt(Math.pow(px - xx, 2) + Math.pow(py - yy, 2));
}

// ═══════════════════════════════════════════════════════════════
// КЛАССЫ ФИГУР
// ═══════════════════════════════════════════════════════════════

// Line - линия с координатами (x1,y1) → (x2,y2)
class Line {
    constructor(x1, y1, x2, y2) {
        this.type = 'line';
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
        this.id = Date.now() + Math.random();
        this.color = '#00aadd';  // Цвет линии по умолчанию (голубой)
    }

    draw(ctx) {
        ctx.strokeStyle = this.color || '#00aadd';
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.stroke();
    }

    contains(x, y) {
        return pointToLineDistance(x, y, this.x1, this.y1, this.x2, this.y2) < 3;
    }

    get length() {
        return Math.sqrt(Math.pow(this.x2 - this.x1, 2) + Math.pow(this.y2 - this.y1, 2));
    }

    set length(value) {
        const angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
        this.x2 = this.x1 + Math.cos(angle) * value;
        this.y2 = this.y1 + Math.sin(angle) * value;
    }

    move(dx, dy) {
        this.x1 += dx;
        this.y1 += dy;
        this.x2 += dx;
        this.y2 += dy;
    }

    get center() {
        return { x: (this.x1 + this.x2) / 2, y: (this.y1 + this.y2) / 2 };
    }

    getPoints() {
        return [
            { x: this.x1, y: this.y1 },
            { x: this.x2, y: this.y2 },
            { x: (this.x1 + this.x2) / 2, y: (this.y1 + this.y2) / 2 }
        ];
    }

    getAngle() {
        return Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
    }

    clone() {
        const copy = new Line(this.x1, this.y1, this.x2, this.y2);
        copy.id = Date.now() + Math.random();
        copy.color = this.color;
        return copy;
    }
}

// Circle - круг с центром (cx,cy) и радиусом
class Circle {
    constructor(cx, cy, radius) {
        this.type = 'circle';
        this.cx = cx;
        this.cy = cy;
        this.radius = radius;
        this.id = Date.now() + Math.random();
        this.color = '#00aadd';  // Цвет линии по умолчанию (голубой)
    }

    draw(ctx) {
        ctx.strokeStyle = this.color || '#00aadd';
        ctx.beginPath();
        ctx.arc(this.cx, this.cy, this.radius, 0, Math.PI * 2);
        ctx.stroke();
    }

    contains(x, y) {
        return Math.abs(Math.sqrt(Math.pow(x - this.cx, 2) + Math.pow(y - this.cy, 2)) - this.radius) < 3;
    }

    move(dx, dy) {
        this.cx += dx;
        this.cy += dy;
    }

    get center() {
        return { x: this.cx, y: this.cy };
    }

    getPoints() {
        return [
            { x: this.cx, y: this.cy },
            { x: this.cx + this.radius, y: this.cy },
            { x: this.cx - this.radius, y: this.cy },
            { x: this.cx, y: this.cy + this.radius },
            { x: this.cx, y: this.cy - this.radius }
        ];
    }

    clone() {
        const copy = new Circle(this.cx, this.cy, this.radius);
        copy.id = Date.now() + Math.random();
        copy.color = this.color;
        return copy;
    }
}

// Rect - прямоугольник с позицией (x,y), шириной и высотой
class Rect {
    constructor(x, y, width, height) {
        this.type = 'rect';
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.id = Date.now() + Math.random();
        this.color = '#00aadd';  // Цвет линии по умолчанию (голубой)
    }

    draw(ctx) {
        ctx.strokeStyle = this.color || '#00aadd';
        ctx.strokeRect(this.x, this.y, this.width, this.height);
    }

    contains(x, y) {
        const minX = Math.min(this.x, this.x + this.width);
        const maxX = Math.max(this.x, this.x + this.width);
        const minY = Math.min(this.y, this.y + this.height);
        const maxY = Math.max(this.y, this.y + this.height);

        return ((x >= minX - 3 && x <= maxX + 3) && (Math.abs(y - minY) < 3 || Math.abs(y - maxY) < 3)) ||
               ((y >= minY - 3 && y <= maxY + 3) && (Math.abs(x - minX) < 3 || Math.abs(x - maxX) < 3));
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    get center() {
        return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
    }

    get absWidth() {
        return Math.abs(this.width);
    }

    get absHeight() {
        return Math.abs(this.height);
    }

    getPoints() {
        const x1 = this.x, y1 = this.y;
        const x2 = this.x + this.width, y2 = this.y + this.height;
        return [
            { x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 },
            { x: x1, y: (y1 + y2) / 2 }, { x: x2, y: (y1 + y2) / 2 },
            { x: (x1 + x2) / 2, y: y1 }, { x: (x1 + x2) / 2, y: y2 },
            { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
        ];
    }

    clone() {
        const copy = new Rect(this.x, this.y, this.width, this.height);
        copy.id = Date.now() + Math.random();
        copy.color = this.color;
        return copy;
    }
}

// Polygon - правильный многоугольник (для ручной отрисовки)
class Polygon {
    constructor(cx, cy, radius, sides) {
        this.type = 'polygon';
        this.cx = cx;
        this.cy = cy;
        this.radius = radius;
        this.sides = Math.max(3, Math.min(20, sides || 6));
        this.id = Date.now() + Math.random();
        this.color = '#00aadd';  // Цвет линии по умолчанию (как у остальных)
    }

    getVertices() {
        const vertices = [];
        const angleStep = (Math.PI * 2) / this.sides;
        for (let i = 0; i < this.sides; i++) {
            const angle = angleStep * i - Math.PI / 2;
            vertices.push({
                x: this.cx + Math.cos(angle) * this.radius,
                y: this.cy + Math.sin(angle) * this.radius
            });
        }
        return vertices;
    }

    draw(ctx) {
        ctx.strokeStyle = this.color || '#00aadd';
        const v = this.getVertices();
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        for (let i = 1; i < v.length; i++) {
            ctx.lineTo(v[i].x, v[i].y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    contains(x, y) {
        const v = this.getVertices();
        let inside = false;
        for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
            if (((v[i].y > y) !== (v[j].y > y)) &&
                (x < (v[j].x - v[i].x) * (y - v[i].y) / (v[j].y - v[i].y) + v[i].x)) {
                inside = !inside;
            }
        }
        for (let i = 0; i < v.length; i++) {
            const next = (i + 1) % v.length;
            if (pointToLineDistance(x, y, v[i].x, v[i].y, v[next].x, v[next].y) < 3) {
                return true;
            }
        }
        return inside;
    }

    move(dx, dy) {
        this.cx += dx;
        this.cy += dy;
    }

    get center() {
        return { x: this.cx, y: this.cy };
    }

    getPoints() {
        return [{ x: this.cx, y: this.cy }].concat(this.getVertices());
    }

    clone() {
        const copy = new Polygon(this.cx, this.cy, this.radius, this.sides);
        copy.id = Date.now() + Math.random();
        copy.color = this.color;
        return copy;
    }
}

// ═══════════════════════════════════════════════════════════════
// CustomPolygon - ПРОИЗВОЛЬНЫЙ КОНТУР (Для DXF импорта из Компас/Fusion)
// ═══════════════════════════════════════════════════════════════
// Сохраняет оригинальные точки развертки, без искажения геометрии
class CustomPolygon {
    constructor(points, closed = true) {
        this.type = closed ? 'polygon' : 'polyline';
        this.points = points; // Массив объектов [{x, y}, ...]
        this.closed = closed;
        this.id = Date.now() + Math.random();
        this.color = '#00aadd';  // Цвет линии по умолчанию (голубой)
        // v4.66: Вычисляем cx/cy/radius для совместимости с properties-panel
        // (panel ожидает cx, cy, radius, sides для polygon — иначе падает на toFixed)
        this.sides = points.length;
        this._updateCenterAndRadius();
    }

    // v4.66: Обновляет cx, cy, radius на основе points
    _updateCenterAndRadius() {
        if (!this.points || this.points.length === 0) {
            this.cx = 0; this.cy = 0; this.radius = 0;
            return;
        }
        let sumX = 0, sumY = 0;
        for (const p of this.points) { sumX += p.x; sumY += p.y; }
        this.cx = sumX / this.points.length;
        this.cy = sumY / this.points.length;
        // Radius = максимальное расстояние от центра до точки
        let maxR = 0;
        for (const p of this.points) {
            const d = Math.hypot(p.x - this.cx, p.y - this.cy);
            if (d > maxR) maxR = d;
        }
        this.radius = maxR;
    }

    draw(ctx) {
        ctx.strokeStyle = this.color || '#00aadd';
        if (!this.points || this.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x, this.points[i].y);
        }
        if (this.closed) ctx.closePath();
        ctx.stroke();
    }

    contains(x, y) {
        if (!this.points || this.points.length < 2) return false;
        
        // Проверка попадания на линии контура (как у обычного Polygon)
        for (let i = 0; i < this.points.length; i++) {
            if (!this.closed && i === this.points.length - 1) continue;
            const next = (i + 1) % this.points.length;
            if (pointToLineDistance(x, y, this.points[i].x, this.points[i].y, this.points[next].x, this.points[next].y) < 3) {
                return true;
            }
        }
        
        // Проверка попадания внутрь замкнутого контура
        if (this.closed) {
            let inside = false;
            for (let i = 0, j = this.points.length - 1; i < this.points.length; j = i++) {
                const xi = this.points[i].x, yi = this.points[i].y;
                const xj = this.points[j].x, yj = this.points[j].y;
                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
            return inside;
        }
        return false;
    }

    move(dx, dy) {
        this.points.forEach(p => {
            p.x += dx;
            p.y += dy;
        });
        this._updateCenterAndRadius();
    }

    get center() {
        if (!this.points || this.points.length === 0) return { x: 0, y: 0 };
        const cx = this.points.reduce((sum, p) => sum + p.x, 0) / this.points.length;
        const cy = this.points.reduce((sum, p) => sum + p.y, 0) / this.points.length;
        return { x: cx, y: cy };
    }

    getPoints() {
        return this.points;
    }

    clone() {
        const copy = new CustomPolygon(this.points.map(p => ({ x: p.x, y: p.y })), this.closed);
        copy.id = Date.now() + Math.random();
        copy.color = this.color;
        return copy;
    }
}

// Text - текстовая надпись
class Text {
    constructor(x, y, text, fontSize = 14) {
        this.type = 'text';
        this.x = x;
        this.y = y;
        this.text = text;
        this.fontSize = fontSize;
        this.id = Date.now() + Math.random();
    }

    draw(ctx, isSelected = false) {
        ctx.fillStyle = isSelected ? '#007acc' : '#00ff00';
        ctx.font = `${this.fontSize}px Segoe UI`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        // v3.39: Поддержка поворота текста
        if (this.rotation) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.fillText(this.text, 0, 0);
            if (isSelected) {
                const metrics = ctx.measureText(this.text);
                ctx.strokeStyle = '#007acc';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(-2, -2, metrics.width + 4, this.fontSize + 4);
                ctx.setLineDash([]);
            }
            ctx.restore();
        } else {
            ctx.fillText(this.text, this.x, this.y);
            // Рамка при выделении
            if (isSelected) {
                const metrics = ctx.measureText(this.text);
                ctx.strokeStyle = '#007acc';
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.strokeRect(this.x - 2, this.y - 2, metrics.width + 4, this.fontSize + 4);
                ctx.setLineDash([]);
            }
        }
    }

    contains(x, y) {
        const ctx = canvas.getContext('2d');
        ctx.font = `${this.fontSize}px Segoe UI`;
        const metrics = ctx.measureText(this.text);
        const width = metrics.width;
        const height = this.fontSize;
        return x >= this.x - 3 && x <= this.x + width + 3 &&
               y >= this.y - 3 && y <= this.y + height + 3;
    }

    move(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    get center() {
        const ctx = canvas.getContext('2d');
        ctx.font = `${this.fontSize}px Segoe UI`;
        const metrics = ctx.measureText(this.text);
        return { x: this.x + metrics.width / 2, y: this.y + this.fontSize / 2 };
    }

    getPoints() {
        const ctx = canvas.getContext('2d');
        ctx.font = `${this.fontSize}px Segoe UI`;
        const metrics = ctx.measureText(this.text);
        return [
            { x: this.x, y: this.y },
            { x: this.x + metrics.width, y: this.y },
            { x: this.x + metrics.width, y: this.y + this.fontSize },
            { x: this.x, y: this.y + this.fontSize },
            { x: this.x + metrics.width / 2, y: this.y + this.fontSize / 2 }
        ];
    }

    clone() {
        const copy = new Text(this.x, this.y, this.text, this.fontSize);
        copy.id = Date.now() + Math.random();
        return copy;
    }
}