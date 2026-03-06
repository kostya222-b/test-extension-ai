window.findButtonByText = function(text, containerSelector = window.selectors.questionButtons) {
    const container = document.querySelector(containerSelector);
    if (!container) return null;
    const buttons = container.querySelectorAll('button');
    for (const button of buttons) {
        const label = button.querySelector('.mdc-button__label, span.mdc-button__label') || button;
        const buttonText = label.textContent?.trim() || '';
        if (window.normalizeText(buttonText) === window.normalizeText(text)) return button;
    }
    return null;
};

window.getQuestionTypeFromPage = function() {
    const typeElement = document.querySelector(window.selectors.questionType);
    return typeElement?.textContent?.trim() || null;
};

window.getAnswerOptionsFromPage = function() {
    const answerSpans = document.querySelectorAll(window.selectors.answerOptions);
    if (!answerSpans.length) return null;
    return Array.from(answerSpans).map(span => span.textContent?.trim()).filter(Boolean);
};

window.highlightCorrectAnswers = function(selectedOptions) {
    document.querySelectorAll(window.selectors.answerOptions).forEach(span => {
        span.style.backgroundColor = '';
        if (selectedOptions.includes(span.textContent?.trim())) {
            span.style.backgroundColor = '#ffaaaa';
            span.style.transition = 'background-color 0.5s ease';
        }
    });
};

window.handleAskAI = function() {
    window.sendLogToBackground("Кнопка 'Спросить ИИ' нажата");
    const questionElement = document.querySelector(window.selectors.questionTitle);
    if (!questionElement) { window.sendLogToBackground("Не найден вопрос"); return; }
    const question = questionElement.textContent?.trim();
    if (!question) { window.sendLogToBackground("Пустой вопрос"); return; }
    const questionType = window.getQuestionTypeFromPage();
    const isMultipleChoice = questionType?.includes("НЕСКОЛЬКО");
    const answerOptions = window.getAnswerOptionsFromPage();
    if (!answerOptions || !answerOptions.length) { window.sendLogToBackground("Нет вариантов"); return; }
    
    window.setAIButtonState(true);
    window.askAI(question, answerOptions, isMultipleChoice)
    .then(selectedOptions => {
        if (selectedOptions.length) window.highlightCorrectAnswers(selectedOptions);
        else window.setLoadingIndicator(true, false, "Нет ответа от ИИ");
    })
    .catch(error => {
        window.sendLogToBackground("Ошибка ИИ: ", error);
        window.setLoadingIndicator(true, false, "Ошибка ИИ");
    })
    .finally(() => window.setAIButtonState(window.isLocked));
};

window.highlightCorrectAnswersManual = function(result, answers) {
    if (!result?.length || !answers?.length) {
        window.sendLogToBackground("Нет данных");
        window.setLoadingIndicator(true, false);
        return;
    }
    answers.forEach(answer => {
        answer.style.backgroundColor = "";
        const answerText = answer.textContent?.trim();
        if (!answerText) return;
        const normalizedAnswer = window.normalizeText(answerText);
        const isCorrect = result.some(r => window.normalizeText(r) === normalizedAnswer);
        if (isCorrect) answer.style.backgroundColor = "#90EE90";
    });
};

// ИСПРАВЛЕННАЯ ФУНКЦИЯ ДЛЯ РУЧНОГО РЕЖИМА
window.handleNextQuestion = async function() {
    if (window.isStopped) { window.sendLogToBackground("Остановлено"); return; }
    
    const questionElement = document.querySelector(window.selectors.questionTitle);
    if (!questionElement) { window.sendLogToBackground("Не найден вопрос"); return; }
    
    const question = questionElement.textContent?.trim();
    if (!question) { window.sendLogToBackground("Пустой вопрос"); return; }
    
    window.sendLogToBackground("Вопрос: ", question);
    const normalizedQuestion = window.normalizeQuestionText(question);
    
    if (window.isStopped) return;
    
    // ВЫЗЫВАЕМ fetchAnswers ИЗ api.js
    const result = await window.fetchAnswers(normalizedQuestion);
    
    if (window.isStopped) return;
    
    window.sendLogToBackground("Ответ: ", result);
    if (!result || !result.length) {
        window.sendLogToBackground("Нет ответов");
        window.setLoadingIndicator(true, false);
        return;
    }
    
    const answers = Array.from(document.getElementsByClassName('question-inner-html-text'));
    if (!answers.length) { window.sendLogToBackground("Нет вариантов"); return; }
    
    if (window.isStopped) return;
    
    // ПОДСВЕЧИВАЕМ ПРАВИЛЬНЫЕ ОТВЕТЫ
    window.highlightCorrectAnswersManual(result, answers);
};

// ИСПРАВЛЕНО: Не вызываем stopScript() при клике на "Завершить тестирование" в режиме auto_ai
window.setupNextButtonListener = function() {
    document.addEventListener('click', async (event) => {
        let target = event.target;
        while (target && target !== document) {
            const buttonText = target.textContent?.trim() || target.querySelector?.('.mdc-button__label')?.textContent?.trim();
            
            // ИСПРАВЛЕНО: Не останавливаем скрипт при завершении теста в режиме auto_ai
            if (buttonText === "Завершить тестирование") {
                if (window.currentMode === 'auto_ai') {
                    window.sendLogToBackground("Завершение теста в auto_ai - не останавливаем скрипт");
                    // Скрипт продолжит работу через executeAutoAIModeLogic
                } else {
                    window.stopScript();
                }
                return;
            }
             
            if (buttonText === "Следующий вопрос" && window.isStopped) {
                window.sendLogToBackground("Остановлено - игнор");
                return;
            }
            
            // ДЛЯ РУЧНОГО РЕЖИМА: При клике на "Следующий вопрос" запрашиваем ответ
            if (buttonText === "Следующий вопрос" && !window.isStopped && window.currentMode === 'manual') {
                await window.handleNextQuestion();
                return;
            }
            
            target = target.parentElement;
        }
    });
};