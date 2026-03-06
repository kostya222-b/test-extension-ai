if (!window.__modalScriptLoaded) {
window.__modalScriptLoaded = true;
window.selectors = {
    questionTitle: '.question-title-text',
    questionButtons: '.question-buttons.ng-star-inserted',
    questionType: 'div.mat-card-question__type',
    answerOptions: 'span.question-inner-html-text',
    modalHostId: 'extensionModal',
};
if (typeof window.countdownInterval === 'undefined') window.countdownInterval = null;

const validateDelayInputs = (minInput, maxInput, errorContainer) => {
    const minVal = parseInt(minInput.value) || 0;
    const maxVal = parseInt(maxInput.value) || 0;
    minInput.style.borderColor = '#ccc';
    maxInput.style.borderColor = '#ccc';
    if (errorContainer) errorContainer.textContent = '';

    if (minVal > maxVal) {
        minInput.style.borderColor = '#f44336';
        maxInput.style.borderColor = '#f44336';
        if (errorContainer) {
            errorContainer.textContent = '  Мин > Макс';
            errorContainer.style.color = '#f44336';
            errorContainer.style.fontSize = '11px';
            errorContainer.style.marginTop = '2px';
        }
        return false;
    }
    return true;
};

const saveDelaySettings = (modalDelayInputMin, modalDelayInputMax, modalNextDelayInputMin, modalNextDelayInputMax) => {
    const delayMin = parseInt(modalDelayInputMin.value) || 3;
    const delayMax = parseInt(modalDelayInputMax.value) || 6;
    const nextDelayMin = parseInt(modalNextDelayInputMin.value) || 1;
    const nextDelayMax = parseInt(modalNextDelayInputMax.value) || 4;
    chrome.storage.local.set({ delayMin, delayMax, nextDelayMin, nextDelayMax });
};

const saveTargetGrade = (grade) => {
    chrome.storage.local.set({ targetGrade: grade });
};

// НОВАЯ: Сохранение лимита перезагрузок
const saveReloadAttempts = (reloadAttemptsInput, reloadAttemptsError) => {
    const value = parseInt(reloadAttemptsInput.value) || 3;
    if (value < 1 || value > 10) {
        reloadAttemptsInput.style.borderColor = '#f44336';
        if (reloadAttemptsError) {
            reloadAttemptsError.textContent = '  От 1 до 10';
            reloadAttemptsError.style.color = '#f44336';
            reloadAttemptsError.style.fontSize = '11px';
            reloadAttemptsError.style.marginTop = '2px';
        }
        return false;
    }
    reloadAttemptsInput.style.borderColor = '#ccc';
    if (reloadAttemptsError) reloadAttemptsError.textContent = '';
    chrome.storage.local.set({ maxReloadAttempts: value });
    return true;
};

// ФУНКЦИЯ ОБНОВЛЕНИЯ ВИДИМОСТИ ПОЛЕЙ
const updateFieldVisibility = function() {
    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (!modalHost?.shadowRoot) return;
    const { shadowRoot } = modalHost;
    const manualModeSwitch = shadowRoot.getElementById('manualModeSwitch');
    const autoModeSwitch = shadowRoot.getElementById('autoModeSwitch');
    const autoAISwitch = shadowRoot.getElementById('autoAISwitch');

    const gradeContainer = shadowRoot.getElementById('gradeSelectionContainer');
    const modalDelayContainer = shadowRoot.getElementById('modalDelayContainer');
    const modalNextDelayContainer = shadowRoot.getElementById('modalNextDelayContainer');
    // НОВОЕ ПОЛЕ: Контейнер лимита перезагрузок
    const reloadAttemptsContainer = shadowRoot.getElementById('reloadAttemptsContainer');

    // ЖЕЛАЕМАЯ ОЦЕНКА: ТОЛЬКО для auto_ai
    if (gradeContainer) {
        gradeContainer.style.display = autoAISwitch?.checked ? 'block' : 'none';
    }

    // ЗАДЕРЖКИ: Для auto И auto_ai (НО НЕ для manual)
    if (modalDelayContainer && modalNextDelayContainer) {
        const showDelays = autoModeSwitch?.checked || autoAISwitch?.checked;
        modalDelayContainer.style.display = showDelays ? 'block' : 'none';
        modalNextDelayContainer.style.display = showDelays ? 'block' : 'none';
    }

    // ЛИМИТ ПЕРЕЗАГРУЗОК: ТОЛЬКО для auto_ai
    if (reloadAttemptsContainer) {
        reloadAttemptsContainer.style.display = autoAISwitch?.checked ? 'block' : 'none';
    }
};

// ФУНКЦИЯ ОБНОВЛЕНИЯ СТАТУСА РАБОТЫ
const updateWorkingStatus = function() {
    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (!modalHost?.shadowRoot) return;
    const { shadowRoot } = modalHost;
    const statusContainer = shadowRoot.getElementById('workingStatusContainer');
    if (!statusContainer) return;

    chrome.storage.local.get(['isLocked', 'isStopped'], (result) => {
        if (result.isLocked && !result.isStopped) {
            statusContainer.style.display = 'block';
            statusContainer.textContent = '⏳ Ожидайте, расширение работает...';
        } else {
            statusContainer.style.display = 'none';
            statusContainer.textContent = '';
        }
    });
};

window.setLoadingIndicator = function(show, hasAnswers = true, message = null, countdownSeconds = null) {
    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (!modalHost?.shadowRoot) return;
    const { shadowRoot } = modalHost;
    const loaderContainer = shadowRoot.getElementById('loadingIndicatorContainer');
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
                    const currentCountdown = shadowRoot.getElementById('countdownText');
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
                shadowRoot.appendChild(style);
                
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

window.setAIButtonState = function(locked) {
    window.isAIButtonLocked = locked;
    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (!modalHost?.shadowRoot) return;
    const { shadowRoot } = modalHost;
    const askAIButton = shadowRoot.getElementById('askAIButton');
    const exportDBButton = shadowRoot.getElementById('exportDBButton');
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

window.updateModalButtonState = function(isLocked) {
    const modalHost = document.getElementById(window.selectors.modalHostId);
    if (!modalHost?.shadowRoot) return;
    const { shadowRoot } = modalHost;
    const startButton = shadowRoot.getElementById('startButton');
    const stopButton = shadowRoot.getElementById('stopButton');
    const askAIButton = shadowRoot.getElementById('askAIButton');
    const exportDBButton = shadowRoot.getElementById('exportDBButton');
    const exportLogsButton = shadowRoot.getElementById('exportLogsButton');

    const manualModeSwitch = shadowRoot.getElementById('manualModeSwitch');
    const autoModeSwitch = shadowRoot.getElementById('autoModeSwitch');
    const autoAISwitch = shadowRoot.getElementById('autoAISwitch');

    const gradeContainer = shadowRoot.getElementById('gradeSelectionContainer');
    const gradeRadios = shadowRoot.querySelectorAll('input[name="targetGrade"]');

    const modalDelayContainer = shadowRoot.getElementById('modalDelayContainer');
    const modalNextDelayContainer = shadowRoot.getElementById('modalNextDelayContainer');
    const modalDelayInputMin = shadowRoot.getElementById('modalDelayInputMin');
    const modalDelayInputMax = shadowRoot.getElementById('modalDelayInputMax');
    const modalNextDelayInputMin = shadowRoot.getElementById('modalNextDelayInputMin');
    const modalNextDelayInputMax = shadowRoot.getElementById('modalNextDelayInputMax');

    // НОВОЕ ПОЛЕ: Инпуты лимита перезагрузок
    const reloadAttemptsInput = shadowRoot.getElementById('reloadAttemptsInput');
    const reloadAttemptsError = shadowRoot.getElementById('reloadAttemptsError');

    if (startButton) {
        startButton.disabled = isLocked;
        startButton.style.backgroundColor = isLocked ? '#cccccc' : '#4CAF50';
        startButton.style.cursor = isLocked ? 'not-allowed' : '';
    }
    if (stopButton) {
        stopButton.disabled = !isLocked;
        stopButton.style.backgroundColor = isLocked ? '#f44336' : '#cccccc';
    }
    if (askAIButton) {
        askAIButton.disabled = isLocked;
        askAIButton.style.backgroundColor = isLocked ? '#cccccc' : '#2196F3';
        askAIButton.style.cursor = isLocked ? 'not-allowed' : 'pointer';
    }
    if (exportDBButton) {
        exportDBButton.disabled = isLocked;
        exportDBButton.style.backgroundColor = isLocked ? '#cccccc' : '#4CAF50';
        exportDBButton.style.cursor = isLocked ? 'not-allowed' : 'pointer';
    }
    if (exportLogsButton) {
        exportLogsButton.disabled = false;
        exportLogsButton.style.backgroundColor = '#9C27B0';
        exportLogsButton.style.cursor = 'pointer';
    }

    if (manualModeSwitch) manualModeSwitch.disabled = isLocked;
    if (autoModeSwitch) autoModeSwitch.disabled = isLocked;
    if (autoAISwitch) autoAISwitch.disabled = isLocked;

    updateFieldVisibility();

    const inputsDisabled = isLocked;

    if (modalDelayInputMin) modalDelayInputMin.disabled = inputsDisabled;
    if (modalDelayInputMax) modalDelayInputMax.disabled = inputsDisabled;
    if (modalNextDelayInputMin) modalNextDelayInputMin.disabled = inputsDisabled;
    if (modalNextDelayInputMax) modalNextDelayInputMax.disabled = inputsDisabled;

    // БЛОКИРОВКА ПОЛЯ ЛИМИТА ПЕРЕЗАГРУЗОК
    if (reloadAttemptsInput) reloadAttemptsInput.disabled = inputsDisabled;

    gradeRadios.forEach(radio => {
        radio.disabled = inputsDisabled;
    });

    updateWorkingStatus();
};

window.createModal = function() {
    let existingModal = document.getElementById(window.selectors.modalHostId);
    if (existingModal) existingModal.remove();
    
    const modalHost = document.createElement('div');
    modalHost.id = window.selectors.modalHostId;
    modalHost.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 999999; display: block; background-color: rgba(0, 0, 0, 0); pointer-events: none;`;

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
        #workingStatusContainer {
            display: none;
            padding: 6px 8px;
            margin: 0 -12px 6px -12px;
            background-color: #fff3cd;
            border-radius: 4px;
            border: 1px solid #ffc107;
            font-size: 12px;
            color: #856404;
            font-weight: 600;
            text-align: center;
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
        .delay-container, .grade-container { 
            padding: 6px 8px; 
            border: 1px solid #ddd; 
            border-radius: 4px; 
            background-color: #fafafa; 
            margin-bottom: 6px; 
            position: relative; 
            transition: all 0.3s ease; 
        }
        .delay-container h4, .grade-container h4 { 
            margin: 0 0 4px 0; 
            font-size: 12px; 
            color: #555; 
            font-weight: 600; 
        }
        .delay-inputs { 
            display: flex; 
            justify-content: space-between;  
            gap: 6px; 
        }
        .delay-inputs input { 
            width: 45%; 
            padding: 4px 6px; 
            border: 1px solid #ccc; 
            border-radius: 3px; 
            font-size: 12px; 
            font-weight: 500; 
            transition: border-color 0.3s; 
        }
        .delay-inputs input:focus { 
            outline: none; 
            border-color: #2196F3; 
            box-shadow: 0 0 0 1px rgba(33, 150, 243, 0.2); 
        }
        .grade-options { 
            display: flex; 
            justify-content: space-around; 
            gap: 8px; 
        }
        .grade-option { 
            display: flex; 
            align-items: center; 
            gap: 4px; 
            cursor: pointer; 
            font-size: 12px;
        }
        .grade-option input { 
            cursor: pointer; 
            margin: 0;
        }
        .grade-option label { 
            cursor: pointer; 
            font-weight: 500; 
            font-size: 12px; 
            color: #333; 
            margin: 0;
        }
        .error-message { 
            position: absolute; 
            bottom: -14px; 
            left: 8px; 
            right: 8px; 
            font-size: 10px; 
            color: #f44336; 
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

    // ДОБАВЛЕНО НОВОЕ ПОЛЕ: reloadAttemptsContainer
    modalContent.innerHTML = `
        <div id="modalHeader">⚙️ Параметры</div>
        <div id="loadingIndicatorContainer"></div>
        <div id="workingStatusContainer"></div>
        
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

        <div id="modalDelayContainer" class="delay-container">
            <h4>⏱️ Задержка выбора ответа (сек):</h4>
            <div class="delay-inputs">
                <input type="number" id="modalDelayInputMin" min="0" max="10" placeholder="От" value="0">
                <input type="number" id="modalDelayInputMax" min="0" max="10" placeholder="До" value="0">
            </div>
            <div id="modalDelayError" class="error-message"></div>
        </div>
        <div id="modalNextDelayContainer" class="delay-container">
            <h4>⏱️ Задержка перехода (сек):</h4>
            <div class="delay-inputs">
                <input type="number" id="modalNextDelayInputMin" min="0" max="10" placeholder="От" value="0">
                <input type="number" id="modalNextDelayInputMax" min="0" max="10" placeholder="До" value="0">
            </div>
            <div id="modalNextDelayError" class="error-message"></div>
        </div>

        <div id="gradeSelectionContainer" class="grade-container">
            <h4>🎯 Желаемая оценка (для ИИ):</h4>
            <div class="grade-options">
                <div class="grade-option">
                    <input type="radio" id="grade3" name="targetGrade" value="3">
                    <label for="grade3">3</label>
                </div>
                <div class="grade-option">
                    <input type="radio" id="grade4" name="targetGrade" value="4">
                    <label for="grade4">4</label>
                </div>
                <div class="grade-option">
                    <input type="radio" id="grade5" name="targetGrade" value="5">
                    <label for="grade5">5</label>
                </div>
            </div>
        </div>

        <!-- НОВОЕ ПОЛЕ: ЛИМИТ ПЕРЕЗАГРУЗОК -->
        <div id="reloadAttemptsContainer" class="grade-container">
            <h4>🔄 Макс. попыток перезагрузки (при ошибках):</h4>
            <div class="delay-inputs">
                <input type="number" id="reloadAttemptsInput" min="1" max="10" placeholder="1-10" value="3">
            </div>
            <div id="reloadAttemptsError" class="error-message"></div>
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
    const modalDelayContainer = shadowRoot.getElementById('modalDelayContainer');
    const modalNextDelayContainer = shadowRoot.getElementById('modalNextDelayContainer');
    const gradeSelectionContainer = shadowRoot.getElementById('gradeSelectionContainer');
    const modalDelayInputMin = shadowRoot.getElementById('modalDelayInputMin');
    const modalDelayInputMax = shadowRoot.getElementById('modalDelayInputMax');
    const modalNextDelayInputMin = shadowRoot.getElementById('modalNextDelayInputMin');
    const modalNextDelayInputMax = shadowRoot.getElementById('modalNextDelayInputMax');
    const modalDelayError = shadowRoot.getElementById('modalDelayError');
    const modalNextDelayError = shadowRoot.getElementById('modalNextDelayError');
    const gradeRadios = shadowRoot.querySelectorAll('input[name="targetGrade"]');
    
    // НОВОЕ ПОЛЕ: Элементы лимита перезагрузок
    const reloadAttemptsContainer = shadowRoot.getElementById('reloadAttemptsContainer');
    const reloadAttemptsInput = shadowRoot.getElementById('reloadAttemptsInput');
    const reloadAttemptsError = shadowRoot.getElementById('reloadAttemptsError');

    const setupValidation = (minInput, maxInput, errorContainer) => {
        const onBlur = () => {
            validateDelayInputs(minInput, maxInput, errorContainer);
            saveDelaySettings(modalDelayInputMin, modalDelayInputMax, modalNextDelayInputMin, modalNextDelayInputMax);
        };
        const onKeyPress = (e) => { if (e.key === 'Enter') validateDelayInputs(minInput, maxInput, errorContainer); };
        minInput.addEventListener('blur', onBlur);
        minInput.addEventListener('keypress', onKeyPress);
        maxInput.addEventListener('blur', onBlur);
        maxInput.addEventListener('keypress', onKeyPress);
    };
    setupValidation(modalDelayInputMin, modalDelayInputMax, modalDelayError);
    setupValidation(modalNextDelayInputMin, modalNextDelayInputMax, modalNextDelayError);

    gradeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) saveTargetGrade(parseInt(radio.value));
        });
    });

    // ОБРАБОТЧИК ДЛЯ НОВОГО ПОЛЯ
    if (reloadAttemptsInput && reloadAttemptsError) {
        reloadAttemptsInput.addEventListener('blur', () => saveReloadAttempts(reloadAttemptsInput, reloadAttemptsError));
        reloadAttemptsInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') saveReloadAttempts(reloadAttemptsInput, reloadAttemptsError);
        });
    }

    chrome.storage.local.get(['mode', 'isStopped', 'delayMin', 'delayMax', 'nextDelayMin', 'nextDelayMax', 'isLocked', 'modalVisible', 'modalPosition', 'modalWidth', 'modalHeight', 'targetGrade', 'maxReloadAttempts'], (result) => {
        const mode = result.mode || 'manual';
        manualModeSwitch.checked = mode === 'manual';
        autoModeSwitch.checked = mode === 'auto';
        autoAISwitch.checked = mode === 'auto_ai';
        
        modalDelayInputMin.value = result.delayMin !== undefined ? result.delayMin : 3;
        modalDelayInputMax.value = result.delayMax !== undefined ? result.delayMax : 6;
        modalNextDelayInputMin.value = result.nextDelayMin !== undefined ? result.nextDelayMin : 1;
        modalNextDelayInputMax.value = result.nextDelayMax !== undefined ? result.nextDelayMax : 4;

        if (result.targetGrade) {
            const selectedRadio = shadowRoot.querySelector(`input[name="targetGrade"][value="${result.targetGrade}"]`);
            if (selectedRadio) selectedRadio.checked = true;
        } else {
            const defaultRadio = shadowRoot.querySelector(`input[name="targetGrade"][value="5"]`);
            if (defaultRadio) {
                defaultRadio.checked = true;
                saveTargetGrade(5);
            }
        }

        // ЗАГРУЗКА ЗНАЧЕНИЯ ЛИМИТА ПЕРЕЗАГРУЗОК
        if (reloadAttemptsInput) {
            if (result.maxReloadAttempts !== undefined) {
                reloadAttemptsInput.value = result.maxReloadAttempts;
            } else {
                reloadAttemptsInput.value = 3;
                chrome.storage.local.set({ maxReloadAttempts: 3 });
            }
        }
        
        const isLocked = result.isLocked || false;
        window.updateModalButtonState(isLocked);
        window.setAIButtonState(isLocked);
        
        if (result.modalPosition) {
            modalContentElement.style.left = result.modalPosition.left;
            modalContentElement.style.top = result.modalPosition.top;
            modalContentElement.style.transform = 'none';
        }
        if (result.modalWidth) modalContentElement.style.width = result.modalWidth;
        if (result.modalHeight) modalContentElement.style.height = result.modalHeight;
        
        updateFieldVisibility();
        updateWorkingStatus();
    });

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
        
        updateFieldVisibility();
        
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
            window.setLoadingIndicator(true, false, "Выберите режим");
            return;
        }

        let mode = 'manual';
        if (autoModeSwitch.checked) mode = 'auto';
        else if (autoAISwitch.checked) mode = 'auto_ai';
        
        const delayMin = modalDelayInputMin?.value ? parseInt(modalDelayInputMin.value, 10) : 0;
        const delayMax = modalDelayInputMax?.value ? parseInt(modalDelayInputMax.value, 10) : 0;
        const nextDelayMin = modalNextDelayInputMin?.value ? parseInt(modalNextDelayInputMin.value, 10) : 0;
        const nextDelayMax = modalNextDelayInputMax?.value ? parseInt(modalNextDelayInputMax.value, 10) : 0;
        
        if (mode !== 'manual') {
            if (isNaN(delayMin) || isNaN(delayMax) || isNaN(nextDelayMin) || isNaN(nextDelayMax)) {
                alert('Ошибка: некорректные задержки'); return;
            }
            if (!validateDelayInputs(modalDelayInputMin, modalDelayInputMax, modalDelayError) || 
                !validateDelayInputs(modalNextDelayInputMin, modalNextDelayInputMax, modalNextDelayError)) {
                alert('Ошибка: мин > макс'); return;
            }
        }

        if (mode === 'auto_ai') {
            const selectedGrade = shadowRoot.querySelector('input[name="targetGrade"]:checked');
            if (!selectedGrade) {
                alert('Для режима "Автоподбор с ИИ" необходимо выбрать желаемую оценку (3, 4 или 5)!');
                return;
            }
        }
        
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
        if (window.countdownInterval) { clearInterval(window.countdownInterval); window.countdownInterval = null; }
        [modalDelayInputMin, modalDelayInputMax, modalNextDelayInputMin, modalNextDelayInputMax].forEach(i => i.style.borderColor = '#ccc');
        modalDelayError.textContent = ''; modalNextDelayError.textContent = '';
        if (window.stopScript) window.stopScript(true, true);
        window.updateModalButtonState(false);
        window.setAIButtonState(false);
    });

    if (askAIButton) askAIButton.addEventListener('click', () => { if (window.handleAskAI) window.handleAskAI(); });
    if (exportDBButton) exportDBButton.addEventListener('click', () => { chrome.runtime.sendMessage({ action: "exportDB" }); });
    if (exportLogsButton) exportLogsButton.addEventListener('click', () => { chrome.runtime.sendMessage({ action: "exportLogs" }); });

    closeButton.addEventListener('click', () => {
        if (window.countdownInterval) { clearInterval(window.countdownInterval); window.countdownInterval = null; }
        [modalDelayInputMin, modalDelayInputMax, modalNextDelayInputMin, modalNextDelayInputMax].forEach(i => i.style.borderColor = '#ccc');
        modalDelayError.textContent = ''; modalNextDelayError.textContent = '';
        modalHost.style.display = 'none';
        window.isModalVisible = false;
        chrome.storage.local.set({ modalVisible: false });
    });
};

window.showModal = function() {
    window.isModalVisible = true;
    chrome.storage.local.set({ modalVisible: true });
    window.createModal();
};

}