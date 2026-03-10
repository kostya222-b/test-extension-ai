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

// ✅ СОХРАНЕНИЕ: Supabase + локальный кэш
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
        if (supabaseResult && supabaseResult.answers && Array.isArray(supabaseResult.answers) && supabaseResult.answers.length > 0) {
            return [{
                questionHash: window.getQuestionHash(question),
                question,
                selectedAnswers: supabaseResult.answers,
                isCorrect: supabaseResult.is_correct,
                id: supabaseResult.id,  // ← СОХРАНЯЕМ ID ИЗ СЕРВЕРА!
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

// =====================================================================
// === ПРОВЕРКА РЕЗУЛЬТАТОВ ТЕСТА И ОЦЕНКИ ===
// =====================================================================
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
                            
                            // ✅ ПРОВЕРКА: есть ли id у записи
                            if (!record.id) {
                                window.sendLogToBackground(`⚠️ У записи нет id, пропускаем обновление: ${questionText.substring(0, 50)}...`);
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
                                
                                // ✅ ОТПРАВЛЯЕМ ЗАПРОС НА ОБНОВЛЕНИЕ НА СЕРВЕР
                                try {
                                    await window.updateAnswerStatusOnServer(record.id, isCorrectFromPage);
                                } catch (error) {
                                    window.sendLogToBackground(`❌ Ошибка обновления на сервере #${record.id}: ${error.message}`);
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
                    window.sendLogToBackground("⚠️ Ошибка обработки вопроса:", e);
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
                window.sendLogToBackground("⚠️ Кнопка возврата не найдена");
                const anyReturnBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Вернуться'));
                if (anyReturnBtn) {
                    await window.simulateClick(anyReturnBtn);
                } else {
                    window.stopScript(true);
                }
            }
        }
    } else {
        window.sendLogToBackground("⚠️ Не удалось автоматически определить оценку");
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
        if (result.maxReloadAttempts !== undefined) window.maxReloadAttempts = result.maxReloadAttempts;
        if (result.currentReloadCount !== undefined) window.currentReloadCount = result.currentReloadCount;

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

window.setLoadingIndicator = function(show, hasAnswers = true, message = null, countdownSeconds = null) {
    const modalHost = document.getElementById('extensionModal');
    if (!modalHost?.shadowRoot) return;
    const shadow = modalHost.shadowRoot;
    const loaderContainer = shadow.getElementById('loadingIndicatorContainer');
    if (!loaderContainer) return;
    
    if (window.countdownInterval) {
        clearInterval(window.countdownInterval);
        window.countdownInterval = null;
    }
    
    if (show) {
        loaderContainer.innerHTML = '';
        if (countdownSeconds && countdownSeconds > 0) {
            const countdownText = document.createElement('span');
            countdownText.textContent = 'Ожидание: ';
            countdownText.style.cssText = 'font-size: 13px; color: #666; font-weight: 500; margin-right: 4px;';
            const countdownSpan = document.createElement('span');
            countdownSpan.id = 'countdownText';
            countdownSpan.style.cssText = 'font-size: 13px; color: #4CAF50; font-weight: 600;';
            countdownSpan.textContent = `${countdownSeconds} сек`;
            loaderContainer.appendChild(countdownText);
            loaderContainer.appendChild(countdownSpan);
            let remainingTime = countdownSeconds;
            window.countdownInterval = setInterval(() => {
                remainingTime--;
                if (remainingTime <= 0) {
                    clearInterval(window.countdownInterval);
                    window.countdownInterval = null;
                    loaderContainer.innerHTML = '';
                } else {
                    const currentCountdown = shadow.getElementById('countdownText');
                    if (currentCountdown) currentCountdown.textContent = `${remainingTime} сек`;
                }
            }, 1000);
        } else {
            if (message) {
                const messageText = document.createElement('span');
                messageText.textContent = message;
                messageText.style.cssText = `font-size: 13px; color: ${hasAnswers ? '#666' : '#f44336'}; font-weight: 500;`;
                loaderContainer.appendChild(messageText);
            } else if (hasAnswers) {
                const loaderText = document.createElement('span');
                loaderText.textContent = 'Обращение к серверу...';
                loaderText.style.cssText = 'margin-right: 8px; font-size: 13px; color: #666; font-weight: 500;';
                const loader = document.createElement('div');
                loader.id = 'loadingIndicator';
                loader.style.cssText = 'width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.2); border-radius: 50%; border-top-color: #4CAF50; animation: spin 1s ease-in-out infinite;';
                const style = document.createElement('style');
                style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                shadow.appendChild(style);
                loaderContainer.appendChild(loaderText);
                loaderContainer.appendChild(loader);
            } else {
                const noAnswersText = document.createElement('span');
                noAnswersText.textContent = 'Нет ответов';
                noAnswersText.style.cssText = 'font-size: 13px; color: #f44336; font-weight: 500;';
                loaderContainer.appendChild(noAnswersText);
            }
        }
    } else {
        loaderContainer.innerHTML = '';
    }
};

window.showModal = function() {
    const existingModal = document.getElementById('extensionModal');
    if (existingModal) existingModal.remove();
    
    const modalHost = document.createElement('div');
    modalHost.id = 'extensionModal';
    modalHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; display: block; background-color: rgba(0, 0, 0, 0); pointer-events: none;';
    
    const shadowRoot = modalHost.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
        #modalContent { 
            background-color: white; 
            padding: 12px; 
            border-radius: 10px; 
            width: 340px;
            max-width: 95%; 
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); 
            position: absolute; 
            left: 50%; 
            top: 50%; 
            transform: translate(-50%, -50%); 
            pointer-events: auto; 
            cursor: default; 
            min-height: 520px;
            display: flex; 
            flex-direction: column; 
            resize: both; 
            overflow: auto; 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        #modalHeader { 
            cursor: move; 
            padding: 6px 8px; 
            margin: -12px -12px 8px -12px; 
            border-bottom: 1px solid #eee; 
            user-select: none; 
            display: flex; 
            align-items: center; 
            justify-content: space-between; 
            position: sticky; 
            top: 0; 
            background-color: #f8f9fa; 
            z-index: 10; 
            border-radius: 10px 10px 0 0;
            font-size: 14px;
            font-weight: 600;
            color: #333;
        }
        #loadingIndicatorContainer { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            padding: 4px; 
            margin: 0 -12px 6px -12px; 
            background-color: #f9f9f9; 
            border-radius: 4px; 
            border: 1px solid #eee; 
            min-height: 24px; 
            font-size: 12px;
        }
        .mode-switch { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            margin-bottom: 6px; 
            padding: 6px 8px; 
            background-color: #f5f5f5; 
            border-radius: 4px; 
            border: 1px solid #ddd; 
        }
        button { 
            padding: 6px; 
            margin-top: 4px; 
            cursor: pointer; 
            border: none; 
            border-radius: 4px; 
            width: 100%; 
            margin-bottom: 4px; 
            font-size: 13px; 
            font-weight: 600; 
            transition: all 0.2s; 
        }
        button:hover:not(:disabled) { 
            opacity: 0.9; 
            transform: translateY(-1px); 
            box-shadow: 0 1px 3px rgba(0,0,0,0.2); 
        }
        button:disabled { 
            background-color: #e0e0e0; 
            cursor: not-allowed; 
            opacity: 0.6; 
        }
        #startButton:not(:disabled) { 
            background-color: #4CAF50; 
            color: white; 
        }
        #stopButton { 
            background-color: #f44336; 
            color: white; 
        }
        #askAIButton { 
            background-color: #2196F3; 
            color: white; 
        }
        #exportDBButton { 
            background-color: #4CAF50; 
            color: white;  
        }
        #exportLogsButton { 
            background-color: #9C27B0; 
            color: white; 
        }
        #closeButton { 
            background-color: #9E9E9E; 
            color: white; 
        }
        .toggle-switch { 
            position: relative; 
            display: inline-block; 
            width: 40px; 
            height: 20px; 
        }
        .toggle-switch input { 
            opacity: 0; 
            width: 0; 
            height: 0; 
        }
        .toggle-switch .slider { 
            position: absolute; 
            cursor: pointer; 
            top: 0; 
            left: 0; 
            right: 0; 
            bottom: 0; 
            background-color: #ccc; 
            transition: .3s; 
            border-radius: 20px; 
        }
        .toggle-switch .slider:before { 
            position: absolute; 
            content: " "; 
            height: 14px; 
            width: 14px; 
            left: 3px; 
            bottom: 3px; 
            background-color: white; 
            transition: .3s; 
            border-radius: 50%; 
        }
        input:checked + .slider { 
            background-color: #4CAF50; 
        }
        input:checked + .slider:before { 
            transform: translateX(20px); 
        }
        #resizeHandle {   
            position: absolute; 
            bottom: 0; 
            right: 0; 
            width: 10px; 
            height: 10px; 
            background: linear-gradient(135deg, #ccc 50%, transparent 50%); 
            cursor: nwse-resize; 
            z-index: 20; 
        }
    `;

    const modalContent = document.createElement('div');
    modalContent.id = 'modalContent';
    modalContent.innerHTML = `
        <div id="modalHeader">⚙️ Параметры</div>
        <div id="loadingIndicatorContainer"></div>
        
        <div class="mode-switch">
            <label for="manualModeSwitch" style="font-size: 13px; font-weight: 600; color: #333;">Ручной режим</label>
            <label class="toggle-switch">
                <input type="checkbox" id="manualModeSwitch">
                <span class="slider"></span>
            </label>
        </div>
        
        <div class="mode-switch">
            <label for="autoModeSwitch" style="font-size: 13px; font-weight: 600; color: #333;">Автоматический режим</label>
            <label class="toggle-switch">
                <input type="checkbox" id="autoModeSwitch">
                <span class="slider"></span>
            </label>
        </div>
        
        <div class="mode-switch">
            <label for="autoAISwitch" style="font-size: 13px; font-weight: 600; color: #333;">Автоподбор с ИИ</label>
            <label class="toggle-switch">
                <input type="checkbox" id="autoAISwitch">
                <span class="slider"></span>
            </label>
        </div>

        <button id="startButton">🚀 Запустить</button>
        <button id="stopButton">⏹️ Остановить</button>
        <button id="askAIButton">🤖 Спросить ИИ</button>
        <button id="exportDBButton">📤 Выгрузить БД</button>
        <button id="exportLogsButton">📥 Выгрузить лог</button>
        <button id="closeButton">❌ Закрыть</button>
        <div id="resizeHandle"></div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(modalContent);
    document.body.appendChild(modalHost);

    const modalHeader = shadowRoot.getElementById('modalHeader');
    const modalContentElement = shadowRoot.getElementById('modalContent');
    let isDragging = false;
    let offsetX, offsetY;

    modalHeader.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = modalContentElement.getBoundingClientRect();
        modalContentElement.style.left = `${rect.left}px`;
        modalContentElement.style.top = `${rect.top}px`;
        modalContentElement.style.transform = 'none';
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        modalContentElement.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        modalContentElement.style.left = `${e.clientX - offsetX}px`;
        modalContentElement.style.top = `${e.clientY - offsetY}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        modalContentElement.style.cursor = 'default';
        chrome.storage.local.set({ modalPosition: { left: modalContentElement.style.left, top: modalContentElement.style.top } });
    });

    const resizeHandle = shadowRoot.getElementById('resizeHandle');
    let isResizing = false;
    let startWidth, startHeight;

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startWidth = modalContentElement.offsetWidth;
        startHeight = modalContentElement.offsetHeight;
        e.preventDefault();
        modalContentElement.style.cursor = 'nwse-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        let width = startWidth + e.movementX;
        let height = startHeight + e.movementY;
        width = Math.max(width, 280);
        height = Math.max(height, 440);
        modalContentElement.style.width = `${width}px`;
        modalContentElement.style.height = `${height}px`;
        startWidth = width;
        startHeight = height;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        modalContentElement.style.cursor = 'default';
        chrome.storage.local.set({ modalWidth: modalContentElement.style.width, modalHeight: modalContentElement.style.height });
    });

    const manualModeSwitch = shadowRoot.getElementById('manualModeSwitch');
    const autoModeSwitch = shadowRoot.getElementById('autoModeSwitch');
    const autoAISwitch = shadowRoot.getElementById('autoAISwitch');
    const startButton = shadowRoot.getElementById('startButton');
    const stopButton = shadowRoot.getElementById('stopButton');
    const askAIButton = shadowRoot.getElementById('askAIButton');
    const exportDBButton = shadowRoot.getElementById('exportDBButton');
    const exportLogsButton = shadowRoot.getElementById('exportLogsButton');
    const closeButton = shadowRoot.getElementById('closeButton');

    const updateModeSwitches = (source) => {
        if (source === 'manual' && manualModeSwitch.checked) {
            autoModeSwitch.checked = false;
            autoAISwitch.checked = false;
        } else if (source === 'auto' && autoModeSwitch.checked) {
            manualModeSwitch.checked = false;
            autoAISwitch.checked = false;
        } else if (source === 'ai' && autoAISwitch.checked) {
            manualModeSwitch.checked = false;
            autoModeSwitch.checked = false;
        }
        
        let mode = 'manual';
        if (autoModeSwitch.checked) mode = 'auto';
        else if (autoAISwitch.checked) mode = 'auto_ai';
        
        window.isStopped = false;
        chrome.storage.local.set({ mode, isStopped: false });
        window.updateModalButtonState(window.isLocked);
    };

    manualModeSwitch.addEventListener('change', () => updateModeSwitches('manual'));
    autoModeSwitch.addEventListener('change', () => updateModeSwitches('auto'));
    autoAISwitch.addEventListener('change', () => updateModeSwitches('ai'));

    startButton.addEventListener('click', () => {
        if (!manualModeSwitch.checked && !autoModeSwitch.checked && !autoAISwitch.checked) {
            alert('Ошибка: Не выбран ни один режим работы!');
            return;
        }

        let mode = 'manual';
        if (autoModeSwitch.checked) mode = 'auto';
        else if (autoAISwitch.checked) mode = 'auto_ai';
        
        const delayMin = 3;
        const delayMax = 6;
        const nextDelayMin = 1;
        const nextDelayMax = 4;
        
        window.isStopped = false;
        window.isLocked = true;
        window.updateModalButtonState(true);
        window.setAIButtonState(true);
        
        chrome.storage.local.set({ 
            isLocked: true, isStopped: false, mode: mode, 
            delayMin, delayMax, nextDelayMin, nextDelayMax
        }, () => {
            chrome.runtime.sendMessage({ action: "startScript", mode, delayMin, delayMax, nextDelayMin, nextDelayMax });
        });
    });

    stopButton.addEventListener('click', () => {
        if (window.countdownInterval) {
            clearInterval(window.countdownInterval);
            window.countdownInterval = null;
        }
        window.stopScript(true, true);
        window.updateModalButtonState(false);
        window.setAIButtonState(false);
    });

    if (askAIButton) askAIButton.addEventListener('click', () => {
        if (window.handleAskAI) window.handleAskAI();
    });
    
    if (exportDBButton) exportDBButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "exportDB" });
    });
    
    if (exportLogsButton) exportLogsButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "exportLogs" });
    });

    closeButton.addEventListener('click', () => {
        if (window.countdownInterval) {
            clearInterval(window.countdownInterval);
            window.countdownInterval = null;
        }
        modalHost.style.display = 'none';
        window.isModalVisible = false;
        chrome.storage.local.set({ modalVisible: false });
    });

    chrome.storage.local.get(['mode', 'modalPosition', 'modalWidth', 'modalHeight'], (result) => {
        const mode = result.mode || 'manual';
        manualModeSwitch.checked = mode === 'manual';
        autoModeSwitch.checked = mode === 'auto';
        autoAISwitch.checked = mode === 'auto_ai';
        
        if (result.modalPosition) {
            modalContentElement.style.left = result.modalPosition.left;
            modalContentElement.style.top = result.modalPosition.top;
            modalContentElement.style.transform = 'none';
        }
        if (result.modalWidth) modalContentElement.style.width = result.modalWidth;
        if (result.modalHeight) modalContentElement.style.height = result.modalHeight;
        
        window.updateModalButtonState(window.isLocked);
        window.setAIButtonState(window.isLocked);
    });

    window.isModalVisible = true;
    chrome.storage.local.set({ modalVisible: true });
};

if (!window.buttonListenerSet) {
    window.buttonListenerSet = true;
    window.addEventListener('beforeunload', window.beforeUnloadHandler);
}

// =====================================================================
// === ЗАГЛУШКИ ДЛЯ НЕСУЩЕСТВУЮЩИХ ФУНКЦИЙ ===
// =====================================================================
window.handleAskAI = window.handleAskAI || function() {};
window.handleNextQuestion = window.handleNextQuestion || function() {};
window.executeModeLogic = window.executeModeLogic || async function() {};
window.autoStartTestFlow = window.autoStartTestFlow || async function() {};
window.setupQuestionObserver = window.setupQuestionObserver || function() {};
window.stopScript = window.stopScript || function() {};
window.exportDatabase = window.exportDatabase || async function() {};
window.closeResultsModal = window.closeResultsModal || async function() {};