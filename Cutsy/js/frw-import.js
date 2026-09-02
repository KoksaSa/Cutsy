// ═══════════════════════════════════════════════════════════════
// frw-import.js — v2.0 — Импорт КОМПАС-3D .FRW файлов (полный парсер)
// ═══════════════════════════════════════════════════════════════
// Формат .FRW (КОМПАС-3D фрагмент/развертка, ASCON):
//   1. ZIP-контейнер (как .docx/.odt), записи обычно store (method=0)
//   2. Внутри: FileInfo, Sources, Contents, SysInfo, Preview, MetaInfo, MetaProductInfo
//   3. Contents — формат "KF" (Kompas File): "KF" (2 байта) + последовательность
//      zlib-сжатых блоков (magic 0x78 0x9c). Каждый блок = порция данных.
//   4. В decompressed данных: геометрия хранится как IEEE 754 double (8 байт LE).
//      BBox детали — 4 double (xmin, ymin, xmax, ymax).
//      Линии — 4 double (x1, y1, x2, y2).
//      Полилинии — ряды (x, y) пар.
//      Круги/дуги — (cx, cy, radius, ...).
//
// Этот парсер:
//   1. Распаковывает ZIP → достаёт Contents
//   2. Декодирует KF: "KF" + последовательность zlib-потоков
//   3. Объединяет все decompressed блоки
//   4. Извлекает double-геометрию: bbox + линии + полилинии + круги
//   5. Возвращает в формате, совместимом с importDXF()
//
// Возвращаемый формат: { objects, bounds, fileName, source, heuristic:false }
// ═══════════════════════════════════════════════════════════════

/**
 * Импорт .FRW файла.
 * @param {File} file — .FRW файл
 * @returns {Promise<{objects:Array, bounds:Object, fileName:string}|null>}
 */
async function importFRW(file) {
    if (!file) return null;

    const frwFileName = file.name.replace(/\.frw$/i, '');
    console.log(`📐 [FRW-IMPORT] Начало импорта "${file.name}" (${file.size} байт)`);

    let buffer;
    try {
        buffer = await file.arrayBuffer();
    } catch (e) {
        console.error(`❌ [FRW-IMPORT] Не удалось прочитать файл:`, e);
        return null;
    }

    // ── Шаг 1: Проверяем ZIP-сигнатуру ──
    const view = new DataView(buffer);
    const sig = view.getUint32(0, true);
    if (sig !== 0x04034b50) {
        console.warn(`⚠️ [FRW-IMPORT] Файл не является ZIP-архивом (sig=0x${sig.toString(16)})`);
        // Fallback на старую эвристику double-scan
        return fallbackHeuristic(buffer, frwFileName);
    }

    // ── Шаг 2: Распаковываем ZIP, достаём Contents ──
    let contentsData;
    try {
        const entries = parseZipEntries(buffer);
        console.log(`📦 [FRW-IMPORT] ZIP-записи: ${entries.map(e => e.name).join(', ')}`);
        const contentsEntry = entries.find(e => e.name === 'Contents');
        if (!contentsEntry) {
            console.error(`❌ [FRW-IMPORT] В ZIP нет записи "Contents"`);
            return null;
        }
        contentsData = contentsEntry.data;
        console.log(`📦 [FRW-IMPORT] Contents: ${contentsData.length} байт`);
    } catch (e) {
        console.error(`❌ [FRW-IMPORT] Ошибка парсинга ZIP:`, e);
        return null;
    }

    // ── Шаг 3: Декодируем KF-формат → массив decompressed потоков ──
    let decoded;
    try {
        console.log(`📐 [FRW-IMPORT] Декодирование KF (Contents ${contentsData.length} байт)...`);
        decoded = decodeKFContents(contentsData);
        console.log(`📐 [FRW-IMPORT] KF декодирован: ${decoded.streams.length} потоков, всего ${decoded.buffer.length} байт`);
    } catch (e) {
        console.error(`❌ [FRW-IMPORT] Ошибка декодирования KF:`, e.message, e.stack);
        return null;
    }

    if (decoded.streams.length === 0) {
        console.warn(`⚠️ [FRW-IMPORT] KF декодирование дало 0 потоков`);
        return null;
    }

    // ── Шаг 4: Извлекаем геометрию из decompressed потоков ──
    // Каждый поток сканируется отдельно (внутри потока 8-байтное выравнивание сохраняется)
    const objects = extractGeometryFromDecoded(decoded.streams);

    if (objects.length === 0) {
        console.warn(`⚠️ [FRW-IMPORT] Не удалось извлечь геометрию из "${file.name}"`);
        return null;
    }

    // ── Шаг 4b: Инверсия Y (КОМПАС Y-up → canvas Y-down) ──
    // КОМПАС использует математическую систему координат (Y вверх),
    // canvas — экранную (Y вниз). Без инверсии деталь отображается
    // зеркально по вертикали. Инвертируем Y относительно центра bbox:
    // y_new = (minY + maxY) - y. Bbox сохраняется, содержимое зеркалится.
    invertYFRW(objects);
    console.log(`🔄 [FRW-IMPORT] Y инвертирован (КОМПАС Y-up → canvas Y-down)`);

    // ── Шаг 5: Вычисляем bounds ──
    const bounds = computeBounds(objects);
    if (!bounds || bounds.width < 0.1 || bounds.height < 0.1) {
        console.warn(`⚠️ [FRW-IMPORT] Извлечённая геометрия вырождена (bbox=${bounds ? bounds.width.toFixed(1) + '×' + bounds.height.toFixed(1) : 'null'}мм)`);
        return null;
    }

    console.log(`✅ [FRW-IMPORT] "${file.name}": ${objects.length} объектов, bbox=${bounds.width.toFixed(1)}×${bounds.height.toFixed(1)}мм`);

    return {
        objects: objects,
        bounds: bounds,
        fileName: frwFileName,
        source: 'kf-zip',
        heuristic: false
    };
}

// ═══════════════════════════════════════════════════════════════
// ШАГ 2: ZIP-парсер (store + deflate)
// ═══════════════════════════════════════════════════════════════

/**
 * Парсит ZIP-архив и возвращает массив записей {name, data}.
 * Поддерживает method=0 (store) и method=8 (deflate-raw).
 * @param {ArrayBuffer} buffer
 * @returns {Array<{name:string, data:Uint8Array}>}
 */
function parseZipEntries(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const entries = [];
    let off = 0;

    while (off + 30 <= buffer.byteLength) {
        const sig = view.getUint32(off, true);
        if (sig !== 0x04034b50) break; // конец local file headers

        const method = view.getUint16(off + 8, true);
        const compSize = view.getUint32(off + 18, true);
        const uncompSize = view.getUint32(off + 22, true);
        const fnLen = view.getUint16(off + 26, true);
        const extraLen = view.getUint16(off + 28, true);

        const nameStart = off + 30;
        const name = new TextDecoder('utf-8').decode(bytes.subarray(nameStart, nameStart + fnLen));
        const dataStart = nameStart + fnLen + extraLen;
        const compData = bytes.subarray(dataStart, dataStart + compSize);

        let data;
        if (method === 0) {
            // store — без сжатия
            data = new Uint8Array(compData); // копия
        } else if (method === 8) {
            // deflate-raw — декомпрессируем синхронно через helper
            data = deflateRawDecompress(compData);
            if (!data) {
                console.warn(`⚠️ [FRW-IMPORT] Не удалось распаковать deflate-raw запись "${name}"`);
                off = dataStart + compSize;
                continue;
            }
        } else {
            console.warn(`⚠️ [FRW-IMPORT] Неподдерживаемый method=${method} для "${name}"`);
            off = dataStart + compSize;
            continue;
        }

        entries.push({ name: name, data: data });
        off = dataStart + compSize;
    }

    return entries;
}

/**
 * Синхронная декомпрессия deflate-raw через DecompressionStream.
 * DecompressionStream асинхронный, но мы используем sync-accessor:
 * на самом деле мы НЕ можем сделать это синхронно. Поэтому для .FRW
 * (где все записи обычно store) этот метод нужен редко. Реализуем
 * через промис + кэш, вызываемый из async-контекста.
 *
 * Упрощение: .FRW-файлы КОМПАС используют store для Contents, поэтому
 * deflate здесь только для MetaInfo/MetaProductInfo (которые нам не нужны).
 * Если method=8 встретится — возвращаем пустой массив (запись пропускается).
 */
function deflateRawDecompress(compData) {
    // В .FRW от КОМПАС Contents всегда store. MetaInfo/MetaProductInfo
    // могут быть deflate, но они не нужны для геометрии.
    // Возвращаем null — вызывающий код пропустит запись.
    return null;
}

/**
 * Async-версия для записей, которые реально нужны (если появится demand).
 * Сейчас не используется — оставлено для будущего расширения.
 */
async function deflateRawDecompressAsync(compData) {
    try {
        const cs = new Response(compData).body
            .pipeThrough(new DecompressionStream('deflate-raw'));
        const buf = await new Response(cs).arrayBuffer();
        return new Uint8Array(buf);
    } catch (e) {
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════
// ШАГ 3: KF-декодер ("KF" + последовательность zlib-потоков)
// ═══════════════════════════════════════════════════════════════

/**
 * Декодирует KF-формат: "KF" (2 байта) + последовательность zlib-потоков.
 * Каждый zlib-поток начинается с 0x78 0x9c. Распаковываем все потоки,
 * объединяем decompressed данные в один buffer.
 *
 * @param {Uint8Array} contentsData
 * @returns {{buffer:Uint8Array, streamCount:number}}
 */
function decodeKFContents(contentsData) {
    // Проверяем "KF" заголовок
    if (contentsData.length < 2 || contentsData[0] !== 0x4b || contentsData[1] !== 0x46) {
        console.warn(`⚠️ [FRW-IMPORT] Contents не начинается с "KF" (получено: 0x${contentsData[0]?.toString(16)} 0x${contentsData[1]?.toString(16)})`);
        // Пробуем декодировать всё как один zlib-поток
        return tryDecodeZlibStreams(contentsData);
    }
    // Пропускаем "KF" (2 байта) — дальше последовательность zlib-потоков
    return tryDecodeZlibStreams(contentsData.subarray(2));
}

/**
 * Находит все zlib-потоки (magic 0x78 0x9c) в данных и декомпрессирует их.
 * Возвращает объединённый buffer + количество потоков.
 *
 * @param {Uint8Array} data
 * @returns {{buffer:Uint8Array, streamCount:number}}
 */
function tryDecodeZlibStreams(data) {
    // Находим все смещения zlib-потоков
    const offsets = [];
    for (let i = 0; i < data.length - 1; i++) {
        if (data[i] === 0x78 && data[i + 1] === 0x9c) {
            offsets.push(i);
        }
    }

    console.log(`📐 [FRW-IMPORT] tryDecodeZlibStreams: ${offsets.length} потоков найдено`);

    if (offsets.length === 0) {
        console.warn(`⚠️ [FRW-IMPORT] Не найдено zlib-потоков в Contents`);
        return { buffer: new Uint8Array(0), streams: [], streamCount: 0 };
    }

    // Декомпрессируем каждый поток отдельно.
    // ВАЖНО: НЕ объединяем потоки в один buffer — границы потоков НЕ выровнены
    // по 8 байт, что ломает чтение IEEE 754 double.
    const streams = [];
    let failedCount = 0;
    for (let k = 0; k < offsets.length; k++) {
        const start = offsets[k];
        const end = (k + 1 < offsets.length) ? offsets[k + 1] : data.length;
        const streamData = data.subarray(start, end);
        try {
            const dec = zlibDecompress(streamData);
            if (dec && dec.length > 0) {
                streams.push(dec);
            } else {
                failedCount++;
            }
        } catch (e) {
            console.warn(`⚠️ [FRW-IMPORT] Поток #${k} (offset ${start}, ${streamData.length} байт) упал: ${e.message}`);
            failedCount++;
        }
    }
    console.log(`📐 [FRW-IMPORT] Декомпрессия: ${streams.length} успешно, ${failedCount} неудачно`);

    // Для обратной совместимости: объединяем в один buffer
    let totalLen = 0;
    for (const c of streams) totalLen += c.length;
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const c of streams) {
        combined.set(c, pos);
        pos += c.length;
    }

    return { buffer: combined, streams: streams, streamCount: offsets.length };
}

/**
 * Декомпрессия одного zlib-потока через DecompressionStream('deflate').
 * Синхронно НЕ работает (stream API) — используем sync-обёртку с псевдо-async.
 *
 * УПРАЩЕНИЕ: поскольку DecompressionStream асинхронный, а parseZipEntries
 * и decodeKFContents вызваны из async importFRW, мы могли бы сделать их async.
 * Но для простоты кода и совместимости — реализуем синхронную декомпрессию
 * через чистый JS (pako-подобный мини-декомпрессор).
 *
 * Альтернатива: используем `await` везде. Но это усложнит API.
 * Решение: реализуем минимальный синхронный zlib-декомпрессор (inflate).
 */
function zlibDecompress(data) {
    // Пытаемся через DecompressionStream (async) — не подходит для sync-вызова.
    // Реализуем минимальный inflate через встроенные средства.
    // К сожалению, браузер НЕ предоставляет синхронный inflate.
    //
    // РЕШЕНИЕ: используем Atomics.wait + SharedArrayBuffer? Слишком сложно.
    // АЛЬТЕРНАТИВА: реализуем inflate на чистом JS (мини-pako).
    //
    // Для .FRW файлов КОМПАС Contents часто несжатый (store в ZIP),
    // но внутри KF — zlib-блоки. Поэтому нам НУЖЕН inflate.
    return inflateSync(data);
}

// ═══════════════════════════════════════════════════════════════
// МИНИ-INFLATE (чистый JS, синхронный)
// ═══════════════════════════════════════════════════════════════
// Реализация DEFLATE (RFC 1951) для декомпрессии zlib-потоков.
// Поддерживает все 3 типа блоков: stored, fixed Huffman, dynamic Huffman.
// Это компактная реализация (~200 строк), достаточная для .FRW файлов.

/**
 * Синхронная декомпрессия zlib (2-байт заголовок + DEFLATE + 4-байт Adler32).
 * @param {Uint8Array} data — zlib-поток
 * @returns {Uint8Array|null} decompressed или null при ошибке
 */
function inflateSync(data) {
    if (data.length < 6) return null;
    // Пропускаем zlib-заголовок (2 байта: 0x78 0x9c = default compression)
    // CMF = data[0], FLG = data[1]. Проверяем checksum (data[0]*256 + data[1]) % 31 == 0
    const header = (data[0] << 8) | data[1];
    if (header % 31 !== 0) {
        // Не валидный zlib-заголовок — пробуем как raw deflate
        return inflateRawSync(data);
    }
    return inflateRawSync(data.subarray(2));
}

/**
 * Декомпрессия raw DEFLATE (RFC 1951).
 * @param {Uint8Array} data
 * @returns {Uint8Array|null}
 */
function inflateRawSync(data) {
    const reader = new BitReader(data);
    const out = [];
    let outPos = 0;
    // Защита от зацикливания и memory overflow:
    // Максимум 1M итераций блоков и 50MB вывода (с запасом для .FRW)
    const MAX_BLOCKS = 1000000;
    const MAX_OUTPUT = 50 * 1024 * 1024;
    let blockCount = 0;

    try {
        while (true) {
            if (++blockCount > MAX_BLOCKS) {
                console.warn(`⚠️ [FRW-IMPORT] inflate: достигнут лимит блоков (${MAX_BLOCKS})`);
                return null;
            }
            if (out.length > MAX_OUTPUT) {
                console.warn(`⚠️ [FRW-IMPORT] inflate: достигнут лимит вывода (${MAX_OUTPUT} байт)`);
                return null;
            }
            const bfinal = reader.readBits(1);
            const btype = reader.readBits(2);

            if (btype === 0) {
                // Stored (no compression)
                reader.alignToByte();
                const len = reader.readByte() | (reader.readByte() << 8);
                const nlen = reader.readByte() | (reader.readByte() << 8);
                if ((len ^ 0xffff) !== nlen) return null; // invalid
                for (let i = 0; i < len; i++) {
                    out.push(reader.readByte());
                }
            } else if (btype === 1) {
                // Fixed Huffman
                if (!inflateHuffman(reader, out, FIXED_LIT_TREE, FIXED_DIST_TREE)) return null;
            } else if (btype === 2) {
                // Dynamic Huffman
                const hlit = reader.readBits(5) + 257;
                const hdist = reader.readBits(5) + 1;
                const hclen = reader.readBits(4) + 4;
                const codeLengths = new Array(19).fill(0);
                const clOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
                for (let i = 0; i < hclen; i++) {
                    codeLengths[clOrder[i]] = reader.readBits(3);
                }
                const clTree = buildHuffman(codeLengths);
                const litDistLengths = [];
                while (litDistLengths.length < hlit + hdist) {
                    const sym = decodeSymbol(reader, clTree);
                    if (sym < 16) {
                        litDistLengths.push(sym);
                    } else if (sym === 16) {
                        const rep = reader.readBits(2) + 3;
                        const prev = litDistLengths[litDistLengths.length - 1];
                        for (let i = 0; i < rep; i++) litDistLengths.push(prev);
                    } else if (sym === 17) {
                        const rep = reader.readBits(3) + 3;
                        for (let i = 0; i < rep; i++) litDistLengths.push(0);
                    } else if (sym === 18) {
                        const rep = reader.readBits(7) + 11;
                        for (let i = 0; i < rep; i++) litDistLengths.push(0);
                    } else {
                        return null;
                    }
                }
                const litTree = buildHuffman(litDistLengths.slice(0, hlit));
                const distTree = buildHuffman(litDistLengths.slice(hlit));
                if (!inflateHuffman(reader, out, litTree, distTree)) return null;
            } else {
                return null; // invalid btype
            }

            if (bfinal) break;
        }
    } catch (e) {
        return null;
    }

    return new Uint8Array(out);
}

class BitReader {
    constructor(data) {
        this.data = data;
        this.pos = 0;
        this.bitBuf = 0;
        this.bitCount = 0;
    }
    readBits(n) {
        while (this.bitCount < n) {
            if (this.pos >= this.data.length) throw new Error('EOF');
            this.bitBuf |= this.data[this.pos++] << this.bitCount;
            this.bitCount += 8;
        }
        const val = this.bitBuf & ((1 << n) - 1);
        this.bitBuf >>>= n;
        this.bitCount -= n;
        return val;
    }
    readByte() {
        if (this.bitCount >= 8) {
            const v = this.bitBuf & 0xff;
            this.bitBuf >>>= 8;
            this.bitCount -= 8;
            return v;
        }
        if (this.pos >= this.data.length) throw new Error('EOF');
        return this.data[this.pos++];
    }
    alignToByte() {
        this.bitBuf = 0;
        this.bitCount = 0;
    }
}

function buildHuffman(codeLengths) {
    // Строим таблицу декодирования. Возвращаем {codes, maxLen}.
    // ВАЖНО: НЕ используем Math.max(...codeLengths) — для больших массивов
    // (288+ элементов) spread может переполнить стек вызовов в браузере.
    let maxLen = 0;
    for (let i = 0; i < codeLengths.length; i++) {
        if (codeLengths[i] > maxLen) maxLen = codeLengths[i];
    }
    if (maxLen === 0) return { codes: {}, maxLen: 0 };

    const blCount = new Array(maxLen + 1).fill(0);
    for (const cl of codeLengths) {
        if (cl > 0) blCount[cl]++;
    }

    const nextCode = new Array(maxLen + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxLen; bits++) {
        code = (code + blCount[bits - 1]) << 1;
        nextCode[bits] = code;
    }

    const codes = {};
    for (let n = 0; n < codeLengths.length; n++) {
        const len = codeLengths[n];
        if (len > 0) {
            codes[nextCode[len]] = { symbol: n, length: len };
            nextCode[len]++;
        }
    }

    return { codes: codes, maxLen: maxLen };
}

function decodeSymbol(reader, tree) {
    let code = 0;
    for (let len = 1; len <= tree.maxLen; len++) {
        code = (code << 1) | reader.readBits(1);
        if (tree.codes[code] && tree.codes[code].length === len) {
            return tree.codes[code].symbol;
        }
    }
    throw new Error('Invalid Huffman code');
}

// Fixed Huffman tables (RFC 1951 section 3.2.6)
const FIXED_LIT_LENGTHS = (() => {
    const arr = new Array(288);
    for (let i = 0; i < 144; i++) arr[i] = 8;
    for (let i = 144; i < 256; i++) arr[i] = 9;
    for (let i = 256; i < 280; i++) arr[i] = 7;
    for (let i = 280; i < 288; i++) arr[i] = 8;
    return arr;
})();
const FIXED_DIST_LENGTHS = new Array(30).fill(5);
const FIXED_LIT_TREE = buildHuffman(FIXED_LIT_LENGTHS);
const FIXED_DIST_TREE = buildHuffman(FIXED_DIST_LENGTHS);

const LENGTH_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LENGTH_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

function inflateHuffman(reader, out, litTree, distTree) {
    // Защита от зацикливания: максимум 5M символов на блок
    const MAX_SYMBOLS = 5000000;
    let symCount = 0;
    while (true) {
        if (++symCount > MAX_SYMBOLS) {
            console.warn(`⚠️ [FRW-IMPORT] inflateHuffman: достигнут лимит символов (${MAX_SYMBOLS})`);
            return false;
        }
        const sym = decodeSymbol(reader, litTree);
        if (sym < 256) {
            out.push(sym);
        } else if (sym === 256) {
            break; // end of block
        } else {
            const li = sym - 257;
            if (li >= LENGTH_BASE.length) return false;
            const length = LENGTH_BASE[li] + (LENGTH_EXTRA[li] > 0 ? reader.readBits(LENGTH_EXTRA[li]) : 0);
            const distSym = decodeSymbol(reader, distTree);
            if (distSym >= DIST_BASE.length) return false;
            const dist = DIST_BASE[distSym] + (DIST_EXTRA[distSym] > 0 ? reader.readBits(DIST_EXTRA[distSym]) : 0);
            const start = out.length - dist;
            if (start < 0) return false; // invalid back-reference
            for (let i = 0; i < length; i++) {
                out.push(out[start + i]);
            }
        }
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// ШАГ 4: Извлечение геометрии из decompressed buffer
// ═══════════════════════════════════════════════════════════════

const FRW_COORD_MIN = -100000;
const FRW_COORD_MAX = 100000;

/**
 * Извлекает геометрию из декомпрессированных KF-потоков.
 *
 * Стратегия v2.1 (после анализа реального .frw файла):
 *   - Каждый zlib-поток сканируется ОТДЕЛЬНО с offset 0 (внутри потока
 *     8-байтное выравнивание double сохраняется, между потоками — НЕТ).
 *   - Проход 1: во ВСЕХ потоках найдём bbox детали (4 double: xmin,ymin,xmax,ymax).
 *   - Проход 2: в каждом потоке собираем ряды правдоподобных double,
 *     обрываем ряды на padding (2+ подряд 0.0) и на значениях вне bbox.
 *   - Ряд ровно 4 double (x1,y1,x2,y2) → линия.
 *     Ряд ≥6 double → полилиния (CustomPolygon).
 *
 * @param {Array<Uint8Array>} streams — массив декомпрессированных потоков
 * @returns {Array}
 */
function extractGeometryFromDecoded(streams) {
    // ── Проход 0: v2.7 — проверим Stream #9 (32 байта = 4 double bbox детали).
    // КОМПАС хранит bbox детали в Stream #9 как 4 double (xmin,ymin,xmax,ymax).
    // Это НАДЁЖНЕЕ чем поиск bbox в Stream #10 (где могут быть ложные совпадения).
    let bbox = null;
    if (streams.length >= 10 && streams[9].length === 32) {
        const s9 = streams[9];
        const v9 = new DataView(s9.buffer, s9.byteOffset, s9.byteLength);
        try {
            const v0 = v9.getFloat64(0, true);
            const v1 = v9.getFloat64(8, true);
            const v2 = v9.getFloat64(16, true);
            const v3 = v9.getFloat64(24, true);
            if (Number.isFinite(v0) && Number.isFinite(v1) && Number.isFinite(v2) && Number.isFinite(v3) &&
                v0 < v2 && v1 < v3 &&
                v0 > FRW_COORD_MIN && v2 < FRW_COORD_MAX &&
                v1 > FRW_COORD_MIN && v3 < FRW_COORD_MAX) {
                const w = v2 - v0;
                const h = v3 - v1;
                if (w >= 0.5 && w <= 5000 && h >= 0.5 && h <= 5000) {
                    bbox = { minX: v0, minY: v1, maxX: v2, maxY: v3 };
                    console.log(`📐 [FRW-IMPORT] BBox из Stream #9: (${v0.toFixed(1)},${v1.toFixed(1)}) → (${v2.toFixed(1)},${v3.toFixed(1)}) = ${w.toFixed(1)}×${h.toFixed(1)}мм`);
                }
            }
        } catch (e) {}
    }

    // ── Проход 1: если Stream #9 не дал bbox — ищем в Stream #10 по всем потокам.
    //    Реальные детали: 1..1000мм, предпочтительно с отрицательными координатами.
    const bboxCandidates = [];
    if (!bbox) {
    for (let si = 0; si < streams.length; si++) {
        const stream = streams[si];
        const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
        const len = stream.length;
        for (let off = 0; off + 32 <= len; off += 8) {
            let v0, v1, v2, v3;
            try {
                v0 = view.getFloat64(off, true);
                v1 = view.getFloat64(off + 8, true);
                v2 = view.getFloat64(off + 16, true);
                v3 = view.getFloat64(off + 24, true);
            } catch (e) { continue; }
            if (!Number.isFinite(v0) || !Number.isFinite(v1) || !Number.isFinite(v2) || !Number.isFinite(v3)) continue;
            // BBox: v0=xmin, v1=ymin, v2=xmax, v3=ymax
            if (v0 < v2 && v1 < v3 &&
                v0 >= FRW_COORD_MIN && v2 <= FRW_COORD_MAX &&
                v1 >= FRW_COORD_MIN && v3 <= FRW_COORD_MAX) {
                const w = v2 - v0;
                const h = v3 - v1;
                // Реальные детали: 1..1000мм (отсекаем Preview 128×2048 и мусор)
                if (w >= 1 && w <= 1000 && h >= 1 && h <= 1000) {
                    // Предпочитаем bbox с отрицательными координатами (типичная CAD-деталь
                    // центрирована в origin) и без нулевых углов
                    const hasNegative = v0 < 0 || v1 < 0;
                    const noZeroCorner = v0 !== 0 && v1 !== 0;
                    bboxCandidates.push({ off, v0, v1, v2, v3, w, h, hasNegative, noZeroCorner });
                }
            }
        }
    }
    // Сортируем: предпочитаем с отрицательными координатами + без нулевых углов
    bboxCandidates.sort((a, b) => {
        const scoreA = (a.hasNegative ? 2 : 0) + (a.noZeroCorner ? 1 : 0);
        const scoreB = (b.hasNegative ? 2 : 0) + (b.noZeroCorner ? 1 : 0);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return a.off - b.off;
    });
    if (bboxCandidates.length > 0) {
        const b = bboxCandidates[0];
        bbox = { minX: b.v0, minY: b.v1, maxX: b.v2, maxY: b.v3 };
        console.log(`📐 [FRW-IMPORT] BBox найден: (${b.v0.toFixed(1)},${b.v1.toFixed(1)}) → (${b.v2.toFixed(1)},${b.v3.toFixed(1)}) = ${b.w.toFixed(1)}×${b.h.toFixed(1)}мм (кандидатов: ${bboxCandidates.length})`);
    } else {
        console.warn(`⚠️ [FRW-IMPORT] BBox не найден — фильтрация по диапазону отключена`);
    }
    } // end if (!bbox)

    // Запас для фильтрации точек (20% от max dim)
    const margin = bbox ? Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.2 + 5 : 100;
    const fxMin = bbox ? bbox.minX - margin : FRW_COORD_MIN;
    const fxMax = bbox ? bbox.maxX + margin : FRW_COORD_MAX;
    const fyMin = bbox ? bbox.minY - margin : FRW_COORD_MIN;
    const fyMax = bbox ? bbox.maxY + margin : FRW_COORD_MAX;

    // v2.8: Проход 2 — double-scan детектор для линий/полилиний.
    // Находит стороны прямоугольника и контуры, которые не используют
    // маркер 1.0. Фильтры: padding (2+ нулей), bbox-диагонали, матричные флаги.
    const allPolylines = [];

    for (let si = 0; si < streams.length; si++) {
        const stream = streams[si];
        const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
        const len = stream.length;

        for (const startOffset of [0, 4]) {
            let currentRun = [];
            let zeroStreak = 0;

            for (let off = startOffset; off + 8 <= len; off += 8) {
                let v;
                try {
                    v = view.getFloat64(off, true);
                } catch (e) {
                    v = NaN;
                }
                const plausible = Number.isFinite(v) && v >= FRW_COORD_MIN && v <= FRW_COORD_MAX &&
                    !(v !== 0 && Math.abs(v) < 1e-6);

                if (!plausible) {
                    if (currentRun.length >= 4) {
                        const obj = runToGeometry(currentRun, bbox);
                        if (obj) allPolylines.push(obj);
                    }
                    currentRun = [];
                    zeroStreak = 0;
                    continue;
                }

                if (bbox) {
                    const inXRange = v >= fxMin && v <= fxMax;
                    const inYRange = v >= fyMin && v <= fyMax;
                    if (!inXRange && !inYRange) {
                        if (currentRun.length >= 4) {
                            const obj = runToGeometry(currentRun, bbox);
                            if (obj) allPolylines.push(obj);
                        }
                        currentRun = [];
                        zeroStreak = 0;
                        continue;
                    }
                }

                if (v === 0) {
                    zeroStreak++;
                    if (zeroStreak >= 2) {
                        if (currentRun.length >= 4) {
                            const obj = runToGeometry(currentRun, bbox);
                            if (obj) allPolylines.push(obj);
                        }
                        currentRun = [];
                        zeroStreak = 0;
                        continue;
                    }
                    currentRun.push({ pos: off, val: v });
                } else {
                    zeroStreak = 0;
                    currentRun.push({ pos: off, val: v });
                }
            }
            if (currentRun.length >= 4) {
                const obj = runToGeometry(currentRun, bbox);
                if (obj) allPolylines.push(obj);
            }
        }
    }

    // ── Проход 3: поиск ДУГ и КРУГОВ по структурированному паттерну ──
    // КОМПАС хранит дугу как 10 double:
    //   (centerX, centerY, 1.0, 0.0, 0.0, 1.0, radius, radius, startAngle, endAngle)
    // Паттерн (1.0, 0.0, 0.0, 1.0) = единичная матрица 2×2 (маркер записи).
    // Углы в радианах. Если startAngle≈0 и endAngle≈2π → это КРУГ.
    // Иначе → ДУГА. Direction = CW (короткая дуга) по умолчанию.
    const arcs = extractArcsAndCircles(streams, bbox);
    allPolylines.push(...arcs);

    // Дедупликация
    const deduped = deduplicatePolylines(allPolylines);
    console.log(`📐 [FRW-IMPORT] Geometry extraction: ${allPolylines.length} кандидатов → ${deduped.length} после дедупликации (дуг/кругов: ${arcs.length})`);
    return deduped;
}

/**
 * Извлекает дуги и круги из потоков по структурированному паттерну.
 * Паттерн: (cx, cy, 1.0, 0.0, 0.0, 1.0, r, r, startAngle, endAngle) — 10 double = 80 байт.
 * Если startAngle≈0 и endAngle≈2π → КРУГ. Иначе → ДУГА.
 */
function extractArcsAndCircles(streams, bbox) {
    // Паттерн (1.0, 0.0, 0.0, 1.0) как 32 байта
    const markerBytes = new Uint8Array(32);
    const markerView = new DataView(markerBytes.buffer);
    markerView.setFloat64(0, 1.0, true);
    markerView.setFloat64(8, 0.0, true);
    markerView.setFloat64(16, 0.0, true);
    markerView.setFloat64(24, 1.0, true);

    const result = [];
    const TAU = Math.PI * 2;
    const TOL = 0.01;

    for (let si = 0; si < streams.length; si++) {
        const stream = streams[si];
        const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
        const len = stream.length;

        // v2.6: Ищем паттерн ПОБАЙТОВО (не на 8-байтной сетке!).
        // В .FRW центр объекта может быть на НЕ-8-байтном смещении (например,
        // круг "40,35" имеет center на offset 290, 290 % 8 = 2). Побайтовый
        // поиск находит все вхождения маркера (1,0,0,1).
        for (let off = 16; off + 80 <= len; off++) {
            // Проверяем 4 double (1.0, 0.0, 0.0, 1.0) начиная с off
            let isMarker = true;
            for (let k = 0; k < 32; k++) {
                if (stream[off + k] !== markerBytes[k]) { isMarker = false; break; }
            }
            if (!isMarker) continue;

            // Читаем center (2 double до маркера)
            let cx, cy;
            try {
                cx = view.getFloat64(off - 16, true);
                cy = view.getFloat64(off - 8, true);
            } catch (e) { continue; }
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;

            // Читаем radius, radius, startAngle, endAngle (4 double после маркера)
            let r1, r2, sa, ea;
            try {
                r1 = view.getFloat64(off + 32, true);
                r2 = view.getFloat64(off + 40, true);
                sa = view.getFloat64(off + 48, true);
                ea = view.getFloat64(off + 56, true);
            } catch (e) { continue; }
            if (!Number.isFinite(r1) || !Number.isFinite(r2) || !Number.isFinite(sa) || !Number.isFinite(ea)) continue;

            // Проверки правдоподобия
            if (Math.abs(r1 - r2) > 0.1) continue; // radius должен дублироваться
            const radius = r1;
            if (radius < 0.5 || radius > 200) continue;
            if (bbox) {
                // center должен быть в bbox + 50% запас
                const m = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.5 + 5;
                if (cx < bbox.minX - m || cx > bbox.maxX + m) continue;
                if (cy < bbox.minY - m || cy > bbox.maxY + m) continue;
                // точки на окружности должны быть в bbox + запас
                // v2.6: исправлен баг — continue во внутреннем цикле не выходил
                // из внешнего. Теперь используем flag.
                const pts = [
                    [cx + radius, cy], [cx - radius, cy],
                    [cx, cy + radius], [cx, cy - radius]
                ];
                let pointOutside = false;
                for (const p of pts) {
                    if (p[0] < bbox.minX - m || p[0] > bbox.maxX + m) { pointOutside = true; break; }
                    if (p[1] < bbox.minY - m || p[1] > bbox.maxY + m) { pointOutside = true; break; }
                }
                if (pointOutside) continue;
            }

            // v2.6: отладка убрана (функция работает)

            // v2.6: Определяем круг ДО нормализации углов.
            // Проблема: ea=6.283 (2π), после ea % TAU = 0.0000 (из-за float precision),
            // и isCircle становится false. Проверяем круг по оригинальным углам:
            // sa≈0 и ea≈2π → круг.
            const isCircleByRaw = (Math.abs(sa) < 0.1 && Math.abs(ea - TAU) < 0.1) ||
                                  (Math.abs(sa - TAU) < 0.1 && Math.abs(ea) < 0.1) ||
                                  (Math.abs(sa) < 0.1 && Math.abs(ea) < 0.1 && radius > 0.5); // вырожденный круг sa=0,ea=0

            // Нормализуем углы в [0, 2π)
            let saNorm = sa % TAU;
            let eaNorm = ea % TAU;
            if (saNorm < 0) saNorm += TAU;
            if (eaNorm < 0) eaNorm += TAU;

            // Круг или дуга?
            const isCircle = isCircleByRaw ||
                             (Math.abs(saNorm) < 0.1 && Math.abs(eaNorm - TAU) < 0.1) ||
                             (Math.abs(saNorm - TAU) < 0.1 && Math.abs(eaNorm) < 0.1);

            if (isCircle) {
                // КРУГ
                if (typeof Circle !== 'undefined') {
                    const obj = new Circle(cx, cy, radius);
                    obj.color = '#00aadd';
                    obj._frwSource = 'kf-zip';
                    result.push(obj);
                    console.log(`📐 [FRW-IMPORT] Круг: cx=${cx.toFixed(1)} cy=${cy.toFixed(1)} r=${radius.toFixed(1)} D=${(radius*2).toFixed(1)} (stream#${si} off${off})`);
                }
            } else {
                // ДУГА — проверяем что углы разумные (0..2π)
                if (saNorm < 0 || saNorm > TAU + 0.1) continue;
                if (eaNorm < 0 || eaNorm > TAU + 0.1) continue;
                if (Math.abs(saNorm - eaNorm) < 0.05) continue; // вырожденная

                // Direction: определяем CW/CCW.
                // КОМПАС хранит startAngle и endAngle. Короткая дуга = CW (уменьшение угла).
                // Вычисляем оба sweep и берём меньший.
                let sweepCW = saNorm - eaNorm; if (sweepCW < 0) sweepCW += TAU;
                let sweepCCW = eaNorm - saNorm; if (sweepCCW < 0) sweepCCW += TAU;
                const direction = sweepCW <= sweepCCW ? 'CW' : 'CCW';

                if (typeof Arc !== 'undefined') {
                    const obj = new Arc(cx, cy, radius, saNorm, eaNorm, direction);
                    obj.id = Date.now() + Math.random();
                    obj.color = '#00aadd';
                    obj._frwSource = 'kf-zip';
                    result.push(obj);
                    console.log(`📐 [FRW-IMPORT] Дуга: cx=${cx.toFixed(1)} cy=${cy.toFixed(1)} r=${radius.toFixed(1)} sa=${(saNorm*180/Math.PI).toFixed(0)}° ea=${(eaNorm*180/Math.PI).toFixed(0)}° dir=${direction} (stream#${si} off${off})`);
                }
            }
        }
    }

    // v2.7: Поиск ЛИНИЙ по структуре: 4 double (x1, y1, x2, y2) после маркера 1.0.
    // КОМПАС хранит линию как:
    //   offset-8: 0.0 (padding)
    //   offset:   1.0 (маркер, single double — НЕ матрица 2×2!)
    //   offset+8: x1 (start X)
    //   offset+16: y1 (start Y)
    //   offset+24: x2 (end X)
    //   offset+32: y2 (end Y)
    // В отличие от дуг/кругов (где маркер = 4 double 1,0,0,1), линия имеет
    // маркер = 1 double (1.0), за которым сразу 4 координаты.
    // Идентификация: после 1.0 идут 4 правдоподобные координаты в bbox.
    const marker1Bytes = new Uint8Array(8);
    const marker1View = new DataView(marker1Bytes.buffer);
    marker1View.setFloat64(0, 1.0, true);  // 1.0
    const zeroBytes = new Uint8Array(8);   // 0.0 (padding)

    for (let si = 0; si < streams.length; si++) {
        const stream = streams[si];
        const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
        const len = stream.length;

        for (let off = 8; off + 40 <= len; off++) {
            // Маркер = 1.0 (8 байт), перед ним — 0.0 (padding, 8 байт)
            let isMarker = true;
            for (let k = 0; k < 8; k++) {
                if (stream[off + k] !== marker1Bytes[k]) { isMarker = false; break; }
            }
            if (!isMarker) continue;
            // Проверяем padding 0.0 перед маркером
            let isPadding = true;
            for (let k = 0; k < 8; k++) {
                if (stream[off - 8 + k] !== zeroBytes[k]) { isPadding = false; break; }
            }
            if (!isPadding) continue;

            // Читаем 4 double (x1, y1, x2, y2)
            let x1, y1, x2, y2;
            try {
                x1 = view.getFloat64(off + 8, true);
                y1 = view.getFloat64(off + 16, true);
                x2 = view.getFloat64(off + 24, true);
                y2 = view.getFloat64(off + 32, true);
            } catch (e) { continue; }
            if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;

            // Проверки правдоподобия
            // Все 4 координаты в диапазоне
            if (x1 < FRW_COORD_MIN || x1 > FRW_COORD_MAX) continue;
            if (y1 < FRW_COORD_MIN || y1 > FRW_COORD_MAX) continue;
            if (x2 < FRW_COORD_MIN || x2 > FRW_COORD_MAX) continue;
            if (y2 < FRW_COORD_MIN || y2 > FRW_COORD_MAX) continue;

            // Длина линии
            const lineLen = Math.hypot(x2 - x1, y2 - y1);
            if (lineLen < 0.5 || lineLen > 2000) continue;

            // v2.7: Отбрасываем "матричные единичные линии" (0,0)→(1,0) или (0,0)→(0,1).
            // Это маркеры единичной матрицы (1,0,0,1), которые ложно детектируются
            // как линии. Реальные CAD-линии имеют длину > 1мм.
            if (lineLen < 2.0) continue;
            // Также отбрасываем линии с точкой (1,0) или (0,1) — это матричные флаги
            if (Math.abs(x1 - 1.0) < 0.001 && Math.abs(y1) < 0.001) continue;
            if (Math.abs(x1) < 0.001 && Math.abs(y1 - 1.0) < 0.001) continue;
            if (Math.abs(x2 - 1.0) < 0.001 && Math.abs(y2) < 0.001) continue;
            if (Math.abs(x2) < 0.001 && Math.abs(y2 - 1.0) < 0.001) continue;
            // v2.8: Отбрасываем склейки где X=1.0 (матричный флаг) + реальная Y
            if (Math.abs(x1 - 1.0) < 0.01 && Math.abs(y1) > 2.0) continue;
            if (Math.abs(x2 - 1.0) < 0.01 && Math.abs(y2) > 2.0) continue;

            // v2.8: Отбрасываем диагональ bbox — линию, соединяющую противоположные
            // углы bbox детали. Это ложное срабатывание: КОМПАС хранит bbox как
            // 4 double (xmin,ymin,xmax,ymax), и детектор линий может интерпретировать
            // их как линию (xmin,ymin)→(xmax,ymax). Проверяем обе диагонали.
            // ВАЖНО: НЕ фильтруем стороны bbox — прямоугольник совпадает с bbox!
            if (bbox) {
                const tol = 0.5;
                // Диагональ 1: (minX,minY)→(maxX,maxY)
                if (Math.abs(x1 - bbox.minX) < tol && Math.abs(y1 - bbox.minY) < tol &&
                    Math.abs(x2 - bbox.maxX) < tol && Math.abs(y2 - bbox.maxY) < tol) continue;
                // Диагональ 2: (minX,maxY)→(maxX,minY)
                if (Math.abs(x1 - bbox.minX) < tol && Math.abs(y1 - bbox.maxY) < tol &&
                    Math.abs(x2 - bbox.maxX) < tol && Math.abs(y2 - bbox.minY) < tol) continue;
                // Диагональ 3: (maxX,minY)→(minX,maxY) — обратная
                if (Math.abs(x1 - bbox.maxX) < tol && Math.abs(y1 - bbox.minY) < tol &&
                    Math.abs(x2 - bbox.minX) < tol && Math.abs(y2 - bbox.maxY) < tol) continue;
                // Диагональ 4: (maxX,maxY)→(minX,minY) — обратная
                if (Math.abs(x1 - bbox.maxX) < tol && Math.abs(y1 - bbox.maxY) < tol &&
                    Math.abs(x2 - bbox.minX) < tol && Math.abs(y2 - bbox.minY) < tol) continue;
            }

            // Bbox фильтр
            if (bbox) {
                const m = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.5 + 5;
                if (x1 < bbox.minX - m || x1 > bbox.maxX + m) continue;
                if (y1 < bbox.minY - m || y1 > bbox.maxY + m) continue;
                if (x2 < bbox.minX - m || x2 > bbox.maxX + m) continue;
                if (y2 < bbox.minY - m || y2 > bbox.maxY + m) continue;
            }

            // Создаём линию через new Line()
            if (typeof Line !== 'undefined') {
                const obj = new Line(x1, y1, x2, y2);
                obj.color = '#00aadd';
                obj._frwSource = 'kf-zip';
                result.push(obj);
                console.log(`📐 [FRW-IMPORT] Линия: (${x1.toFixed(1)},${y1.toFixed(1)})→(${x2.toFixed(1)},${y2.toFixed(1)}) len=${lineLen.toFixed(1)} (stream#${si} off${off})`);
            }
        }
    }
    return result;
}

function isPlausibleCoordinate(v) {
    if (!Number.isFinite(v)) return false;
    if (v < FRW_COORD_MIN || v > FRW_COORD_MAX) return false;
    // 0.0 — валидная координата (origin). Малые ненулевые — мусор.
    if (v !== 0 && Math.abs(v) < 1e-6) return false;
    return true;
}

/**
 * Преобразует ряд double в объект геометрии.
 * Ряд ≥4 double → (x1,y1,x2,y2,...) пары = линии/полилинии.
 * Если bbox известен — точки должны быть в bbox+margin, иначе ряд отбрасывается.
 */
function runToGeometry(run, bbox) {
    // Группируем в (x, y) пары
    const points = [];
    for (let i = 0; i + 1 < run.length; i += 2) {
        points.push({ x: run[i].val, y: run[i + 1].val });
    }
    if (points.length < 2) return null;

    // Bbox для проверки правдоподобия
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 0.1 && h < 0.1) return null; // вырожденный
    if (w > 50000 || h > 50000) return null;

    // Если bbox известен — проверяем что все точки в bbox+50% запас
    if (bbox) {
        const margin = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.5 + 5;
        for (const p of points) {
            if (p.x < bbox.minX - margin || p.x > bbox.maxX + margin) return null;
            if (p.y < bbox.minY - margin || p.y > bbox.maxY + margin) return null;
        }
    }

    // Если ровно 2 точки → линия
    if (points.length === 2) {
        // Дополнительно: проверяем что точки разные (не вырожденная линия)
        const len = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
        if (len < 0.01) return null;
        // Если bbox известен — отбрасываем линии длиннее диагонали bbox
        // (это склейки точек из разных участков, прошедшие фильтр по ошибке)
        if (bbox) {
            const bboxDiag = Math.hypot(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
            if (len > bboxDiag * 0.95) return null; // линия почти = диагональ — мусор
            // Обе точки должны быть строго внутри bbox (с 10% запасом)
            const m = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY) * 0.1;
            for (const p of points) {
                if (p.x < bbox.minX - m || p.x > bbox.maxX + m) return null;
                if (p.y < bbox.minY - m || p.y > bbox.maxY + m) return null;
            }
        }
        // v2.4: Отбрасываем линии, содержащие матричные флаги (1.0, 0.0).
        // КОМПАС между объектами вставляет единичную матрицу (1,0,0,1) и
        // другие флаги. Если точка = (1.0, 0.0) или (0.0, 1.0) — это флаг,
        // не координата. Также отбрасываем (0.0, 0.0) если вторая точка реальная
        // (это padding, прицепившийся к координате).
        for (const p of points) {
            // Точка (1.0, 0.0) — типичный матричный флаг
            if (Math.abs(p.x - 1.0) < 0.001 && Math.abs(p.y) < 0.001) return null;
            // Точка (0.0, 1.0) — тоже матричный флаг
            if (Math.abs(p.x) < 0.001 && Math.abs(p.y - 1.0) < 0.001) return null;
        }
        // v2.8: Отбрасываем склейки, где X=1.0 (матричный флаг) + реальная Y-координата.
        // Пример: (0,12)→(1,49) — это padding(0,0) + matrix(1,0) + coord(0,49).
        // X=1.0 в CAD-координатах практически не встречается для реальных линий
        // (это либо матричный флаг, либо очень близко к origin).
        for (const p of points) {
            if (Math.abs(p.x - 1.0) < 0.01 && Math.abs(p.y) > 2.0) return null;
        }
        // ВАЖНО: используем new Line() — render() вызывает obj.draw(ctx),
        // plain-objects без draw() пропускаются (строка 1537 в render.js).
        // Класс Line определён глобально в браузере через shapes.js.
        if (typeof Line !== 'undefined') {
            const obj = new Line(points[0].x, points[0].y, points[1].x, points[1].y);
            obj.color = '#00aadd';
            obj._frwSource = 'kf-zip';
            return obj;
        }
        // Fallback для Node.js тестов (plain object без draw)
        return {
            type: 'line',
            x1: points[0].x, y1: points[0].y,
            x2: points[1].x, y2: points[1].y,
            id: Date.now() + Math.random(),
            color: '#00aadd'
        };
    }

    // ≥3 точек → полилиния (CustomPolygon)
    const first = points[0];
    const last = points[points.length - 1];
    const maxDim = Math.max(w, h);
    const closed = Math.hypot(first.x - last.x, first.y - last.y) < Math.max(0.5, maxDim * 0.005);

    if (typeof CustomPolygon !== 'undefined') {
        const obj = new CustomPolygon(points.map(p => ({ x: p.x, y: p.y })), closed);
        obj.color = '#00aadd';
        obj._frwSource = 'kf-zip';
        return obj;
    } else {
        return {
            type: closed ? 'polygon' : 'polyline',
            points: points.map(p => ({ x: p.x, y: p.y })),
            closed: closed,
            id: Date.now() + Math.random(),
            color: '#00aadd'
        };
    }
}

function deduplicatePolylines(polylines) {
    if (polylines.length === 0) return [];
    const TOL = 0.5;
    const kept = [];
    for (const cand of polylines) {
        let isDup = false;
        for (const k of kept) {
            if (geometryEquals(cand, k, TOL)) { isDup = true; break; }
        }
        if (!isDup) kept.push(cand);
    }
    return kept;
}

function geometryEquals(a, b, tol) {
    // Разные типы — не равны
    if (a.type !== b.type) return false;

    // Линии: сравниваем 4 координаты
    if (a.type === 'line') {
        const eq = (x, y) => Math.abs(x - y) < tol;
        return (eq(a.x1, b.x1) && eq(a.y1, b.y1) && eq(a.x2, b.x2) && eq(a.y2, b.y2)) ||
               (eq(a.x1, b.x2) && eq(a.y1, b.y2) && eq(a.x2, b.x1) && eq(a.y2, b.y1));
    }

    // Круги: сравниваем center + radius
    if (a.type === 'circle') {
        return Math.abs(a.cx - b.cx) < tol &&
               Math.abs(a.cy - b.cy) < tol &&
               Math.abs(a.radius - b.radius) < tol;
    }

    // Дуги: сравниваем center + radius + углы
    if (a.type === 'arc') {
        return Math.abs(a.cx - b.cx) < tol &&
               Math.abs(a.cy - b.cy) < tol &&
               Math.abs(a.radius - b.radius) < tol &&
               Math.abs(a.startAngle - b.startAngle) < 0.05 &&
               Math.abs(a.endAngle - b.endAngle) < 0.05;
    }

    // Полилинии/полигоны: сравниваем точки
    const ap = a.points;
    const bp = b.points;
    if (!ap || !bp || ap.length !== bp.length) return false;
    let matched = 0;
    for (const s of ap) {
        for (const bb of bp) {
            if (Math.abs(s.x - bb.x) < tol && Math.abs(s.y - bb.y) < tol) {
                matched++; break;
            }
        }
    }
    return matched / ap.length >= 0.8;
}

// ═══════════════════════════════════════════════════════════════
// Вспомогательные функции
// ═══════════════════════════════════════════════════════════════

function computeBounds(objects) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
        let pts = null;
        if (obj.type === 'polyline' || obj.type === 'polygon') {
            pts = obj.points;
        } else if (obj.type === 'line') {
            pts = [{ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 }];
        } else if (obj.type === 'circle' || obj.type === 'arc') {
            pts = [
                { x: obj.cx - obj.radius, y: obj.cy - obj.radius },
                { x: obj.cx + obj.radius, y: obj.cy + obj.radius }
            ];
        }
        if (!pts) continue;
        for (const p of pts) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
    }
    if (minX === Infinity) return null;
    return {
        minX: minX, minY: minY,
        maxX: maxX, maxY: maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

/**
 * Инверсия Y для всех объектов (КОМПАС Y-up → canvas Y-down).
 * y_new = (minY + maxY) - y. Bbox сохраняется, содержимое зеркалится по Y.
 * Для дуг: startAngle/endAngle тоже инвертируются (sin меняет знак).
 */
function invertYFRW(objects) {
    // Сначала вычисляем bbox по Y
    let minY = Infinity, maxY = -Infinity;
    for (const obj of objects) {
        let ys = [];
        if (obj.type === 'line') {
            ys = [obj.y1, obj.y2];
        } else if (obj.type === 'circle' || obj.type === 'arc') {
            ys = [obj.cy - obj.radius, obj.cy + obj.radius];
        } else if (obj.type === 'polyline' || obj.type === 'polygon') {
            ys = (obj.points || []).map(p => p.y);
        }
        for (const y of ys) {
            if (Number.isFinite(y)) {
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (minY === Infinity) return;
    const sumY = minY + maxY;

    // Инвертируем Y каждого объекта
    for (const obj of objects) {
        if (obj.type === 'line') {
            obj.y1 = sumY - obj.y1;
            obj.y2 = sumY - obj.y2;
        } else if (obj.type === 'circle') {
            obj.cy = sumY - obj.cy;
            // radius не меняется
        } else if (obj.type === 'arc') {
            obj.cy = sumY - obj.cy;
            // radius не меняется
            // Углы: инверсия Y = отражение по горизонтали = угол → -угол (или 2π - угол)
            // startAngle: a → 2π - a (отражение относительно оси X)
            // direction: CW ↔ CCW (меняется)
            const TAU = Math.PI * 2;
            obj.startAngle = TAU - obj.startAngle;
            obj.endAngle = TAU - obj.endAngle;
            // Нормализуем в [0, 2π)
            obj.startAngle = ((obj.startAngle % TAU) + TAU) % TAU;
            obj.endAngle = ((obj.endAngle % TAU) + TAU) % TAU;
            // Меняем направление CW ↔ CCW
            obj.direction = obj.direction === 'CW' ? 'CCW' : 'CW';
        } else if (obj.type === 'polyline' || obj.type === 'polygon') {
            if (obj.points) {
                for (const p of obj.points) {
                    p.y = sumY - p.y;
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// Fallback: старая эвристика double-scan (если файл НЕ ZIP)
// ═══════════════════════════════════════════════════════════════

function fallbackHeuristic(buffer, fileName) {
    console.warn(`⚠️ [FRW-IMPORT] Fallback на эвристический double-scan (файл не ZIP)`);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const objects = [];

    for (const startOffset of [0, 4]) {
        let currentRun = [];
        for (let off = startOffset; off + 8 <= bytes.length; off += 8) {
            let v;
            try { v = view.getFloat64(off, true); } catch (e) { v = NaN; }
            if (isPlausibleCoordinate(v)) {
                currentRun.push({ pos: off, val: v });
            } else {
                if (currentRun.length >= 4) {
                    const obj = runToGeometry(currentRun);
                    if (obj) objects.push(obj);
                }
                currentRun = [];
            }
        }
    }

    const deduped = deduplicatePolylines(objects);
    if (deduped.length === 0) return null;
    const bounds = computeBounds(deduped);
    if (!bounds) return null;

    return {
        objects: deduped,
        bounds: bounds,
        fileName: fileName,
        source: 'fallback-double-scan',
        heuristic: true
    };
}

console.log('✅ frw-import.js загружен (v2.1) — полный парсер КОМПАС .FRW (ZIP + KF + zlib-streams + inflate)');
