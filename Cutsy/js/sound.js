// ═══════════════════════════════════════════════════════════════
// SOUND - Звуковые оповещения v4.44
// ═══════════════════════════════════════════════════════════════
// v4.44 FIX W1+W2:
// • AudioContext создаётся ЛЕНИВО при первом user-gesture (click/keydown)
//   Раньше: init() на DOMContentLoaded → suspended context → resume() fail
// • Oscillator nodes disconnect'ятся после завершения (no memory leak)
// • destroy() метод для очистки при выгрузке
// • try/catch везде — звук не должен ронять CAD
// ═══════════════════════════════════════════════════════════════

const Sound = {
    enabled: true,
    volume: 0.3,
    audioContext: null,
    _initialized: false,  // v4.44: флаг ленивой инициализации

    // v4.44 W2: Ленивая инициализация — вызывается при первом user-gesture
    // Браузеры требуют user-gesture для создания/возобновления AudioContext.
    // Раньше init() на DOMContentLoaded создавал suspended context,
    // и resume() без gesture тихо fail'ил → звук не работал.
    init() {
        if (this._initialized) return;
        if (typeof window === 'undefined') return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioContext = new AudioContext();
                this._initialized = true;
                console.log('[SOUND] AudioContext создан');
            } else {
                console.log('[SOUND] Web Audio API не поддерживается');
                this.enabled = false;
            }
        } catch (e) {
            console.warn('[SOUND] Ошибка init:', e.message);
            this.enabled = false;
        }
    },

    // v4.44 W2: ensureContext — гарантия что контекст жив и активен
    // Вызывается перед каждым playTone. Если контекст suspended — resume().
    _ensureContext() {
        if (!this.audioContext) {
            this.init();
        }
        if (!this.audioContext) return false;
        if (this.audioContext.state === 'suspended') {
            // resume() возвращает Promise — не блокируем
            this.audioContext.resume().catch(() => {});
        }
        if (this.audioContext.state === 'closed') {
            // Контекст закрыт — пересоздаём
            this._initialized = false;
            this.audioContext = null;
            this.init();
        }
        return !!this.audioContext;
    },

    // v4.44 W1: disconnect oscillator после завершения (no memory leak)
    playTone(frequency, duration, type = 'sine') {
        if (!this.enabled) return;
        if (!this._ensureContext()) return;

        try {
            const ctx = this.audioContext;
            const now = ctx.currentTime;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.type = type;
            oscillator.frequency.setValueAtTime(frequency, now);

            gainNode.gain.setValueAtTime(this.volume, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.start(now);
            oscillator.stop(now + duration);

            // v4.44 W1: disconnect после завершения — освобождаем ресурсы
            oscillator.onended = () => {
                try {
                    oscillator.disconnect();
                    gainNode.disconnect();
                } catch (e) { /* уже отключён */ }
            };
        } catch (error) {
            console.warn('[SOUND] Ошибка playTone:', error.message);
        }
    },

    playSuccess() {
        if (!this.enabled) return;
        if (!this._ensureContext()) return;
        // Два приятных тона
        this.playTone(800, 0.15, 'sine');
        setTimeout(() => this.playTone(1200, 0.2, 'sine'), 150);
        console.log('[SOUND] Звук успеха');
    },

    playError() {
        if (!this.enabled) return;
        if (!this._ensureContext()) return;
        this.playTone(200, 0.3, 'sawtooth');
        console.log('[SOUND] Звук ошибки');
    },

    playWarning() {
        if (!this.enabled) return;
        if (!this._ensureContext()) return;
        this.playTone(400, 0.2, 'square');
        console.log('[SOUND] Звук предупреждения');
    },

    // v4.44 W1: destroy — закрыть AudioContext (для cleanup)
    destroy() {
        if (this.audioContext) {
            try {
                this.audioContext.close();
            } catch (e) { /* игнорируем */ }
            this.audioContext = null;
            this._initialized = false;
        }
    }
};

// Удобные функции
function playSuccessSound() { Sound.playSuccess(); }
function playErrorSound() { Sound.playError(); }
function playWarningSound() { Sound.playWarning(); }

// v4.44 W2: Инициализация при ПЕРВОМ user-gesture (не на DOMContentLoaded)
// Браузеры требуют user interaction для AudioContext.
if (typeof window !== 'undefined') {
    const _soundInitOnGesture = () => {
        Sound.init();
        // Удаляем обработчики после первой инициализации
        document.removeEventListener('click', _soundInitOnGesture);
        document.removeEventListener('keydown', _soundInitOnGesture);
    };
    document.addEventListener('click', _soundInitOnGesture, { once: false });
    document.addEventListener('keydown', _soundInitOnGesture, { once: false });

    // Cleanup при выгрузке страницы
    window.addEventListener('beforeunload', () => Sound.destroy());

    window.Sound = Sound;
    window.playSuccessSound = playSuccessSound;
    window.playErrorSound = playErrorSound;
    window.playWarningSound = playWarningSound;
}