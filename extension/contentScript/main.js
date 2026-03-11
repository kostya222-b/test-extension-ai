// =====================================================================
// === ИНИЦИАЛИЗАЦИЯ ГЛОБАЛЬНЫХ ПЕРЕМЕННЫХ ===
// =====================================================================
console.log('🔧 contentScript/main.js загружен');
if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: "log", args: ["✅ Контент-скрипт инициализирован"] }).catch(() => {});
}

if (typeof window.isModalVisible === 'undefined') window.isModalVisible = false;
if (typeof window.abortController === 'undefined') window.abortController = new AbortController();
if (typeof window.fetchPromise === 'undefined') window.fetchPromise = null;
if (typeof window.isExecuting === 'undefined') window.isExecuting = false;
if (typeof window.isStopped === 'undefined') window.isStopped = false;
if (typeof window.currentMode === 'undefined') window.currentMode = 'auto_ai';
if (typeof window.delayMin === 'undefined') window.delayMin = 3;
if (typeof window.delayMax === 'undefined') window.delayMax = 9;
if (typeof window.nextDelayMin === 'undefined') window.nextDelayMin = 2;
if (typeof window.nextDelayMax === 'undefined') window.nextDelayMax = 5;
if (typeof window.timeoutIds === 'undefined') window.timeoutIds = [];
if (typeof window.isAIButtonLocked === 'undefined') window.isAIButtonLocked = false;
if (typeof window.emptyResponsesCount === 'undefined') window.emptyResponsesCount = 0;
if (typeof window.questionObserver === 'undefined') window.questionObserver = null;
if (typeof window.currentTotalDelay === 'undefined') window.currentTotalDelay = 0;
if (typeof window.db === 'undefined') window.db = null;
if (typeof window.isReturningToLearning === 'undefined') window.isReturningToLearning = false;
if (typeof window.globalObserver === 'undefined') window.globalObserver = null;
if (typeof window.isLocked === 'undefined') window.isLocked = false;
if (typeof window.checkResultsInterval === 'undefined') window.checkResultsInterval = null;
if (typeof window.isFinishingTest === 'undefined') window.isFinishingTest = false;
if (typeof window.targetGrade === 'undefined') window.targetGrade = 5;
if (typeof window.isNavigatingToTest === 'undefined') window.isNavigatingToTest = false;
if (typeof window.shouldCheckResults === 'undefined') window.shouldCheckResults = false;
if (typeof window.maxReloadAttempts === 'undefined') window.maxReloadAttempts = 3;
if (typeof window.currentReloadCount === 'undefined') window.currentReloadCount = 0;
if (typeof window.lastErrorTime === 'undefined') window.lastErrorTime = 0;
if (typeof window.errorDetected === 'undefined') window.errorDetected = false;

// =====================================================================
// === ФУНКЦИЯ ОТПРАВКИ ЛОГОВ ===
// =====================================================================
window.sendLogToBackground = function(...args) {
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: "log", args: args }).catch(() => {});
    }
};

// =====================================================================
// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
// =====================================================================
async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomCoordinates(element) {
    const box = element.getBoundingClientRect();
    return {
        x: Math.floor(Math.random() * (box.right - box.left) + box.left),
        y: Math.floor(Math.random() * (box.bottom - box.top) + box.top)
    };
}

// =====================================================================
// === КЛАСС: НАБЛЮДАТЕЛЬ DOM ===
// =====================================================================
class GlobalSelectorMutationObserver {
    constructor() {
        this.observer = new MutationObserver(this.handleMutations.bind(this));
        this.config = { attributes: true, childList: true, subtree: true };
        this.selectors = new Map();
        this.observer.observe(document.documentElement, this.config);
    }

    waitFor(selector, options) {
        return new Promise((resolve, reject) => {
            if (!options) options = { add: true };
            const result = this.checkForResolve(null, selector, options);
            if (result) { resolve(result); return; }

            const timerTimeoutId = setTimeout(() => {
                reject('timeout');
            }, options.timeout || 30000);

            if (!this.selectors.has(selector)) this.selectors.set(selector, []);
            this.selectors.get(selector).push({ resolve, reject, options, timerTimeoutId });
        });
    }

    handleMutations(mutations) {
        this.selectors.forEach((resolvers, selector) => {
            let shouldDelete = false;
            resolvers.forEach(({ resolve, reject, options, timerTimeoutId }) => {
                const result = this.checkForResolve(mutations, selector, options);
                if (result) {
                    shouldDelete = true;
                    clearTimeout(timerTimeoutId);
                    resolve(result);
                }
            });
            if (shouldDelete) this.selectors.delete(selector);
        });
    }

    checkForResolve(mutations, selector, options) {
        if (options.removeOnce) {
            if (!mutations) return;
            for (const mutation of mutations) {
                for (const el of mutation.removedNodes) {
                    if (el?.matches?.(selector) || el?.querySelector?.(selector)) return el;
                }
            }
        } else if (options.change) {
            if (!mutations) return;
            for (const mutation of mutations) {
                const element = mutation?.target?.matches?.(selector) || mutation?.target?.closest?.(selector) || mutation?.target?.querySelector?.(selector);
                if (element) return element;
            }
        } else {
            const element = document.querySelector(selector);
            if (options.add) { if (element) return element; }
            else if (options.remove) { if (!element) return true; }
            else if (options.text) {
                const textContent = element?.textContent?.trim();
                if (textContent && (!options.reverse ? textContent.includes(options.text) : !textContent.includes(options.text))) return element;
            } else { throw Error('Не верно передан options'); }
        }
        return null;
    }

    rejectAllWait(reason) {
        this.selectors.forEach((resolvers) => {
            resolvers.forEach(({ resolve, reject, options, timerTimeoutId }) => {
                clearTimeout(timerTimeoutId);
                options.dontReject ? resolve() : reject(reason);
            });
        });
    }

    disconnect() { this.observer.disconnect(); this.selectors.clear(); }
}

// =====================================================================
// === ЭМУЛЯЦИЯ КЛИКОВ ===
// =====================================================================
async function simulateClick(element) {
    if (!element) return;
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(300);
    const coords = getRandomCoordinates(element);
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window, clientX: coords.x, clientY: coords.y }));
    await wait(Math.random() * 300 + 100);
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, clientX: coords.x, clientY: coords.y, buttons: 1 }));
    await wait(Math.random() * 150 + 50);
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, clientX: coords.x, clientY: coords.y, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: coords.x, clientY: coords.y, buttons: 0 }));
}

// =====================================================================
// === БАЗА ДАННЫХ (С ПРОВЕРКОЙ ДУБЛЕЙ) ===
// =====================================================================
window.initDatabase = async function() {
    if (window.db) return window.db;
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open('TestAnswersDB', 4);
            request.onupgradeneeded = function(event) {
                const db = event.target.result;
                if (db.objectStoreNames.contains('questions')) db.deleteObjectStore('questions');
                const store = db.createObjectStore('questions', { keyPath: 'id', autoIncrement: true });
                store.createIndex('questionHash', 'questionHash', { unique: false });
            };
            request.onsuccess = function(event) {
                window.db = event.target.result;
                window.sendLogToBackground("✅ База данных инициализирована");
                resolve(window.db);
            };
            request.onerror = function(event) {
                window.sendLogToBackground("❌ Ошибка при инициализации базы данных:", event.target.error);
                reject(event.target.error);
            };
        } catch (e) {
            window.sendLogToBackground("❌ IndexedDB не поддерживается:", e);
            reject(e);
        }
    });
};

window.getQuestionHash = function(question) {
    let hash = 0;
    if (question.length === 0) return hash;
    for (let i = 0; i < question.length; i++) {
        const char = question.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
};

window.normalizeText = function(text) {
    return text?.toLowerCase().trim().replace(/\s+/g, ' ') || '';
};

// ✅ СОХРАНЕНИЕ: Supabase + локальный кэш (ТОЛЬКО auto_ai)
window.saveQuestionToDB = async function(question, selectedAnswers, isCorrect = null) {
    if (isCorrect === true && (!selectedAnswers || !Array.isArray(selectedAnswers) || selectedAnswers.length === 0)) {
        window.sendLogToBackground("⚠️ Пропущено сохранение: верный ответ без вариантов");
        return;
    }

    if (window.currentMode === 'auto_ai') {
        await window.saveAnswerToSupabase(question, selectedAnswers, isCorrect);
    } else {
        window.sendLogToBackground(`ℹ️ Пропуск сохранения в Supabase (режим: ${window.currentMode})`);
    }

    try {
        const db = await window.initDatabase();
        const transaction = db.transaction(['questions'], 'readwrite');
        const store = transaction.objectStore('questions');
        const questionHash = window.getQuestionHash(question);
        const allRecordsRequest = store.getAll();

        return new Promise((resolve) => {
            allRecordsRequest.onsuccess = () => {
                const allRecords = allRecordsRequest.result;
                const normalizedNewAnswers = (selectedAnswers || []).map(a => window.normalizeText(a)).sort();

                const duplicate = allRecords.find(record => {
                    if (record.questionHash !== questionHash) return false;
                    if (!record.selectedAnswers || !Array.isArray(record.selectedAnswers)) return false;
                    const normalizedRecordAnswers = record.selectedAnswers.map(a => window.normalizeText(a)).sort();
                    if (normalizedRecordAnswers.length !== normalizedNewAnswers.length) return false;
                    return normalizedRecordAnswers.every((val, index) => val === normalizedNewAnswers[index]);
                });

                if (duplicate) {
                    if (isCorrect !== null && duplicate.isCorrect === null) {
                        duplicate.isCorrect = isCorrect;
                        store.put(duplicate);
                    }
                    resolve();
                    return;
                }

                const questionData = {
                    questionHash,
                    question,
                    selectedAnswers,
                    isCorrect,
                    timestamp: new Date().toISOString()
                };
                store.add(questionData);
                resolve();
            };
            allRecordsRequest.onerror = () => resolve();
        });
    } catch (e) {
        window.sendLogToBackground("⚠️ Ошибка локального сохранения:", e);
    }
};

// ✅ ПОИСК: Supabase → локальный кэш
window.findQuestionInDB = async function(question) {
    // 1. Сначала пробуем Supabase
    try {
        const supabaseResult = await window.fetchAnswersFromServer(question);
        // ✅ ПРОВЕРЯЕМ ЧТО ЭТО ОБЪЕКТ С answers, id, is_correct
        if (supabaseResult && supabaseResult.answers && Array.isArray(supabaseResult.answers) && supabaseResult.answers.length > 0) {
            return [{
                questionHash: window.getQuestionHash(question),
                question,
                selectedAnswers: supabaseResult.answers,
                isCorrect: supabaseResult.is_correct,
                id: supabaseResult.id,  // ✅ СОХРАНЯЕМ ID!
                timestamp: new Date().toISOString(),
                source: 'supabase'
            }];
        }
    } catch (e) {
        window.sendLogToBackground("⚠️ Supabase недоступен, используем локальную БД");
    }
    
    // 2. Если Supabase не ответил — локальная база
    try {
        const db = await window.initDatabase();
        return new Promise((resolve) => {
            const transaction = db.transaction(['questions'], 'readonly');
            const store = transaction.objectStore('questions');
            const request = store.getAll();
            request.onsuccess = (event) => {
                const allRecords = event.target.result;
                const questionHash = window.getQuestionHash(question);
                const filteredRecords = allRecords.filter(record => record.questionHash === questionHash);
                resolve(filteredRecords || []);
            };
            request.onerror = () => resolve([]);
        });
    } catch (error) {
        return [];
    }
};

window.exportDatabase = async function() {
    try {
        const db = await window.initDatabase();
        const transaction = db.transaction(['questions'], 'readonly');
        const store = transaction.objectStore('questions');
        const request = store.getAll();
        request.onsuccess = () => {
            const data = request.result;
            const csvContent = ["id,questionHash,question,selectedAnswers,isCorrect,timestamp"];
            data.forEach(item => {
                const escapedQuestion = item.question.replace(/"/g, '""');
                const escapedAnswers = Array.isArray(item.selectedAnswers) ?
                    item.selectedAnswers.join(';').replace(/"/g, '""') :
                    String(item.selectedAnswers).replace(/"/g, '""');
                csvContent.push(`"${item.id}","${item.questionHash}","${escapedQuestion}","${escapedAnswers}",${item.isCorrect !== null ? item.isCorrect : ''},"${item.timestamp}"`);
            });
            chrome.runtime.sendMessage({ action: "downloadDB", csvData: csvContent.join('\n') });
            window.sendLogToBackground(`📤 Подготовлено ${data.length} записей`);
        };
    } catch (error) {
        window.sendLogToBackground("❌ Ошибка экспорта БД:", error);
    }
};

// =====================================================================
// === УМНАЯ НАВИГАЦИЯ ===
// =====================================================================
window.detectPageType = function() {
    if (document.querySelector('.questionList') || document.querySelector('lib-quiz-page .questionList')) {
        return 'results';
    }
    if (document.querySelector(window.selectors.questionTitle) && document.querySelector('.quiz-buttons-primary')) {
        return 'test';
    }
    if (document.querySelector('.c-table-clickable-cell') || document.querySelector('.v-table-cell-content:first-child')) {
        return 'variants';
    }
    if (document.querySelector('.v-button-caption')?.textContent?.includes('Скачать сертификат')) {
        return 'certificate';
    }
    if (document.querySelector('.v-button-caption')?.textContent?.includes('Вернуться к обучению')) {
        return 'return';
    }
    return 'unknown';
};

// =====================================================================
// === ОБНАРУЖЕНИЕ ОШИБОК НА СТРАНИЦЕ ===
// =====================================================================
window.detectPageError = function() {
    const errorPatterns = [
        /500\s*(Internal\sServer\sError)/i,
        /502\s*(Bad\sGateway)/i,
        /503\s*(Service\sUnavailable)/i,
        /504\s*(Gateway\sTimeout)/i,
        /404\s*(Not\sFound)/i,
        /Ошибка\sсервера/i,
        /Server\sError/i,
        /Service\sUnavailable/i,
        /Технические\sработы/i,
        /Временная\sнедоступность/i
    ];
    const pageText = document.body?.innerText || '';

    for (const pattern of errorPatterns) {
        if (pattern.test(pageText)) {
            return true;
        }
    }

    const hasQuestion = document.querySelector(window.selectors.questionTitle);
    const hasButtons = document.querySelector('.quiz-buttons-primary');
    const hasVariants = document.querySelector('.c-table-clickable-cell');
    const hasResults = document.querySelector('.questionList');

    if (!hasQuestion && !hasButtons && !hasVariants && !hasResults) {
        const url = window.location.href;
        if (url.includes('test') || url.includes('quiz') || url.includes('variant')) {
            return true;
        }
    }

    return false;
};

// =====================================================================
// === АВТО-ПЕРЕЗАГРУЗКА ПРИ ОШИБКАХ ===
// =====================================================================
window.handlePageError = async function() {
    if (window.currentMode !== 'auto_ai') {
        window.sendLogToBackground("❌ Авто-перезагрузка только для режима auto_ai");
        return false;
    }
    if (!window.isLocked || window.isStopped) {
        window.sendLogToBackground("❌ Скрипт не активен");
        return false;
    }

    const now = Date.now();
    if (now - window.lastErrorTime < 5000) {
        window.sendLogToBackground("⏳ Слишком рано для следующей перезагрузки");
        return false;
    }

    if (window.currentReloadCount >= window.maxReloadAttempts) {
        window.sendLogToBackground(`❌ Превышен лимит перезагрузок (${window.maxReloadAttempts})`);
        window.sendLogToBackground("⚠️ Требуется ручное вмешательство");
        window.setLoadingIndicator(true, false, "❌ Лимит перезагрузок исчерпан");
        return false;
    }

    window.currentReloadCount++;
    window.lastErrorTime = now;
    window.errorDetected = true;

    window.sendLogToBackground(`\n🔄 === ОБНАРУЖЕНА ОШИБКА ===`);
    window.sendLogToBackground(`Попытка перезагрузки: ${window.currentReloadCount}/${window.maxReloadAttempts}`);
    window.sendLogToBackground(`⏳ Перезагрузка через 5 секунд...`);

    window.setLoadingIndicator(true, false, `🔄 Ошибка! Перезагрузка ${window.currentReloadCount}/${window.maxReloadAttempts} через 5 сек...`);

    await chrome.storage.local.set({
        shouldResumeAfterReload: true,
        currentReloadCount: window.currentReloadCount,
        maxReloadAttempts: window.maxReloadAttempts,
        isLocked: true,
        isStopped: false
    });

    await wait(5000);

    if (window.isStopped) {
        window.sendLogToBackground("⏹️ Перезагрузка отменена (скрипт остановлен)");
        return false;
    }

    window.sendLogToBackground("🔄 Выполняем перезагрузку страницы...");
    window.location.reload();
    return true;
};

// =====================================================================
// === СБРОС СЧЕТЧИКА ПЕРЕЗАГРУЗОК ===
// =====================================================================
window.resetReloadCounter = function() {
    window.currentReloadCount = 0;
    window.lastErrorTime = 0;
    window.errorDetected = false;
    chrome.storage.local.set({
        currentReloadCount: 0,
        shouldResumeAfterReload: false
    });
    window.sendLogToBackground("🔄 Счетчик перезагрузок сброшен");
};

// =====================================================================
// === ОБРАБОТКА СТРАНИЦЫ ВАРИАНТОВ ===
// =====================================================================
window.handleTestVariantsPage = async function() {
    if (window.isStopped || window.currentMode !== 'auto_ai') {
        window.sendLogToBackground("⏹️ handleTestVariantsPage: остановлено");
        return;
    }
    window.sendLogToBackground("🔄 Обработка вариантов...");
    if (!window.globalObserver) {
        window.globalObserver = new GlobalSelectorMutationObserver();
    }

    try {
        window.sendLogToBackground("🔍 Поиск существующего незавершенного варианта...");
        const existingCells = document.querySelectorAll('.c-table-clickable-cell');
        let existingVariant = null;

        for (const cell of existingCells) {
            if (window.isStopped) return;
            const text = cell.textContent?.trim() || "";
            if (text.includes('- не завершен')) {
                existingVariant = cell;
                break;
            }
        }

        if (existingVariant) {
            window.sendLogToBackground(`✅ Найден существующий вариант: ${existingVariant.textContent.trim()}`);
            window.isNavigatingToTest = true;

            await chrome.storage.local.set({
                shouldStartTestAutomatically: true,
                modeToStart: window.currentMode,
                delayMinToStart: window.delayMin,
                delayMaxToStart: window.delayMax,
                nextDelayMinToStart: window.nextDelayMin,
                nextDelayMaxToStart: window.nextDelayMax,
                isLocked: true,
                isStopped: false,
                modalVisible: true,
                isNavigatingToTest: true
            });

            await simulateClick(existingVariant);
            return;
        }

        window.sendLogToBackground("ℹ️ Незавершенных вариантов не найдено. Получаем новый...");
        const allButtons = document.querySelectorAll('.v-button');
        let buttonNewVariant = null;

        for (const btn of allButtons) {
            const text = btn.textContent?.trim() || "";
            if (text.includes("Получить новый вариант")) {
                buttonNewVariant = btn;
                break;
            }
        }

        if (buttonNewVariant) {
            window.sendLogToBackground("✅ Найдена кнопка 'Получить новый вариант'");
            window.isNavigatingToTest = true;
            await simulateClick(buttonNewVariant);

            if (window.isStopped) return;
            window.sendLogToBackground("⏳ Ожидание появления нового варианта...");

            const newVariantCell = await window.globalObserver.waitFor('.c-table-clickable-cell', {
                text: '- не завершен',
                timeout: 30000
            });

            if (window.isStopped) return;
            window.sendLogToBackground(`✅ Новый вариант создан: ${newVariantCell.textContent.trim()}`);
            await wait(1500);

            if (window.isStopped) return;

            await chrome.storage.local.set({
                shouldStartTestAutomatically: true,
                modeToStart: window.currentMode,
                delayMinToStart: window.delayMin,
                delayMaxToStart: window.delayMax,
                nextDelayMinToStart: window.nextDelayMin,
                nextDelayMaxToStart: window.nextDelayMax,
                isLocked: true,
                isStopped: false,
                modalVisible: true,
                isNavigatingToTest: true
            });

            await simulateClick(newVariantCell);
            return;
        } else {
            window.sendLogToBackground("❌ Кнопка 'Получить новый вариант' не найдена и незавершенных вариантов нет.");
            window.setLoadingIndicator(true, false, "Нет доступных вариантов");
            window.stopScript(true);
            return;
        }
    } catch (error) {
        if (window.isStopped) return;
        window.sendLogToBackground("❌ Ошибка обработки вариантов:", error.message);
        window.setLoadingIndicator(true, false, "Ошибка навигации");
    }
};

// =====================================================================
// === ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА РЕЗУЛЬТАТОВ ===
// =====================================================================
window.closeResultsModal = async function() {
    if (window.isStopped || window.currentMode !== 'auto_ai') {
        window.sendLogToBackground("⏹️ closeResultsModal: остановлено");
        chrome.storage.local.remove('shouldCloseResultsModal');
        return;
    }

    window.sendLogToBackground("🔄 Ожидание модального окна результатов...");
    let attempts = 0;
    const maxAttempts = 30;
    let popup = null;

    while (attempts < maxAttempts) {
        if (window.isStopped) {
            chrome.storage.local.remove('shouldCloseResultsModal');
            return;
        }
        const popups = Array.from(document.querySelectorAll('.popupContent')).filter(el => el.innerText?.trim()?.length > 0);
        if (popups.length > 0) {
            popup = popups[popups.length - 1];
            break;
        }
        await wait(500);
        attempts++;
    }

    if (window.isStopped) {
        chrome.storage.local.remove('shouldCloseResultsModal');
        return;
    }

    if (!popup) {
        window.sendLogToBackground("⚠️ Модальное окно не появилось");
        chrome.storage.local.remove('shouldCloseResultsModal');
        window.sendLogToBackground("🔄 Запускаем проверку результатов...");
        window.checkTestResults();
        return;
    }

    window.sendLogToBackground("✅ Модальное окно обнаружено");
    const closeButton = popup.querySelector('.v-window-closebox:not(.v-window-closebox-disabled)');
    if (closeButton) {
        window.sendLogToBackground("🔘 Нажата кнопка закрытия ×");
        await simulateClick(closeButton);
        chrome.storage.local.remove('shouldCloseResultsModal');
    } else if (popup.querySelector('.v-button') && !popup.querySelector('.v-button').textContent.endsWith('Назад')) {
        const button = popup.querySelector('.v-button');
        window.sendLogToBackground(`🔘 Кликаем: "${button.textContent?.trim()}"`);
        await simulateClick(button);
        chrome.storage.local.remove('shouldCloseResultsModal');
    } else {
        chrome.storage.local.remove('shouldCloseResultsModal');
    }

    setTimeout(() => {
        window.sendLogToBackground("🔄 Переход к обработке вариантов...");
        window.handleTestVariantsPage();
    }, 1000);
};

// =====================================================================
// === АВТОЗАПУСК ===
// =====================================================================
window.autoStartTestFlow = async function() {
    window.sendLogToBackground("🚀 Автозапуск...");
    window.isStopped = false;
    window.isExecuting = false;

    if (!window.globalObserver) {
        window.globalObserver = new GlobalSelectorMutationObserver();
    }

    try {
        window.sendLogToBackground("⏳ Ожидание загрузки страницы...");
        await wait(3000);

        let pageType = window.detectPageType();
        let attempts = 0;
        const maxAttempts = 2;

        while (pageType === 'unknown' && attempts < maxAttempts) {
            attempts++;
            window.sendLogToBackground(`🔄 Повторная проверка типа страницы (${attempts}/${maxAttempts})...`);
            await wait(1000);
            pageType = window.detectPageType();
        }

        window.sendLogToBackground(`📍 Тип страницы: ${pageType}`);

        if (pageType === 'results') {
            window.sendLogToBackground("📊 Страница результатов — запускаем проверку и сохранение в БД...");
            window.checkTestResults();
            return;
        }

        if (pageType === 'unknown') {
            const startButton = Array.from(document.querySelectorAll('button, .mdc-button, .v-button'))
                .find(btn => btn.textContent?.trim() === 'Начать тестирование');
            if (startButton) {
                window.sendLogToBackground("✅ Кнопка 'Начать тестирование' найдена прямым поиском");
                pageType = 'test_start';
            } else {
                const questionElement = document.querySelector(window.selectors.questionTitle);
                if (questionElement) {
                    window.sendLogToBackground("✅ Вопрос найден прямым поиском");
                    pageType = 'test';
                }
            }
        }

        if (pageType === 'test_start') {
            window.sendLogToBackground("📝 Страница старта теста - ищем кнопку начала...");
            let startButton = null;

            try {
                startButton = await window.globalObserver.waitFor(
                    '.quiz-buttons-primary .mdc-button__label',
                    { text: 'Начать тестирование', timeout: 5000 }
                );
                if (startButton) {
                    startButton = startButton.closest('button');
                    window.sendLogToBackground("✅ Кнопка найдена, кликаем...");
                    await simulateClick(startButton);
                    await wait(2000);
                }
            } catch (e) {
                window.sendLogToBackground("⚠️ Кнопка не найдена, пробуем продолжить...");
            }

            window.sendLogToBackground("⏳ Ожидание первого вопроса...");
            const questionElement = await window.globalObserver.waitFor(window.selectors.questionTitle, {
                add: true,
                timeout: 5000
            }).catch(() => null);

            if (window.isStopped) {
                window.sendLogToBackground("⏹️ Автозапуск остановлен");
                return;
            }

            if (!questionElement) {
                const questionElement2 = document.querySelector(window.selectors.questionTitle);
                if (!questionElement2) {
                    window.sendLogToBackground("⚠️ Вопрос не появился, но пробуем продолжить...");
                    await wait(2000);
                } else {
                    window.sendLogToBackground("✅ Вопрос найден вручную");
                }
            } else {
                window.sendLogToBackground(`✅ Вопрос: ${questionElement.textContent?.substring(0, 50)}...`);
            }

            await wait(2000);

            if (window.isStopped) {
                window.sendLogToBackground("⏹️ Автозапуск остановлен");
                return;
            }

            const storedSettings = await chrome.storage.local.get([
                'modeToStart', 'delayMinToStart', 'delayMaxToStart',
                'nextDelayMinToStart', 'nextDelayMaxToStart'
            ]);

            if (storedSettings.modeToStart) window.currentMode = storedSettings.modeToStart;
            if (storedSettings.delayMinToStart !== undefined) window.delayMin = storedSettings.delayMinToStart;
            if (storedSettings.delayMaxToStart !== undefined) window.delayMax = storedSettings.delayMaxToStart;
            if (storedSettings.nextDelayMinToStart !== undefined) window.nextDelayMin = storedSettings.nextDelayMinToStart;
            if (storedSettings.nextDelayMaxToStart !== undefined) window.nextDelayMaxToStart = storedSettings.nextDelayMaxToStart;

            window.sendLogToBackground(`🚀 Режим: ${window.currentMode}, Min=${window.delayMin}, Max=${window.delayMax}`);

            if (window.isStopped) {
                window.sendLogToBackground("⏹️ Автозапуск остановлен");
                return;
            }

            if (window.currentMode === 'auto_ai') {
                await window.executeAutoAIModeLogic();
            } else if (window.currentMode === 'auto') {
                await window.executeModeLogic();
            } else {
                window.sendLogToBackground("Ручной режим");
                if (!window.questionObserver) {
                    window.setupQuestionObserver();
                }
                setTimeout(() => window.handleNextQuestion(), 500);
            }

            window.sendLogToBackground("🧹 Очистка флагов");
            chrome.storage.local.remove([
                'shouldStartTestAutomatically', 'modeToStart',
                'delayMinToStart', 'delayMaxToStart',
                'nextDelayMinToStart', 'nextDelayMaxToStart'
            ]);
            return;
        }

        if (pageType === 'test') {
            window.sendLogToBackground("📝 Страница теста...");
            let startButtonInside = Array.from(document.querySelectorAll('button, .mdc-button, .v-button'))
                .find(btn => btn.textContent?.trim() === 'Начать тестирование');

            if (startButtonInside) {
                window.sendLogToBackground("🔘 Нажимаем 'Начать тестирование' (внутри теста)...");
                await simulateClick(startButtonInside);
                await wait(2000);
                setTimeout(window.autoStartTestFlow, 1000);
                return;
            }

            const storedSettings = await chrome.storage.local.get([
                'modeToStart', 'delayMinToStart', 'delayMaxToStart',
                'nextDelayMinToStart', 'nextDelayMaxToStart'
            ]);

            if (storedSettings.modeToStart) window.currentMode = storedSettings.modeToStart;
            if (storedSettings.delayMinToStart !== undefined) window.delayMin = storedSettings.delayMinToStart;
            if (storedSettings.delayMaxToStart !== undefined) window.delayMax = storedSettings.delayMaxToStart;
            if (storedSettings.nextDelayMinToStart !== undefined) window.nextDelayMin = storedSettings.nextDelayMinToStart;
            if (storedSettings.nextDelayMaxToStart !== undefined) window.nextDelayMaxToStart = storedSettings.nextDelayMaxToStart;

            window.sendLogToBackground(`🚀 Режим: ${window.currentMode}, Min=${window.delayMin}, Max=${window.delayMax}`);
            window.isNavigatingToTest = false;
            chrome.storage.local.remove(['isNavigatingToTest']);

            if (window.currentMode === 'auto_ai') {
                await window.executeAutoAIModeLogic();
            } else if (window.currentMode === 'auto') {
                await window.executeModeLogic();
            } else {
                window.sendLogToBackground("Ручной режим");
                if (!window.questionObserver) {
                    window.setupQuestionObserver();
                }
                setTimeout(() => window.handleNextQuestion(), 500);
            }

            chrome.storage.local.remove([
                'shouldStartTestAutomatically', 'modeToStart',
                'delayMinToStart', 'delayMaxToStart',
                'nextDelayMinToStart', 'nextDelayMaxToStart'
            ]);
            return;
        }

        if (pageType === 'variants') {
            window.sendLogToBackground("📋 Страница вариантов - открываем тест...");
            await window.handleTestVariantsPage();
            return;
        }

        if (pageType === 'certificate' || pageType === 'return') {
            window.sendLogToBackground("↩️ Страница завершения - возвращаемся...");
            const backButton = document.querySelector('.v-button-blue-button.v-button-icon-align-right');
            if (backButton) {
                await simulateClick(backButton);
                await wait(2000);
                if (window.isStopped) return;
                window.autoStartTestFlow();
                return;
            }
        }

        window.sendLogToBackground("⚠️ Страница не определена, пробуем найти варианты...");
        const variantCell = document.querySelector('.c-table-clickable-cell');
        if (variantCell) {
            await window.handleTestVariantsPage();
            return;
        }

        window.sendLogToBackground("❌ Не удалось определить где мы находимся");
        window.sendLogToBackground(`📄 URL: ${window.location.href}`);
        window.setLoadingIndicator(true, false, "Не удалось определить страницу");

    } catch (error) {
        window.sendLogToBackground("❌ Ошибка автозапуска:", error.message);
        window.setLoadingIndicator(true, false, "Ошибка: " + error.message);
    }
};

// =====================================================================
// === ПОДТВЕРЖДЕНИЕ ДИАЛОГОВОГО ОКНА ===
// =====================================================================
window.clickConfirmDialogButton = async function() {
    window.sendLogToBackground("⏳ Ожидание диалогового окна подтверждения...");
    await wait(1500);

    const confirmButton = document.querySelector('mat-dialog-actions button:last-child');
    if (confirmButton) {
        const confirmLabel = confirmButton.querySelector('.mdc-button__label');
        if (confirmLabel && confirmLabel.textContent.trim() === "Да") {
            window.sendLogToBackground("✅ Нажата кнопка 'Да' в диалоговом окне");
            confirmButton.click();
            window.sendLogToBackground("⏳ Переход на страницу результатов... Запуск проверки через 3 сек.");

            setTimeout(() => {
                if (!window.isStopped) {
                    window.checkTestResults();
                } else {
                    window.sendLogToBackground("⚠️ Скрипт был остановлен во время ожидания результатов.");
                }
            }, 3000);
        } else {
            window.sendLogToBackground("⚠️ Кнопка 'Да' не найдена или текст не совпадает.");
        }
    } else {
        window.sendLogToBackground("⚠️ Диалоговое окно не найдено.");
        setTimeout(() => {
            if (!window.isStopped) window.checkTestResults();
        }, 2000);
    }
};

// =====================================================================
// === НАБЛЮДАТЕЛЬ ВОПРОСОВ ===
// =====================================================================
window.setupQuestionObserver = function() {
    const questionTitleElement = document.querySelector(window.selectors.questionTitle);
    if (!questionTitleElement) {
        window.sendLogToBackground("⚠️ Не найден элемент с вопросом");
        return;
    }
    if (window.questionObserver) window.questionObserver.disconnect();

    const observer = new MutationObserver(async (mutations) => {
        if (window.isStopped || window.isExecuting) return;

        const currentQuestionText = questionTitleElement.textContent?.trim();
        if (!currentQuestionText) return;

        window.sendLogToBackground("📝 Обнаружено изменение вопроса:", currentQuestionText);

        if (!window.isStopped) {
            window.setLoadingIndicator(true);
            try {
                const result = await window.fetchAnswers(window.normalizeQuestionText(currentQuestionText));

                if (window.isStopped) return;

                if (result?.length) {
                    const answers = Array.from(document.getElementsByClassName('question-inner-html-text'));
                    if (answers.length) {
                        if (window.currentMode === 'auto') {
                            window.executeModeLogic();
                        } else if (window.currentMode === 'auto_ai') {
                            window.executeAutoAIModeLogic();
                        } else {
                            window.highlightCorrectAnswersManual(result, answers);
                        }
                    }
                } else {
                    window.setLoadingIndicator(true, false, "Нет ответов");
                }
            } catch (error) {
                window.sendLogToBackground("❌ Ошибка запроса:", error);
                window.setLoadingIndicator(true, false, "Ошибка запроса");
            } finally {
                window.setLoadingIndicator(false);
            }
        }
    });

    observer.observe(questionTitleElement, { characterData: true, childList: true, subtree: true });
    window.questionObserver = observer;
    window.sendLogToBackground("👁️ Question observer запущен");
};

// =====================================================================
// === ОСТАНОВКА СКРИПТА ===
// =====================================================================
window.stopScript = function(forceUnlock = false, forceStop = false) {
    if (!forceStop) {
        if (window.isFinishingTest && window.currentMode === 'auto_ai') {
            window.sendLogToBackground("⏸️ Не останавливаем - завершение теста в auto_ai");
            return;
        }
        if (window.isReturningToLearning) {
            window.sendLogToBackground("⏸️ Возврат к обучению - не останавливаем");
            return;
        }
        if (window.isNavigatingToTest && window.currentMode === 'auto_ai') {
            window.sendLogToBackground("⏸️ Навигация к тесту - не останавливаем");
            return;
        }
        if (window.checkResultsInterval) {
            window.sendLogToBackground("⏸️ Идет проверка результатов - не останавливаем");
            return;
        }
    }

    window.sendLogToBackground("⏹️ Остановка скрипта...");
    window.isStopped = true;
    if (forceUnlock === true) window.isLocked = false;

    window.resetReloadCounter();
    window.timeoutIds.forEach(id => clearTimeout(id));
    window.timeoutIds = [];

    if (window.checkResultsInterval) {
        clearInterval(window.checkResultsInterval);
        window.checkResultsInterval = null;
    }

    if (window.fetchPromise) {
        window.abortController.abort();
        window.fetchPromise = null;
        window.abortController = new AbortController();
    }

    if (window.questionObserver) {
        window.questionObserver.disconnect();
        window.questionObserver = null;
    }

    if (window.globalObserver) {
        window.globalObserver.rejectAllWait('stopped by user');
        window.globalObserver.disconnect();
        window.globalObserver = null;
    }

    window.isExecuting = false;
    window.isNavigatingToTest = false;

    chrome.storage.local.remove([
        'shouldStartTestAutomatically', 'modeToStart',
        'delayMinToStart', 'delayMaxToStart',
        'nextDelayMinToStart', 'nextDelayMaxToStart',
        'shouldCloseResultsModal', 'isNavigatingToTest'
    ]);

    chrome.storage.local.set({
        isStopped: true,
        isLocked: window.isLocked,
        emptyResponsesCount: 0,
        modalVisible: false
    });

    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (modalHost) {
        window.updateModalButtonState(window.isLocked);
        window.setAIButtonState(window.isLocked);
    }

    window.sendLogToBackground(`✅ Скрипт остановлен. Блокировка: ${window.isLocked}`);
};

// =====================================================================
// === ЗАДЕРЖКИ ===
// =====================================================================
window.getRandomDelaySeconds = function(min, max) {
    if (min > max) return min;
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// =====================================================================
// === АВТОМАТИЧЕСКИЙ РЕЖИМ ===
// =====================================================================
window.executeModeLogic = async function() {
    if (window.currentMode === 'manual' || window.isExecuting || window.isStopped) {
        window.sendLogToBackground("executeModeLogic: уже выполняется или остановлен");
        return;
    }

    window.isExecuting = true;

    try {
        const questionElements = document.getElementsByClassName('question-title-text');
        if (!questionElements.length) { window.isExecuting = false; return; }

        const currentQuestionText = questionElements[0].textContent?.trim();
        const answers = document.getElementsByClassName('question-inner-html-text');
        if (!answers.length) { window.isExecuting = false; return; }
        if (window.isStopped) { window.isExecuting = false; return; }

        const result = await window.fetchAnswers(window.normalizeQuestionText(currentQuestionText));

        if (window.isStopped) { window.isExecuting = false; return; }

        if (!result?.length) {
            window.emptyResponsesCount++;
            window.sendLogToBackground(`⚠️ Пустой ответ. Счетчик: ${window.emptyResponsesCount}`);
            if (window.emptyResponsesCount >= 4) {
                window.setLoadingIndicator(true, false, "Нет ответов");
                window.stopScript(true);
                return;
            }
            const nextButton = window.findButtonByText("Следующий вопрос");
            if (nextButton) {
                nextButton.click();
                setTimeout(window.executeModeLogic, 500);
            }
            window.isExecuting = false;
            return;
        }

        window.emptyResponsesCount = 0;
        const clickedAnswers = new Set();
        const answerTextsToSelect = [];

        for (const answer of answers) {
            const answerText = answer.textContent?.trim();
            if (result.some(r => window.normalizeText(r) === window.normalizeText(answerText))) {
                answerTextsToSelect.push(answerText);
            }
        }

        const answerDelays = [];
        for (let i = 0; i < answerTextsToSelect.length; i++) {
            answerDelays.push(window.getRandomDelaySeconds(window.delayMin, window.delayMax));
        }
        const nextQuestionDelay = window.getRandomDelaySeconds(window.nextDelayMin, window.nextDelayMax);
        const totalDelaySeconds = answerDelays.reduce((sum, delay) => sum + delay, 0) + nextQuestionDelay;
        window.currentTotalDelay = totalDelaySeconds;

        window.sendLogToBackground(`🎯 ОТВЕТОВ: ${answerTextsToSelect.length}, ВРЕМЯ: ${totalDelaySeconds} сек`);
        if (totalDelaySeconds > 0) window.setLoadingIndicator(true, true, null, totalDelaySeconds);

        for (let i = 0; i < answerTextsToSelect.length; i++) {
            if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }
            const answerText = answerTextsToSelect[i];
            let answerElement = null;
            const currentAnswerElements = document.getElementsByClassName('question-inner-html-text');

            for (const el of currentAnswerElements) {
                if (el.textContent?.trim() === answerText) { answerElement = el; break; }
            }
            if (!answerElement) continue;

            const listItem = answerElement.closest('mat-list-item') || answerElement.closest('.mat-mdc-list-item') || answerElement.closest('mat-radio-button') || answerElement.closest('.mat-mdc-radio-button');
            if (!listItem) continue;

            const radioButton = listItem.querySelector('mat-radio-button') || listItem.querySelector('.mat-mdc-radio-button') || listItem;
            const checkbox = listItem.querySelector('mat-checkbox') || listItem.querySelector('.mat-mdc-checkbox');

            if (radioButton && (radioButton.classList.contains('mat-radio-checked') || radioButton.querySelector('input[type="radio"]:checked'))) continue;
            else if (checkbox) {
                const input = checkbox.querySelector('input[type="checkbox"]');
                if (input && input.checked) continue;
            }

            if (!clickedAnswers.has(answerText)) {
                const randomDelay = answerDelays[i];
                await new Promise(resolve => {
                    const timeoutId = setTimeout(resolve, randomDelay * 1000);
                    window.timeoutIds.push(timeoutId);
                });

                if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

                if (radioButton && (radioButton.classList.contains('mat-radio-button') || radioButton.classList.contains('mat-mdc-radio-button'))) {
                    const radioInput = radioButton.querySelector('input[type="radio"]') || radioButton.querySelector('.mdc-radio__native-control') || radioButton.querySelector('.mat-radio-container') || radioButton;
                    if (radioInput) await simulateClick(radioInput);
                    else await simulateClick(radioButton);
                } else if (checkbox) {
                    const checkboxInput = checkbox.querySelector('input[type="checkbox"]') || checkbox.querySelector('.mdc-checkbox__native-control');
                    if (checkboxInput) await simulateClick(checkboxInput);
                    else await simulateClick(checkbox);
                } else {
                    await simulateClick(answerElement);
                }
                clickedAnswers.add(answerText);
            }
        }

        if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

        await new Promise(resolve => {
            const timeoutId = setTimeout(resolve, nextQuestionDelay * 1000);
            window.timeoutIds.push(timeoutId);
        });

        if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

        window.setLoadingIndicator(false);
        const nextButton = window.findButtonByText("Следующий вопрос");
        if (nextButton) {
            await simulateClick(nextButton);
            if (!window.isStopped) setTimeout(window.executeModeLogic, 800);
        } else {
            window.sendLogToBackground("⚠️ Не найдена кнопка 'Следующий вопрос'");
            window.stopScript(true);
        }
    } catch (error) {
        window.sendLogToBackground("❌ Ошибка в executeModeLogic:", error.message);
        window.setLoadingIndicator(false);
    } finally {
        window.isExecuting = false;
    }
};

// =====================================================================
// === АВТОПОДБОР С ИИ ===
// =====================================================================
window.executeAutoAIModeLogic = async function() {
    if (window.isExecuting || window.isStopped) {
        window.sendLogToBackground("executeAutoAIModeLogic: уже выполняется или остановлен");
        return;
    }

    window.isExecuting = true;

    try {
        const questionElements = document.getElementsByClassName('question-title-text');
        if (!questionElements.length) { window.isExecuting = false; return; }

        const currentQuestionText = questionElements[0].textContent?.trim();
        const answers = document.getElementsByClassName('question-inner-html-text');
        if (!answers.length) { window.isExecuting = false; return; }
        if (window.isStopped) { window.isExecuting = false; return; }

        if (window.detectPageError()) {
            window.sendLogToBackground("⚠️ Обнаружена ошибка на странице!");
            window.isExecuting = false;
            await window.handlePageError();
            return;
        }

        window.sendLogToBackground(`\n📝 === ВОПРОС ===`);
        window.sendLogToBackground(`Текст: "${currentQuestionText}"`);

        await window.initDatabase();
        const dbRecords = await window.findQuestionInDB(currentQuestionText);
        const correctCount = dbRecords.filter(r => r.isCorrect === true).length;
        const incorrectCount = dbRecords.filter(r => r.isCorrect === false).length;
        const nullCount = dbRecords.filter(r => r.isCorrect === null).length;

        window.sendLogToBackground(`📊 Статистика БД: Верно=${correctCount}, Неверно=${incorrectCount}, Неизвестно=${nullCount}`);

        const correctRecords = dbRecords.filter(record =>
            record.isCorrect === true &&
            record.selectedAnswers &&
            Array.isArray(record.selectedAnswers) &&
            record.selectedAnswers.length > 0
        );

        let aiAnswers = [];
        if (correctRecords.length > 0) {
            window.sendLogToBackground(`✅ Найдено ${correctRecords.length} правильных комбинаций в БД`);
            const pageOptions = window.getAnswerOptionsFromPage();
            if (pageOptions && pageOptions.length > 0) {
                let foundMatch = false;
                for (const correctRecord of correctRecords) {
                    const recordAnswers = correctRecord.selectedAnswers;
                    const allAnswersOnPage = recordAnswers.every(ans =>
                        pageOptions.some(pageAns => window.normalizeText(ans) === window.normalizeText(pageAns))
                    );
                    if (allAnswersOnPage) {
                        window.sendLogToBackground(`✅ Найдена подходящая комбинация: [${recordAnswers.join('; ')}]`);
                        aiAnswers = recordAnswers;
                        foundMatch = true;
                        break;
                    }
                }
                if (!foundMatch) {
                    window.sendLogToBackground(`⚠️ Ни одна известная комбинация не подходит для текущих вариантов`);
                }
            } else {
                window.sendLogToBackground(`⚠️ Не удалось получить варианты со страницы, используем первую комбинацию`);
                aiAnswers = correctRecords[0].selectedAnswers;
            }
        }

        if (!aiAnswers || aiAnswers.length === 0) {
            let incorrectCombinations = [];
            if (dbRecords.length > 0) {
                incorrectCombinations = dbRecords
                    .filter(record =>
                        record.isCorrect === false &&
                        record.selectedAnswers &&
                        Array.isArray(record.selectedAnswers) &&
                        record.selectedAnswers.length > 0
                    )
                    .map(record => {
                        return [...record.selectedAnswers].sort((a, b) =>
                            window.normalizeText(a).localeCompare(window.normalizeText(b))
                        );
                    });

                const uniqueIncorrect = [];
                const seen = new Set();
                for (const comb of incorrectCombinations) {
                    const key = comb.map(a => window.normalizeText(a)).sort().join('|');
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueIncorrect.push(comb);
                    }
                }
                incorrectCombinations = uniqueIncorrect;

                if (incorrectCombinations.length > 0) {
                    window.sendLogToBackground(`⚠️ ИЗВЕСТНЫЕ НЕВЕРНЫЕ ПОПЫТКИ (${incorrectCombinations.length}):`);
                    incorrectCombinations.forEach((comb, idx) => {
                        window.sendLogToBackground(`${idx + 1}. [${comb.join('; ')}]`);
                    });
                } else {
                    const nullRecordsCount = dbRecords.filter(r => r.isCorrect === null).length;
                    if (nullRecordsCount > 0) {
                        window.sendLogToBackground(`ℹ️ Найдено ${nullRecordsCount} записей со статусом 'неизвестно'`);
                    } else {
                        window.sendLogToBackground(`🆕 Вопрос не найден в БД (чистый лист)`);
                    }
                }
            }

            const questionType = window.getQuestionTypeFromPage();
            const isMultipleChoice = questionType?.includes("НЕСКОЛЬКО");
            const answerOptions = window.getAnswerOptionsFromPage();

            if (!answerOptions || !answerOptions.length) {
                window.sendLogToBackground("⚠️ Не найдены варианты ответов на странице");
                window.setLoadingIndicator(true, false, "Нет вариантов");
                window.isExecuting = false;
                return;
            }

            window.sendLogToBackground(`\n📋 ВАРИАНТЫ ОТВЕТОВ НА СТРАНИЦЕ (${answerOptions.length}):`);
            answerOptions.forEach((opt, idx) => {
                window.sendLogToBackground(`${idx + 1}. "${opt}"`);
            });

            window.setLoadingIndicator(true);
            window.sendLogToBackground(`\n🤖 ОТПРАВКА ЗАПРОСА К ИИ...`);
            window.sendLogToBackground(`Тип вопроса: ${isMultipleChoice ? 'НЕСКОЛЬКО' : 'ОДИН'}`);
            window.sendLogToBackground(`Передано неверных комбинаций: ${incorrectCombinations.length}`);

            aiAnswers = await window.askAIWithIncorrectCombinations(
                currentQuestionText,
                answerOptions,
                isMultipleChoice,
                incorrectCombinations
            );

            if (window.isStopped) {
                window.isExecuting = false;
                window.setLoadingIndicator(false);
                return;
            }

            if (!aiAnswers?.length) {
                window.sendLogToBackground("❌ ИИ не смог предложить новый вариант");
                window.setLoadingIndicator(true, false, "ИИ исчерпал варианты");
                const nextButton = window.findButtonByText("Следующий вопрос");
                if (nextButton) {
                    nextButton.click();
                    setTimeout(window.executeAutoAIModeLogic, 500);
                }
                window.isExecuting = false;
                return;
            }

            window.sendLogToBackground(`\n💬 ОТВЕТ ОТ ИИ:`);
            window.sendLogToBackground(`Варианты: [${aiAnswers.join('; ')}]`);
            window.sendLogToBackground(`Количество: ${aiAnswers.length}`);

            if (window.currentMode === 'auto_ai' && aiAnswers && Array.isArray(aiAnswers) && aiAnswers.length > 0) {
                window.sendLogToBackground(`💾 Сохраняем новую попытку в БД (статус неизвестен)`);
                await window.saveQuestionToDB(currentQuestionText, aiAnswers, null);
            }
        }

        window.sendLogToBackground(`\n🎯 ВЫБОР ОТВЕТОВ:`);
        window.sendLogToBackground(`Выбрано ответов: ${aiAnswers.length}`);
        aiAnswers.forEach((ans, idx) => {
            window.sendLogToBackground(`${idx + 1}. "${ans}"`);
        });

        if (!aiAnswers || !Array.isArray(aiAnswers) || aiAnswers.length === 0) {
            window.sendLogToBackground("⚠️ Нет ответов для выбора, переходим к следующему вопросу");
            const nextButton = window.findButtonByText("Следующий вопрос");
            if (nextButton) {
                await simulateClick(nextButton);
                setTimeout(window.executeAutoAIModeLogic, 500);
            }
            window.isExecuting = false;
            return;
        }

        const clickedAnswers = new Set();
        const answerDelays = [];
        for (let i = 0; i < aiAnswers.length; i++) {
            answerDelays.push(window.getRandomDelaySeconds(window.delayMin, window.delayMax));
        }
        const nextQuestionDelay = window.getRandomDelaySeconds(window.nextDelayMin, window.nextDelayMax);
        const totalDelaySeconds = answerDelays.reduce((sum, delay) => sum + delay, 0) + nextQuestionDelay;
        window.currentTotalDelay = totalDelaySeconds;
        window.sendLogToBackground(`⏱️ Время: ${totalDelaySeconds} сек`);

        if (totalDelaySeconds > 0) window.setLoadingIndicator(true, true, null, totalDelaySeconds);

        for (let i = 0; i < aiAnswers.length; i++) {
            if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }
            const aiAnswerText = aiAnswers[i];
            let answerElement = null;
            const currentAnswerElements = document.getElementsByClassName('question-inner-html-text');

            for (const el of currentAnswerElements) {
                if (el.textContent?.trim() === aiAnswerText) { answerElement = el; break; }
            }
            if (!answerElement) continue;

            const listItem = answerElement.closest('mat-list-item') || answerElement.closest('.mat-mdc-list-item') || answerElement.closest('mat-radio-button') || answerElement.closest('.mat-mdc-radio-button');
            if (!listItem) continue;

            const radioButton = listItem.querySelector('mat-radio-button') || listItem.querySelector('.mat-mdc-radio-button') || listItem;
            const checkbox = listItem.querySelector('mat-checkbox') || listItem.querySelector('.mat-mdc-checkbox');

            if (radioButton && (radioButton.classList.contains('mat-radio-checked') || radioButton.querySelector('input[type="radio"]:checked'))) continue;
            else if (checkbox) {
                const input = checkbox.querySelector('input[type="checkbox"]');
                if (input && input.checked) continue;
            }

            if (!clickedAnswers.has(aiAnswerText)) {
                const randomDelay = answerDelays[i];
                await new Promise(resolve => {
                    const timeoutId = setTimeout(resolve, randomDelay * 1000);
                    window.timeoutIds.push(timeoutId);
                });

                if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

                window.sendLogToBackground(`👆 КЛИК #${i + 1}: "${aiAnswerText}" (задержка: ${randomDelay} сек)`);

                if (radioButton && (radioButton.classList.contains('mat-radio-button') || radioButton.classList.contains('mat-mdc-radio-button'))) {
                    const radioInput = radioButton.querySelector('input[type="radio"]') || radioButton.querySelector('.mdc-radio__native-control') || radioButton.querySelector('.mat-radio-container') || radioButton;
                    if (radioInput) await simulateClick(radioInput);
                    else await simulateClick(radioButton);
                } else if (checkbox) {
                    const checkboxInput = checkbox.querySelector('input[type="checkbox"]') || checkbox.querySelector('.mdc-checkbox__native-control');
                    if (checkboxInput) await simulateClick(checkboxInput);
                    else await simulateClick(checkbox);
                } else {
                    await simulateClick(answerElement);
                }
                clickedAnswers.add(aiAnswerText);
            }
        }

        if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

        await new Promise(resolve => {
            const timeoutId = setTimeout(resolve, nextQuestionDelay * 1000);
            window.timeoutIds.push(timeoutId);
        });

        if (window.isStopped) { window.isExecuting = false; window.setLoadingIndicator(false); return; }

        window.setLoadingIndicator(false);
        const finishButton = window.findButtonByText("Завершить тестирование");
        const nextButton = window.findButtonByText("Следующий вопрос");

        if (finishButton) {
            window.sendLogToBackground("🏁 Найдена кнопка 'Завершить тестирование'");
            window.isFinishingTest = true;
            await simulateClick(finishButton);
            setTimeout(() => { window.clickConfirmDialogButton(); }, 1000);
        } else if (nextButton) {
            window.sendLogToBackground("➡️ Переход к следующему вопросу");
            await simulateClick(nextButton);
            if (!window.isStopped) setTimeout(window.executeAutoAIModeLogic, 800);
        } else {
            window.sendLogToBackground("⚠️ Не найдены кнопки навигации");
            window.stopScript(true);
        }
    } catch (error) {
        window.sendLogToBackground("❌ Ошибка в executeAutoAIModeLogic:", error.message);
        window.setLoadingIndicator(false);
    } finally {
        window.isExecuting = false;
    }
};

// ✅ ПРОВЕРКА РЕЗУЛЬТАТОВ ТЕСТА И ОЦЕНКИ (ИСПРАВЛЕННАЯ)
window.checkTestResults = async function() {
    window.sendLogToBackground("📊 Проверка результатов и оценки...");
    let attempts = 0;
    const maxAttempts = 30;
    if (window.checkResultsInterval) {
        clearInterval(window.checkResultsInterval);
        window.checkResultsInterval = null;
    }

    const checkLoop = async () => {
        if (window.isStopped) {
            window.sendLogToBackground("⏹️ Проверка результатов остановлена");
            return;
        }

        attempts++;
        const resultsContainer = document.querySelector('mat-card-content') || document.querySelector('.questionList');

        if (resultsContainer || attempts >= maxAttempts) {
            if (!resultsContainer) {
                window.sendLogToBackground("⚠️ Результаты не найдены");
                window.tryFinishTestFlow();
                return;
            }

            const questionItems = document.querySelectorAll('[id^="item-"], .questionList-item');
            window.sendLogToBackground(`📝 Найдено ${questionItems.length} вопросов для анализа`);

            let processedCount = 0;
            let updatedCount = 0;
            let createdCount = 0;

            const promises = Array.from(questionItems).map(async (item) => {
                try {
                    const questionTitle = item.querySelector('.questionList-item-content-title, .question-title-text');
                    const questionText = questionTitle?.textContent?.trim() || '';
                    if (!questionText) return;

                    const answerElements = item.querySelectorAll('.questionList-item-content-answer-text, .selected-answer');
                    const selectedAnswersFromPage = Array.from(answerElements)
                        .map(el => el.textContent?.trim())
                        .filter(Boolean);

                    if (selectedAnswersFromPage.length === 0) return;

                    const statusElement = item.querySelector('.questionList-item-status-notWright, .incorrect, .wrong, .status-incorrect');
                    const isCorrectFromPage = !statusElement;

                    const dbRecords = await window.findQuestionInDB(questionText);

                    if (window.currentMode !== 'auto_ai') {
                        window.sendLogToBackground(`ℹ️ Пропуск сохранения (режим: ${window.currentMode})`);
                        processedCount++;
                        return;
                    }

                    if (!dbRecords || dbRecords.length === 0) {
                        window.sendLogToBackground(`➕ НОВАЯ запись: [${selectedAnswersFromPage.join('; ')}]`);
                        await window.saveQuestionToDB(questionText, selectedAnswersFromPage, isCorrectFromPage);
                        createdCount++;
                        processedCount++;
                        return;
                    }

                    let matchFound = false;
                    for (const record of dbRecords) {
                        if (!record.selectedAnswers || !Array.isArray(record.selectedAnswers)) continue;

                        const normalizedDb = record.selectedAnswers.map(a => window.normalizeText(a)).sort();
                        const normalizedPage = selectedAnswersFromPage.map(a => window.normalizeText(a)).sort();

                        if (normalizedDb.length === normalizedPage.length &&
                            normalizedDb.every((val, i) => val === normalizedPage[i])) {

                            matchFound = true;
                            
                            // ✅ ПРОВЕРКА: ЕСТЬ ЛИ ID
                            if (!record.id) {
                                window.sendLogToBackground(`⚠️ У записи нет ID, пропускаем обновление: ${questionText.substring(0, 50)}...`);
                                break;
                            }
                            
                            if (record.isCorrect !== isCorrectFromPage) {
                                window.sendLogToBackground(`🔄 Обновление #${record.id}: ${record.isCorrect} → ${isCorrectFromPage}`);
                                
                                // ✅ Обновляем локально
                                const transaction = window.db.transaction(['questions'], 'readwrite');
                                const store = transaction.objectStore('questions');
                                record.isCorrect = isCorrectFromPage;
                                store.put(record);
                                updatedCount++;
                                
                                // ✅ ОТПРАВЛЯЕМ PATCH ЗАПРОС НА СЕРВЕР
                                try {
                                    const success = await window.updateAnswerStatus(record.id, isCorrectFromPage);
                                    if (success) {
                                        window.sendLogToBackground(`✅ Обновлено на сервере #${record.id}`);
                                    }
                                } catch (error) {
                                    window.sendLogToBackground(`❌ Ошибка обновления сервера #${record.id}: ${error.message}`);
                                }
                            }
                            break;
                        }
                    }

                    if (!matchFound) {
                        window.sendLogToBackground(`❓ Новая комбинация: [${selectedAnswersFromPage.join('; ')}]`);
                        await window.saveQuestionToDB(questionText, selectedAnswersFromPage, isCorrectFromPage);
                        createdCount++;
                    }
                    processedCount++;
                } catch (e) {
                    window.sendLogToBackground("⚠️ Ошибка:", e);
                }
            });

            await Promise.all(promises);

            window.sendLogToBackground(`📊 Итого: Обработано=${processedCount}, Обновлено=${updatedCount}, Создано=${createdCount}`);
            window.tryFinishTestFlow();
            return;
        }

        setTimeout(checkLoop, 1000);
    };

    checkLoop();
};

// =====================================================================
// === ЗАВЕРШЕНИЕ ТЕСТА ===
// =====================================================================
window.tryFinishTestFlow = async function() {
    const gradeIndicators = document.querySelectorAll('lib-status-indicator, .status-indicator, .quiz-info-col-indicators');
    let currentGrade = 0;

    for (const indicator of gradeIndicators) {
        const text = indicator.textContent || indicator.innerText;
        const match = text.match(/Оценка\s*[:\s](\d+)/i) || text.match(/(\d+)\sбалл/i);
        if (match) {
            currentGrade = parseInt(match[1]);
            break;
        }
        const valueEl = indicator.querySelector('.text_value');
        if (valueEl) {
            const val = parseInt(valueEl.textContent.trim());
            if (!isNaN(val) && val > 0 && val <= 5) {
                if (indicator.querySelector('.text_label')?.textContent.includes('Оценка')) {
                    currentGrade = val;
                    break;
                }
            }
        }
    }

    if (currentGrade > 0) {
        window.sendLogToBackground(`🎯 Получена оценка: ${currentGrade}`);
        const storedData = await new Promise(resolve => chrome.storage.local.get(['targetGrade'], resolve));
        const targetGrade = storedData.targetGrade || window.targetGrade || 5;
        window.sendLogToBackground(`🎯 Целевая оценка: ${targetGrade}`);

        if (currentGrade >= targetGrade) {
            window.sendLogToBackground(`🎉 Цель достигнута! (${currentGrade} >= ${targetGrade})`);
            window.isStopped = true;
            window.isLocked = false;

            window.resetReloadCounter();

            const modalHost = document.getElementById(window.selectors.modalHostId);
            if (modalHost) {
                window.updateModalButtonState(false);
                window.setAIButtonState(false);
            }

            chrome.storage.local.set({ isStopped: true, isLocked: false, emptyResponsesCount: 0 });
            window.stopScript(true);

            setTimeout(() => {
                alert(`✅ Автоподбор завершен!\n\nВы получили оценку: ${currentGrade}\nЦелевая оценка была: ${targetGrade}\n\nСкрипт остановлен.`);
            }, 500);
        } else {
            window.sendLogToBackground(`⚠️ Оценка ${currentGrade} < ${targetGrade}. Запуск повторной попытки...`);

            const returnButton = document.querySelector('button.quiz-buttons-primary, .v-button-blue-button');
            if (returnButton && (returnButton.textContent.includes('Вернуться') || returnButton.textContent.includes('Попробовать'))) {
                window.isReturningToLearning = true;
                chrome.storage.local.set({ shouldCloseResultsModal: true });
                await window.simulateClick(returnButton);
            } else {
                window.sendLogToBackground("⚠️ Кнопка возврата не найдена, пытаемся найти любую кнопку возврата");
                const anyReturnBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Вернуться'));
                if (anyReturnBtn) {
                    await window.simulateClick(anyReturnBtn);
                } else {
                    window.stopScript(true);
                }
            }
        }
    } else {
        window.sendLogToBackground("⚠️ Не удалось автоматически определить оценку. Пробуем вернуться вручную или стоп.");
        const returnButton = document.querySelector('button.quiz-buttons-primary, .v-button-blue-button');
        if (returnButton && returnButton.textContent.includes('Вернуться')) {
            window.isReturningToLearning = true;
            await window.simulateClick(returnButton);
        }
    }
};

// =====================================================================
// === ОБРАБОТКА СООБЩЕНИЙ ===
// =====================================================================
if (!window.messageListenerSet) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        window.sendLogToBackground("📨 Получено:", request.action);
        switch (request.action) {
            case "showModal":
                window.showModal();
                break;
            case "setMode":
                window.currentMode = request.mode;
                window.isStopped = false;
                chrome.storage.local.set({ mode: request.mode, isStopped: false });
                break;
            case "startScript":
                window.sendLogToBackground("🚀 ЗАПУСК");
                const validModes = ['auto', 'auto_ai', 'manual'];
                if (!validModes.includes(request.mode)) {
                    window.sendLogToBackground("❌ Неверный режим!");
                    window.setLoadingIndicator(true, false, "⚠️ Выберите режим");
                    window.isLocked = false;
                    window.isStopped = true;
                    chrome.storage.local.set({ isLocked: false, isStopped: true });
                    if (document.getElementById(window.selectors.modalHostId)) {
                        window.updateModalButtonState(false);
                        window.setAIButtonState(false);
                    }
                    return;
                }
                window.currentMode = request.mode;
                window.isStopped = false;
                window.isLocked = true;
                if (request.mode !== 'manual') {
                    window.delayMin = request.delayMin ?? 3;
                    window.delayMax = request.delayMax ?? 9;
                    window.nextDelayMin = request.nextDelayMin ?? 2;
                    window.nextDelayMax = request.nextDelayMax ?? 5;
                }
                chrome.storage.local.get(['targetGrade'], (res) => {
                    window.targetGrade = res.targetGrade || 5;
                    window.sendLogToBackground(`🎯 Целевая оценка: ${window.targetGrade}`);
                });

                window.emptyResponsesCount = 0;
                if (window.fetchPromise) {
                    window.abortController.abort();
                    window.fetchPromise = null;
                }
                window.abortController = new AbortController();

                chrome.storage.local.set({
                    isStopped: false,
                    isLocked: true,
                    mode: request.mode,
                    delayMin: window.delayMin,
                    delayMax: window.delayMax,
                    nextDelayMin: window.nextDelayMin,
                    nextDelayMax: window.nextDelayMax,
                    emptyResponsesCount: 0
                });

                if (!window.globalObserver) {
                    window.globalObserver = new GlobalSelectorMutationObserver();
                }

                if (window.currentMode === 'manual') {
                    window.sendLogToBackground("✅ РУЧНОЙ режим");
                    if (!window.questionObserver) {
                        window.setupQuestionObserver();
                    }
                    setTimeout(() => window.handleNextQuestion(), 100);
                } else if (window.currentMode === 'auto') {
                    window.sendLogToBackground("✅ АВТОМАТИЧЕСКИЙ режим");
                    window.executeModeLogic();
                } else if (window.currentMode === 'auto_ai') {
                    window.sendLogToBackground("✅ АВТОПОДБОР С ИИ + УМНАЯ НАВИГАЦИЯ");
                    window.autoStartTestFlow();
                }
                break;
            case "stopScript":
                window.stopScript(true, true);
                break;
            case "askAI":
                window.handleAskAI();
                break;
            case "exportDB":
                window.exportDatabase();
                break;
            case "exportLogs":
                window.sendLogToBackground("📥 Экспорт логов запрошен");
                break;
            case "toggleModal":
                if (window.isModalVisible) {
                    const modalHost = document.getElementById(window.selectors.modalHostId);
                    if (modalHost) modalHost.style.display = 'none';
                    window.isModalVisible = false;
                    chrome.storage.local.set({ modalVisible: false });
                } else {
                    window.showModal();
                }
                break;
        }
    });
    window.messageListenerSet = true;
}

// =====================================================================
// === ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ ===
// =====================================================================
if (!window.initialLoad) {
    chrome.storage.local.get([
        'modalVisible', 'isStopped', 'isLocked', 'shouldCloseResultsModal',
        'shouldStartTestAutomatically', 'mode', 'delayMin', 'delayMax',
        'nextDelayMin', 'nextDelayMax', 'targetGrade', 'isNavigatingToTest',
        'shouldResumeAfterReload', 'maxReloadAttempts', 'currentReloadCount'
    ], (result) => {
        if (result.mode !== undefined) window.currentMode = result.mode;
        if (result.delayMin !== undefined) window.delayMin = result.delayMin;
        if (result.delayMax !== undefined) window.delayMax = result.delayMax;
        if (result.nextDelayMin !== undefined) window.nextDelayMin = result.nextDelayMin;
        if (result.nextDelayMax !== undefined) window.nextDelayMax = result.nextDelayMax;
        if (result.targetGrade !== undefined) window.targetGrade = result.targetGrade;

        if (result.maxReloadAttempts !== undefined) {
            window.maxReloadAttempts = result.maxReloadAttempts;
        }
        if (result.currentReloadCount !== undefined) {
            window.currentReloadCount = result.currentReloadCount;
        }

        window.isLocked = result.isLocked || false;

        const shouldResume = result.shouldResumeAfterReload && window.isLocked && !result.isStopped && window.currentMode === 'auto_ai';

        if (shouldResume) {
            window.sendLogToBackground("🔄 ОБНАРУЖЕНА ПЕРЕЗАГРУЗКА - АВТОВОССТАНОВЛЕНИЕ");
            window.isStopped = false;
            window.isModalVisible = true;
            chrome.storage.local.set({ modalVisible: true, shouldResumeAfterReload: false });

            setTimeout(() => {
                window.autoStartTestFlow();
            }, 2000);
            return;
        }

        if (result.isNavigatingToTest && window.currentMode === 'auto_ai') {
            window.isStopped = false;
            window.sendLogToBackground("🔄 Навигация к тесту - isStopped = false");
        } else {
            window.isStopped = result.isStopped !== undefined ? result.isStopped : true;
        }

        window.isExecuting = false;
        window.emptyResponsesCount = 0;

        window.sendLogToBackground(`📦 Загрузка. Режим: ${window.currentMode}, Блокировка: ${window.isLocked}`);

        if (document.getElementById(window.selectors.modalHostId)) {
            window.updateModalButtonState(window.isLocked);
            window.setAIButtonState(window.isLocked);
        }

        chrome.storage.local.set({
            isStopped: window.isStopped,
            isLocked: window.isLocked,
            emptyResponsesCount: 0,
            shouldResumeAfterReload: false
        });

        if (result.shouldCloseResultsModal && window.currentMode === 'auto_ai') {
            window.sendLogToBackground("🔍 Обнаружен флаг закрытия модального окна");
            chrome.storage.local.remove('shouldCloseResultsModal');
            window.closeResultsModal();
            return;
        }

        if (result.shouldStartTestAutomatically && window.currentMode === 'auto_ai') {
            window.sendLogToBackground("🚀 Обнаружен флаг автозапуска теста");
            window.isModalVisible = true;
            chrome.storage.local.set({ modalVisible: true });
            window.isStopped = false;
            window.autoStartTestFlow();
            return;
        }

        if (window.isLocked || result.modalVisible) {
            window.sendLogToBackground("🔓 Показ модального окна");
            window.isModalVisible = true;
            chrome.storage.local.set({ modalVisible: true });
            window.showModal();
            setTimeout(() => {
                window.updateModalButtonState(window.isLocked);
                window.setAIButtonState(window.isLocked);
            }, 500);
        }
    });
    window.initialLoad = true;
}

// =====================================================================
// === ОБРАБОТКА ВЫГРУЗКИ СТРАНИЦЫ ===
// =====================================================================
window.beforeUnloadHandler = function() {
    if (window.isNavigatingToTest && window.currentMode === 'auto_ai') {
        window.sendLogToBackground("↩️ Навигация к тесту - не останавливаем");
        return;
    }
    if (window.isReturningToLearning) {
        window.sendLogToBackground("↩️ Возврат к обучению - не останавливаем");
        return;
    }
    if (window.isLocked && !window.isStopped && window.currentMode === 'auto_ai') {
        window.sendLogToBackground("💾 Страница закрывается - сохраняем состояние для восстановления");
        chrome.storage.local.set({
            shouldResumeAfterReload: true,
            currentReloadCount: window.currentReloadCount,
            maxReloadAttempts: window.maxReloadAttempts,
            isStopped: false,
            isLocked: true
        });
    } else {
        window.sendLogToBackground("📄 Страница выгружается - остановка");
        window.isStopped = true;
        chrome.storage.local.set({ isStopped: true, emptyResponsesCount: 0, shouldResumeAfterReload: false });
    }

    window.timeoutIds.forEach(id => clearTimeout(id));
    window.timeoutIds = [];

    if (window.fetchPromise) {
        window.abortController.abort();
        window.fetchPromise = null;
    }

    if (window.questionObserver) {
        window.questionObserver.disconnect();
        window.questionObserver = null;
    }

    if (window.globalObserver) {
        window.globalObserver.disconnect();
        window.globalObserver = null;
    }

    window.isExecuting = false;
};

// =====================================================================
// === УПРАВЛЕНИЕ СОСТОЯНИЕМ МОДАЛЬНОГО ОКНА ===
// =====================================================================
window.updateModalButtonState = function(isLocked) {
    const modalHost = document.getElementById('extensionModal');
    if (!modalHost?.shadowRoot) return;

    const shadow = modalHost.shadowRoot;
    const startBtn = shadow.getElementById('startButton');
    const stopBtn = shadow.getElementById('stopButton');
    const askAI = shadow.getElementById('askAIButton');
    const exportBtn = shadow.getElementById('exportDBButton');
    const exportLogsBtn = shadow.getElementById('exportLogsButton');
    const autoSwitch = shadow.getElementById('autoModeSwitch');
    const autoAISwitch = shadow.getElementById('autoAISwitch');
    const manualSwitch = shadow.getElementById('manualModeSwitch');
    const delayInputs = shadow.querySelectorAll('input[type="number"]');
    const gradeRadios = shadow.querySelectorAll('input[name="targetGrade"]');

    if (isLocked) {
        [startBtn, askAI, exportBtn, autoSwitch, autoAISwitch, manualSwitch, ...delayInputs, ...gradeRadios].forEach(el => {
            if (el) el.disabled = true;
        });
        if (stopBtn) {
            stopBtn.disabled = false;
            stopBtn.style.backgroundColor = '#f44336';
        }
        if (exportLogsBtn) {
            exportLogsBtn.disabled = false;
            exportLogsBtn.style.backgroundColor = '#9C27B0';
            exportLogsBtn.style.cursor = 'pointer';
        }
    } else {
        [startBtn, stopBtn, askAI, exportBtn, exportLogsBtn, autoSwitch, autoAISwitch, manualSwitch, ...delayInputs, ...gradeRadios].forEach(el => {
            if (el) el.disabled = false;
        });
        if (startBtn) startBtn.style.backgroundColor = '#4CAF50';
        if (stopBtn) stopBtn.style.backgroundColor = '#cccccc';
        if (exportLogsBtn) exportLogsBtn.style.backgroundColor = '#9C27B0';
    }
};

window.setAIButtonState = function(locked) {
    window.isAIButtonLocked = locked;
    const modalHost = document.getElementById('extensionModal');
    if (!modalHost?.shadowRoot) return;

    const shadow = modalHost.shadowRoot;
    const askAIButton = shadow.getElementById('askAIButton');
    const exportDBButton = shadow.getElementById('exportDBButton');

    if (askAIButton) {
        askAIButton.disabled = locked;
        askAIButton.style.backgroundColor = locked ? '#cccccc' : '#2196F3';
        askAIButton.style.cursor = locked ? 'not-allowed' : 'pointer';
    }
    if (exportDBButton) {
        exportDBButton.disabled = locked;
        exportDBButton.style.backgroundColor = locked ? '#cccccc' : '#4CAF50';
        exportDBButton.style.cursor = locked ? 'not-allowed' : 'pointer';
    }
};

if (!window.buttonListenerSet) {
    window.setupNextButtonListener();
    window.buttonListenerSet = true;
    window.addEventListener('beforeunload', window.beforeUnloadHandler);
}