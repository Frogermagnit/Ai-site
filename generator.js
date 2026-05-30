(function (global) {
    'use strict';

    const SHARED_API_KEY = "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";

    const SYSTEM_PROMPT = `Ты — опытный фронтенд-разработчик. Твоя задача — создать валидный, современный и красивый веб-интерфейс по техническому описанию пользователя.
Ты должен вернуть результат СТРОГО в формате JSON с тремя полями: "html", "css" и "js".

ПРАВИЛА И ОГРАНИЧЕНИЯ:
1. В поле "html" пиши только чистую разметку (код внутри тега <body>). НЕ добавляй теги <!DOCTYPE>, <html>, <head>, <body>, <style> или <script> — только контент интерфейса.
2. В поле "css" пиши только чистый CSS-стили без тегов <style>. Все элементы, сетки (Flexbox/Grid), цвета и шрифты настраивай здесь.
3. В поле "js" пиши только чистый JavaScript код без тегов <script>. Реализуй базовую интерактивность, если она логически следует из промпта.
4. Ответ должен быть СТРОГИМ валидным JSON. Не пиши никаких объяснений, markdown-разметки (никаких \`\`\`json) или текста до и после JSON. Вся структура ответа — это один объект.

Пример формата ответа:
{"html": "<div class=\\"box\\">Hi</div>", "css": ".box { color: red; }", "js": "console.log('init');"}`;

    const delay = ms => new Promise(res => setTimeout(res, ms));

    async function generateWebCode(refinedPrompt, onStatusUpdate = () => {}) {
        const models = [
            'google/gemma-4-26b-a4b-it:free',
            'google/gemma-4-31b-it:free',
            'openai/gpt-oss-20b:free',
            'meta-llama/llama-3.3-70b-instruct:free',
            'deepseek/deepseek-v4-flash:free',
            'qwen/qwen3-coder:free'
        ];

        const startTime = Date.now();
        const timeoutDuration = 60000; 
        let attemptCount = 1;
        let lastFailureReason = "";

        if (!refinedPrompt || !refinedPrompt.trim()) {
            console.error("CodeGenerator: Промпт пуст.");
            return { success: false, error: "Промпт пуст." };
        }

        while (Date.now() - startTime < timeoutDuration) {
            for (let i = 0; i < models.length; i++) {
                if (Date.now() - startTime >= timeoutDuration) break;

                const currentModel = models[i];
                const timeLeft = Math.round((timeoutDuration - (Date.now() - startTime)) / 1000);
                
                onStatusUpdate(`Генерация кода [Круг ${attemptCount}] | Модель: ${currentModel.split('/')[1]} | Осталось: ${timeLeft} сек...`);

                try {
                    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${SHARED_API_KEY}`,
                            'HTTP-Referer': window.location.origin || 'http://localhost'
                        },
                        body: JSON.stringify({
                            model: currentModel,
                            messages: [
                                { role: 'system', content: SYSTEM_PROMPT },
                                { role: 'user', content: refinedPrompt }
                            ],
                            temperature: 0.5,
                            response_format: { type: "json_object" } 
                        })
                    });

                    if (response.status === 401) {
                        throw new Error("401 Unauthorized: Проверьте API-ключ в generator.js");
                    }

                    const data = await response.json();
                    const rawContent = data?.choices?.[0]?.message?.content;

                    if (!rawContent) {
                        throw new Error("Модель вернула пустой ответ");
                    }

                    const parsedCode = JSON.parse(rawContent.trim());
                    
                    if (parsedCode.html !== undefined && parsedCode.css !== undefined && parsedCode.js !== undefined) {
                        return { success: true, data: parsedCode };
                    } else {
                        throw new Error("В JSON отсутствуют нужные поля (html, css, js)");
                    }

                } catch (error) {
                    lastFailureReason = error.message;
                    console.warn(`CodeGenerator [Предупреждение]: Ошибка модели ${currentModel} -> ${error.message}`);
                }
            }

            if (Date.now() - startTime < timeoutDuration) {
                onStatusUpdate(`Ожидание очереди генерации кода...`);
                await delay(3000);
                attemptCount++;
            }
        }

        console.error(`CodeGenerator [Ошибка]: Не удалось сгенерировать код. Причина: ${lastFailureReason}`);
        return { success: false, error: lastFailureReason };
    }

    global.generateWebCode = generateWebCode;

})(typeof window !== 'undefined' ? window : this);
