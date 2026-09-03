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

    // Валидация минимального количества слов
    if (wordCount < MIN_WORDS_COUNT) {
        return {
            success: false,
            error: `Слишком короткий запрос. Введите минимум ${MIN_WORDS_COUNT} слова (сейчас: ${wordCount}).`
        };
    }

    try {
        // ----------------------------------------------------
        // ЭТАП 1: Оптимизация промпта
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Оптимизация промпта...");

        const step1Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: "Ты — эксперт по Prompt Engineering. Преобразуй описание сайта от пользователя в детальное техническое задание для верстальщика. Опиши структуру, элементы, стилистику и функционал. Отвечай кратко и конкретно, без вводных слов."
                    },
                    {
                        role: "user",
                        content: userPrompt
                    }
                ],
                temperature: 0.5
            })
        });

        if (!step1Response.ok) {
            const errData = await step1Response.json().catch(() => ({}));
            const detailMsg = errData.error?.message || `Статус: ${step1Response.status}`;
            throw new Error(`Ошибка Groq API (${step1Response.status}): ${detailMsg}`);
        }

        const step1Data = await step1Response.json();
        const refinedPrompt = step1Data.choices[0]?.message?.content;

        if (!refinedPrompt) {
            throw new Error("Не удалось оптимизировать промпт.");
        }

        // ----------------------------------------------------
        // ЭТАП 2: Генерация HTML, CSS и JS
        // ----------------------------------------------------
        if (onStatusChange) onStatusChange("Генерация кода (HTML, CSS, JS)...");

        const step2Response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `Ты — Senior Frontend Developer. Напиши современную верстку и логику сайта по ТЗ.
Верни результат СТРОГО в формате валидного JSON-объекта без разметки markdown (без \`\`\`json):
{
  "html": "верстка внутренних элементов без тегов html, head, body",
  "css": "стили CSS",
  "javascript": "код JavaScript"
}`
                    },
                    {
                        role: "user",
                        content: refinedPrompt
                    }
                ],
                temperature: 0.3
            })
        });

        if (!step2Response.ok) {
            throw new Error(`Ошибка сети на этапе генерации кода (${step2Response.status})`);
        }

        const step2Data = await step2Response.json();
        const rawContent = step2Data.choices[0]?.message?.content;

        // Извлечение JSON
        let parsedCode;
        try {
            parsedCode = JSON.parse(rawContent);
        } catch (e) {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsedCode = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Ошибка обработки ответа ИИ.");
            }
        }

        return {
            success: true,
            refinedPrompt: refinedPrompt,
            html: parsedCode.html || '',
            css: parsedCode.css || '',
            js: parsedCode.javascript || ''
        };

    } catch (error) {
        console.error("AI Generation Error:", error);
        return {
            success: false,
            error: error.message || "Ошибка подключения к серверу ИИ."
        };
    }
};
