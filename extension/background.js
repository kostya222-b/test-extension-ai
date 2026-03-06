// background.js
let logBuffer = [];
const MAX_LOGS = 1000;

const logMessage = (source, ...args) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${source}: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}`;
    console.log(logEntry);
    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
};

const downloadFile = (data, filename, type) => {
    try {
        const encodedData = encodeURIComponent(data);
        const dataUrl = `data:${type};charset=utf-8,${encodedData}`;
        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        });
    } catch (error) {
        logMessage('background', 'Ошибка скачивания:', error);
    }
};

chrome.action.onClicked.addListener((tab) => {
    logMessage('background', '🖱️ Клик по иконке');
    
    if (!tab || !tab.id) {
        logMessage('background', '❌ Вкладка не найдена');
        return;
    }
    
    // ✅ ОДНА ПОПЫТКА (если не вышло — значит контент-скрипт не загружен)
    chrome.tabs.sendMessage(tab.id, { action: "toggleModal" }).catch((err) => {
        logMessage('background', '⚠️ Контент-скрипт не отвечает. Проверьте:');
        logMessage('background', '1. Вы на сайте edu.rosminzdrav.ru?');
        logMessage('background', '2. Обновите страницу (F5)');
        logMessage('background', '3. Проверьте manifest.json');
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case "log":
            if (request.args) logMessage('contentScript', ...request.args);
            break;

        case "startScript":
            logMessage('background', '🚀 Запуск скрипта в режиме:', request.mode);
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "startScript",
                        mode: request.mode,
                        delayMin: request.delayMin,
                        delayMax: request.delayMax,
                        nextDelayMin: request.nextDelayMin,
                        nextDelayMax: request.nextDelayMax
                    }).catch((err) => {
                        logMessage('background', '❌ Не удалось отправить команду запуска:', err.message);
                    });
                }
            });
            break;

        case "stopScript":
            chrome.storage.local.set({ shouldResumeAfterReload: false, currentReloadCount: 0 });
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    chrome.tabs.sendMessage(tab.id, { action: "stopScript" }).catch(() => {});
                });
            });
            break;

        case "exportDB":
        case "askAI":
        case "autoAI":
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: request.action });
            });
            break;

        case "downloadDB":
            if (request.csvData) downloadFile(request.csvData, `test_answers_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
            break;

        case "exportLogs":
            const logContent = logBuffer.join('\n');
            downloadFile(logContent, `extension_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`, 'text/plain');
            break;
            
        case "toggleModal":
            break;
    }
    return true;
});