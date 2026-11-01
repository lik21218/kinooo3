document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.slide');
    const indicators = document.querySelectorAll('.indicator');
    const prevBtn = document.querySelector('.prev-btn');
    const nextBtn = document.querySelector('.next-btn');
    const soundBtn = document.querySelector('.sound-btn');
    
    let currentIndex = 0;
    let soundEnabled = false;
    let isTransitioning = false;
    let autoSlideTimer = null;
    
    // ⏱️ Насколько раньше конца видео переключать (в миллисекундах).
    // 300 мс — оптимально: успевает отрисоваться следующий, а зритель
    // не замечает обрыва.
    const END_OFFSET_MS = 150;
    
    // ⏱️ Если длительность видео не определена (битый файл, ещё грузится)
    // — страховочный таймер.
    const FALLBACK_DELAY_MS = 5000;
    
    // ---- Подготовка видео ----
    const videos = [];
    slides.forEach((slide) => {
        const video = slide.querySelector('video');
        if (!video) return;
        videos.push(video);
        video.muted = true;
        video.loop = false;      // ⚠️ важно: без loop, чтобы не крутилось по кругу
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', 'true');
        try { video.load(); } catch (e) {}
    });
    
    // ---- Безопасное воспроизведение ----
    function safePlay(video) {
        if (!video) return Promise.resolve();
        if (video.readyState < 2) {
            return new Promise((resolve) => {
                const onReady = () => {
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('loadeddata', onReady);
                    doPlay(video).then(resolve);
                };
                video.addEventListener('canplay', onReady, { once: true });
                video.addEventListener('loadeddata', onReady, { once: true });
                setTimeout(() => {
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('loadeddata', onReady);
                    doPlay(video).then(resolve);
                }, 1000);
            });
        }
        return doPlay(video);
    }
    
    function doPlay(video) {
        const p = video.play();
        if (p && p.catch) {
            return p.catch((err) => {
                if (err && err.name === 'NotAllowedError') {
                    video.muted = true;
                    soundEnabled = false;
                    soundBtn.classList.remove('sound-enabled');
                    return video.play().catch(() => {});
                }
            });
        }
        return Promise.resolve();
    }
    
    // ---- Таймер, привязанный к длительности текущего видео ----
    function scheduleNextSlide() {
        clearTimeout(autoSlideTimer);
        
        const v = videos[currentIndex];
        if (!v) return;
        
        // Если метаданные уже есть — берём duration напрямую
        if (v.duration && isFinite(v.duration) && v.duration > 0) {
            const delay = Math.max(500, v.duration * 1000 - END_OFFSET_MS);
            autoSlideTimer = setTimeout(() => {
                nextSlide();
            }, delay);
            return;
        }
        
        // Иначе ждём loadedmetadata — тогда узнаем duration
        const onMeta = () => {
            v.removeEventListener('loadedmetadata', onMeta);
            if (v.duration && isFinite(v.duration) && v.duration > 0) {
                const delay = Math.max(500, v.duration * 1000 - END_OFFSET_MS);
                autoSlideTimer = setTimeout(() => nextSlide(), delay);
            } else {
                // Совсем не удалось узнать — страховка
                autoSlideTimer = setTimeout(() => nextSlide(), FALLBACK_DELAY_MS);
            }
        };
        v.addEventListener('loadedmetadata', onMeta, { once: true });
        
        // Страховка на случай, если loadedmetadata уже прошёл раньше
        if (v.readyState >= 1) {
            v.removeEventListener('loadedmetadata', onMeta);
            if (v.duration && isFinite(v.duration) && v.duration > 0) {
                const delay = Math.max(500, v.duration * 1000 - END_OFFSET_MS);
                autoSlideTimer = setTimeout(() => nextSlide(), delay);
            }
        }
    }
    
    // ---- Переключение слайда ----
    function goToSlide(index) {
        if (isTransitioning) return;
        isTransitioning = true;
        
        const newIndex = (index + slides.length) % slides.length;
        if (newIndex === currentIndex) {
            isTransitioning = false;
            return;
        }
        
        // Останавливаем все видео, кроме нового
        videos.forEach((v, i) => {
            if (i !== newIndex) {
                try { v.pause(); } catch (e) {}
            }
        });
        
        slides.forEach(s => s.classList.remove('active'));
        indicators.forEach(ind => ind.classList.remove('active'));
        
        currentIndex = newIndex;
        slides[currentIndex].classList.add('active');
        indicators[currentIndex].classList.add('active');
        
        const currentVideo = videos[currentIndex];
        try { currentVideo.currentTime = 0; } catch (e) {}
        currentVideo.muted = !soundEnabled;
        
        safePlay(currentVideo).then(() => {
            requestAnimationFrame(() => {
                isTransitioning = false;
            });
        });
        
        // Планируем следующее переключение с учётом длительности ЭТОГО видео
        scheduleNextSlide();
    }
    
    function nextSlide() { goToSlide(currentIndex + 1); }
    function prevSlide() { goToSlide(currentIndex - 1); }
    
    // ---- Подстраховка: если таймер промахнулся, ловим конец по timeupdate ----
    videos.forEach((video, i) => {
        video.addEventListener('timeupdate', () => {
            if (i !== currentIndex) return;
            if (video.duration && video.currentTime >= video.duration - 0.05) {
                nextSlide();
            }
        });
        // Резерв: если видео всё-таки дошло до ended (не должно при loop=false + timeupdate)
        video.addEventListener('ended', () => {
            if (i === currentIndex) nextSlide();
        });
    });
    
    // ---- Кнопки ----
    nextBtn.addEventListener('click', nextSlide);
    prevBtn.addEventListener('click', prevSlide);
    
    indicators.forEach(indicator => {
        indicator.addEventListener('click', () => {
            const index = parseInt(indicator.dataset.index, 10);
            goToSlide(index);
        });
    });
    
    // ---- Звук ----
    soundBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundBtn.classList.toggle('sound-enabled', soundEnabled);
        const currentVideo = videos[currentIndex];
        currentVideo.muted = !soundEnabled;
        if (!currentVideo.muted) safePlay(currentVideo);
    });
    
    // ---- Клавиатура ----
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
    });
    
    // ---- Свайпы ----
    let touchStartX = 0;
    const slider = document.querySelector('.slider-container');
    slider.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    slider.addEventListener('touchend', (e) => {
        const diff = touchStartX - e.changedTouches[0].screenX;
        if (Math.abs(diff) > 50) {
            if (diff > 0) nextSlide();
            else prevSlide();
        }
    }, { passive: true });
    
    // ---- Включение звука при первом взаимодействии ----
    let userInteracted = false;
    const enableSoundOnInteraction = () => {
        if (userInteracted) return;
        userInteracted = true;
        if (!soundEnabled) {
            soundEnabled = true;
            soundBtn.classList.add('sound-enabled');
            const v = videos[currentIndex];
            if (v) { v.muted = false; safePlay(v); }
        }
    };
    document.addEventListener('click', enableSoundOnInteraction, { once: true });
    document.addEventListener('touchstart', enableSoundOnInteraction, { once: true });
    
    // ---- Пауза при скрытии вкладки ----
    document.addEventListener('visibilitychange', () => {
        const v = videos[currentIndex];
        if (document.hidden) {
            clearTimeout(autoSlideTimer);
            if (v) v.pause();
        } else {
            if (v) safePlay(v);
            scheduleNextSlide();
        }
    });
    
    // ---- Старт ----
    const first = videos[0];
    if (first) {
        first.currentTime = 0;
        first.muted = true;
        safePlay(first).then(() => {
            first.muted = false;
            const p = first.play();
            if (p && p.catch) {
                p.then(() => {
                    soundEnabled = true;
                    soundBtn.classList.add('sound-enabled');
                }).catch(() => {
                    first.muted = true;
                    soundEnabled = false;
                });
            }
        });
        scheduleNextSlide();
    }
});