/**
 * AIlogic.js
 * Двухэтапная генерация сайта (Оптимизация промпта -> Генерация HTML, CSS, JS)
 */

// Укажите ваш URL Cloudflare Worker
const WORKER_URL = "https://groq-proxy-assistant.matvey-bogdanchik10.workers.dev"; // <-- ЗАМЕНИТЕ НА ВАШ URL

// Минимальное количество слов для отправки
const MIN_WORDS_COUNT = 5;

/**
 * Вспомогательная функция подсчета слов
 */
function countWords(str) {
    return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Основная функция генерации
 */
window.generateWebsite = async function (userPrompt, onStatusChange) {
    const wordCount = countWords(userPrompt);

    if (wordCount < MIN_WORDS_COUNT) {
        return {
            success: false,
            error: `Слишком короткий запрос. Введите минимум ${MIN_WORDS_COUNT} слова.`
        };
    }

    try {
        // ----------------------------------------------------
        // ЭТАП 1: Оптимизация промпта (генерация короткого ТЗ)
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Оптимизация промпта...");

        const step1Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "groq/compound",
                messages: [
                    {
                        role: "system",
                        content: "Ты — эксперт по Prompt Engineering. Преобразуй описание сайта от пользователя в КОРОТКОЕ лаконичное техническое задание (максимум 150-200 слов). Опиши только структуру, стили и функции. Без вводных фраз."
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.5,
                max_completion_tokens: 500
            })
        });

        if (!step1Response.ok) {
            const errData = await step1Response.json().catch(() => ({}));
            const msg = errData.error?.message || `Код ошибки: ${step1Response.status}`;
            throw new Error(`Ошибка на этапе оптимизации: ${msg}`);
        }

        const step1Data = await step1Response.json();
        const refinedPrompt = step1Data.choices?.[0]?.message?.content;

        if (!refinedPrompt) {
            throw new Error("Не удалось перефразировать промпт.");
        }

        // ----------------------------------------------------
        // ЭТАП 2: Генерация HTML, CSS и JS
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Генерация кода (HTML, CSS, JS)...");

        // Безопасная обрезка ТЗ, если оно получилось слишком длинным
        const safePrompt = refinedPrompt.length > 3000 ? refinedPrompt.slice(0, 3000) : refinedPrompt;

        const step2Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "groq/compound",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `Ты — Senior Frontend Developer. Напиши верстку и скрипты по ТЗ.
Верни результат СТРОГО в формате JSON:
{
  "html": "код внутренних тегов страницы без html, head, body",
  "css": "стили CSS",
  "javascript": "скрипт JS"
}`
                    },
                    {
                        role: "user",
                        content: safePrompt
                    }
                ],
                temperature: 0.3,
                max_completion_tokens: 4000
            })
        });

        if (!step2Response.ok) {
            const errData = await step2Response.json().catch(() => ({}));
            const msg = errData.error?.message || `Код ошибки: ${step2Response.status}`;
            throw new Error(`Ошибка на этапе генерации кода: ${msg}`);
        }

        const step2Data = await step2Response.json();
        const rawContent = step2Data.choices?.[0]?.message?.content;

        let parsedCode;
        try {
            parsedCode = JSON.parse(rawContent);
        } catch (e) {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedCode = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Не удалось распарсить JSON с кодом.");
            }
        }

        return {
            success: true,
            refinedPrompt: refinedPrompt,
            html: parsedCode.html || '',
            css: parsedCode.css || '',
            js: parsedCode.javascript || parsedCode.js || ''
        };

    } catch (error) {
        console.error("AI Generation Error:", error);
        return {
            success: false,
            error: error.message || "Ошибка соединения."
        };
    }
};
