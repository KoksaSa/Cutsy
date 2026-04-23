// ═══════════════════════════════════════════════════════════════
// SOUND - Звуковые оповещения
// ═══════════════════════════════════════════════════════════════

const Sound = {
    // ═══════════════════════════════════════════════════════════
    // НАСТРОЙКИ
    // ═══════════════════════════════════════════════════════════
    enabled: true,        // Звук всегда включён
    volume: 0.3,          // Громкость (0.0 - 1.0)
    audioContext: null,   // AudioContext для Web Audio API

    // ═══════════════════════════════════════════════════════════
    // ИНИЦИАЛИЗАЦИЯ
    // ═══════════════════════════════════════════════════════════
    init() {
        // Проверяем поддержку Web Audio API
        if (typeof window !== 'undefined') {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioContext = new AudioContext();
            } else {
                console.log('⚠️ Web Audio API не поддерживается');
                this.enabled = false;
            }
        }
    },

    // ═══════════════════════════════════════════════════════════
    // ВОСПРОИЗВЕСТИ ЗВУК (синтезированный)
    // ═══════════════════════════════════════════════════════════
    playTone(frequency, duration, type = 'sine') {
        if (!this.enabled || !this.audioContext) return;

        try {
            // Возобновляем контекст если приостановлен
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            // Создаём осциллятор (генератор звука)
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            // Настройка осциллятора
            oscillator.type = type;  // 'sine', 'square', 'sawtooth', 'triangle'
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);

            // Настройка громкости
            gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

            // Подключение
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            // Воспроизведение
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + duration);

        } catch (error) {
            console.error('❌ Ошибка воспроизведения звука:', error);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // ЗВУК УСПЕХА (завершение раскладки)
    // ═══════════════════════════════════════════════════════════
    playSuccess() {
        if (!this.enabled) return;

        // Инициализируем если нужно
        if (!this.audioContext) {
            this.init();
        }

        // Проигрываем приятный "дзинь" (два тона)
        setTimeout(() => {
            this.playTone(800, 0.15, 'sine');      // Первый тон (800 Гц)
        }, 0);

        setTimeout(() => {
            this.playTone(1200, 0.2, 'sine');      // Второй тон (1200 Гц)
        }, 150);

        console.log('🔊 Звук успеха');
    },

    // ═══════════════════════════════════════════════════════════
    // ЗВУК ОШИБКИ
    // ═══════════════════════════════════════════════════════════
    playError() {
        if (!this.enabled) return;

        if (!this.audioContext) {
            this.init();
        }

        // Низкий неприятный звук
        this.playTone(200, 0.3, 'sawtooth');

        console.log('🔊 Звук ошибки');
    },

    // ═══════════════════════════════════════════════════════════
    // ЗВУК ПРЕДУПРЕЖДЕНИЯ
    // ═══════════════════════════════════════════════════════════
    playWarning() {
        if (!this.enabled) return;

        if (!this.audioContext) {
            this.init();
        }

        // Средний тон
        this.playTone(400, 0.2, 'square');

        console.log('🔊 Звук предупреждения');
    }
};

// ═══════════════════════════════════════════════════════════════
// УДОБНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════

function playSuccessSound() {
    Sound.playSuccess();
}

function playErrorSound() {
    Sound.playError();
}

function playWarningSound() {
    Sound.playWarning();
}

// ═══════════════════════════════════════════════════════════════
// АВТОМАТИЧЕСКАЯ ИНИЦИАЛИЗАЦИЯ
// ═══════════════════════════════════════════════════════════════

// Инициализируем при загрузке страницы
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Sound.init());
    } else {
        Sound.init();
    }
}

// Делаем доступным глобально
if (typeof window !== 'undefined') {
    window.Sound = Sound;
    window.playSuccessSound = playSuccessSound;
    window.playErrorSound = playErrorSound;
    window.playWarningSound = playWarningSound;
}
