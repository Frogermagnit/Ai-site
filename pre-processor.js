// refiner.js - Универсальный автономный модуль для перефразирования промптов с цензурой
(function (global) {
    'use strict';

    // Вставь сюда свой проверенный ключ OpenRouter
    const SHARED_API_KEY = "СЮДА_ВСТАВЬ_ТВОЙ_ОБЩИЙ_OPENROUTER_КЛЮЧ";

    const SYSTEM_PROMPT = `Ты — ведущий UI/UX архитектор. Твоя цель — преобразовать идею пользователя в технический промпт для генерации дизайна.

ПРАВИЛА ОБРАБОТКИ ТЕКСТА И ЦЕНЗУРЫ:
1. Цензура и Обход мата: Если в запросе пользователя встречается нецензурная лексика, агрессия, мат или грубый сленг, ПОЛНОСТЬЮ игнорируй форму выражения, но извлеки из неё суть идеи. Не вздумай ругаться в ответ или отказываться от работы.
2. Интерпретация: Заменяй эмоциональные или нецензурные выражения на профессиональные UI/UX термины (например, вместо мата по поводу кривой сетки пиши: "требуется радикальная переработка визуальной иерархии и выравнивания элементов", вместо мата про плохие цвета — "необходима оптимизация цветовой палитры для улучшения контрастности").
3. Структура результата: На выходе должен быть только чистый, вежливый и технически детализированный промпт с описанием стиля, сетки, цветов (с HEX-кодами) и типографику (предпочтительно использовать monospace шрифт 'Overpass Mono').
4. Ограничение вывода: Выводи ТОЛЬКО готовый текст промпта без приветствий, вступлений, кавычек вокруг результата и твоих личных комментариев.`;

    const delay = ms => new Promise(res => setTimeout(res, ms));

    /**
     * Универсальная функция для улучшения промпта
     * @param {string} text - Исходный текст пользователя (возможно с матом)
     * @param {function} [onStatusUpdate] - Опциональный колбэк для отслеживания статуса в UI (передает строку)
     * @returns {Promise<{success: boolean, result?: string, error?: string}>}
     */
    async function generateRefinedPrompt(text, onStatusUpdate = () => {}) {
        // Твой оригинальный список моделей без изменений
        const models = [
            'meta-llama/llama-3.2-3b-instruct:free',
            'deepseek/deepseek-v4-flash:free',
            'google/gemma-4-26b-a4b-it:free',
            'openai/gpt-oss-120b:free'
        ];

        const startTime = Date.now();
        const timeoutDuration = 30000; // 30 секунд максимум на весь перебор
        let success = false;
        let attemptCount = 1;
        let lastFailureReason = "";
        let isAuthError = false;

        if (!text || !text.trim()) {
            console.error("PromptRefiner: Передан пустой текст для обработки.");
            return { success: false, error: "Текст запроса пуст." };
        }

        while (Date.now() - startTime < timeoutDuration && !success && !isAuthError) {
            
            for (let i = 0; i < models.length; i++) {
                if (Date.now() - startTime >= timeoutDuration || isAuthError) break;

                const currentModel = models[i];
                const timeLeft = Math.round((timeoutDuration - (Date.now() - startTime)) / 1000);
                const statusMsg = `Попытка [Круг ${attemptCount}] | Модель: ${currentModel.split('/')[1]} | Осталось: ${timeLeft} сек...`;
                
                // Передаем статус наружу, если проект хочет его отображать
                onStatusUpdate(statusMsg);

                try {
                    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SHARED_API_KEY}`,
                            'HTTP-Referer': window.location.origin || 'http://localhost',
                            'X-Title': 'Prompt Rephraser Module'
                        },
                        body: JSON.stringify({
                            model: currentModel, 
                            messages: [
                                { role: 'system', content: SYSTEM_PROMPT },
                                { role: 'user', content: text }
                            ],
                            temperature: 0.3
                        })
                    });

                    // Если токен невалиден — сразу выводим жесткую ошибку в консоль
                    if (response.status === 401) {
                        isAuthError = true;
                        throw new Error("401 Unauthorized: Неверный API-ключ OpenRouter. Проверьте строку SHARED_API_KEY в refiner.js.");
                    }

                    const contentType = response.headers.get("content-type");
                    if (!contentType || !contentType.includes("application/json")) {
                        throw new Error(`Сервер вернул не-JSON ответ (Статус: ${response.status})`);
                    }

                    const data = await response.json();

                    if (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
                        return { success: true, result: data.choices[0].message.content.trim() };
                    } else if (data.error) {
                        throw new Error(`Ошибка провайдера OpenRouter: ${data.error.message || 'Unknown Error'} (Код: ${data.error.code})`);
                    } else {
                        throw new Error("Структура JSON ответа пуста или некорректна");
                    }

                } catch (error) {
                    lastFailureReason = error.message;
                    // Пишем все внутренние сбои моделей как предупреждения в консоль
                    console.warn(`PromptRefiner [Предупреждение]: Модель ${currentModel} на круге ${attemptCount} выдала ошибку -> ${error.message}`);
                    
                    if (isAuthError) {
                        console.error(`PromptRefiner [Критическая ошибка]: ${error.message}`);
                        break;
                    }
                }
            }

            if (!success && !isAuthError && (Date.now() - startTime < timeoutDuration)) {
                onStatusUpdate(`Все модели заняты. Повтор через 2 секунды...`);
                await delay(2000);
                attemptCount++;
            }
        }
        
        console.error(`PromptRefiner [Ошибка]: Не удалось перефразировать промпт за 30 секунд. Последняя причина: ${lastFailureReason}`);
        return { success: false, error: lastFailureReason };
    }

    // Экспортируем функцию в глобальную область видимости (window), чтобы её подхватил любой скрипт
    global.generateRefinedPrompt = generateRefinedPrompt;

})(typeof window !== 'undefined' ? window : this);
