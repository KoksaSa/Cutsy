// ═══════════════════════════════════════════════════════════
// find-alignment.js — функция для поиска оптимального выравнивания деталей
// ═══════════════════════════════════════════════════════════

console.log('🔧 [find-alignment.js] Загрузка модуля выравнивания');

/**
 * Находит оптимальное выравнивание для двух деталей
 * @param {Object} current — текущая деталь (которую двигаем)
 * @param {Object} reference — опорная деталь (относительно которой выравниваем)
 * @returns {Object|null} — координаты {x, y} или null если выравнивание невозможно
 */
function findAlignment(current, reference) {
    if (!current || !reference) return null;

    // v4.37 FIX F1: учитываем rotation детали. При 90°/270° ширина и высота
    // меняются местами (rotated bbox). baseWidth/baseHeight — оригинальные размеры
    // до поворота, width/height — rotated bbox. Используем rotated bbox для
    // позиционирования на листе (т.к. bounds на листе = rotated).
    // rotation в радианах; нормализуем к градусам 0..360.
    const currDeg = Math.round(((current.angle || 0) * 180 / Math.PI) % 360 + 360) % 360;
    const refDeg = Math.round(((reference.angle || 0) * 180 / Math.PI) % 360 + 360) % 360;
    const currRotated = (currDeg === 90 || currDeg === 270);
    const refRotated = (refDeg === 90 || refDeg === 270);

    // width/height уже отражают rotated bbox (движок обновляет их при повороте).
    // Если по какой-то причине width/height отсутствуют, берём baseWidth/baseHeight
    // и при 90°/270° swap'аем.
    let currW = current.width || current.baseWidth || 0;
    let currH = current.height || current.baseHeight || 0;
    let refW = reference.width || reference.baseWidth || 0;
    let refH = reference.height || reference.baseHeight || 0;
    // Если width/height были взяты из base (т.е. rotated bbox не был вычислен),
    // применяем swap вручную.
    if (currRotated && !current.width) { [currW, currH] = [currH, currW]; }
    if (refRotated && !reference.width) { [refW, refH] = [refH, refW]; }

    // Вычисляем идеальное позиционирование
    // Вариант 1: выравнивание по верхнему краю (current над reference)
    const alignTop = {
        x: reference.x,
        y: reference.y - currH
    };

    // Вариант 2: выравнивание по нижнему краю (current под reference)
    const alignBottom = {
        x: reference.x,
        y: reference.y + refH
    };

    // Вариант 3: выравнивание по левому краю (current слева от reference)
    const alignLeft = {
        x: reference.x - currW,
        y: reference.y
    };

    // Вариант 4: выравнивание по правому краю (current справа от reference)
    const alignRight = {
        x: reference.x + refW,
        y: reference.y
    };

    // Проверяем текущую позицию и выбираем ближайший вариант
    const currentCenterX = current.x + currW / 2;
    const currentCenterY = current.y + currH / 2;
    const refCenterX = reference.x + refW / 2;
    const refCenterY = reference.y + refH / 2;

    const dx = currentCenterX - refCenterX;
    const dy = currentCenterY - refCenterY;

    // v4.37 FIX: используем >= вместо >, чтобы при 45° не падать в alignTop (issue F3)
    // Если |dx| >= |dy| — горизонтальное выравнивание, иначе вертикальное.
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? alignRight : alignLeft;
    }
    return dy >= 0 ? alignBottom : alignTop;
}

/**
 * Проверка направления для вертикального соединения
 * Используется в nested-part-operations.js
 */
function checkDirection(direction, lower, upper, currW, currH, refW, refH) {
    if (direction === 'bottom') {
        // Выравниваем нижнюю деталь под верхней
        return {
            x: upper.x,
            y: upper.y + refH
        };
    }
    if (direction === 'top') {
        // Выравниваем верхнюю деталь над нижней
        return {
            x: lower.x,
            y: lower.y - currH
        };
    }
    if (direction === 'right') {
        // Выравниваем правую деталь справа от левой
        return {
            x: upper.x + refW,
            y: upper.y
        };
    }
    if (direction === 'left') {
        // Выравниваем левую деталь слева от правой
        return {
            x: upper.x - currW,
            y: upper.y
        };
    }
    return null;
}

console.log('✅ [find-alignment.js] Модуль выравнивания загружен');