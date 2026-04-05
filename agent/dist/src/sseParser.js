export function parseSSEStream(raw) {
    const events = [];
    const lines = raw.split("\n");
    for (const line of lines) {
        if (!line.startsWith("data: "))
            continue;
        const json = line.slice(6);
        try {
            events.push(JSON.parse(json));
        }
        catch {
            // Skip malformed JSON
        }
    }
    return events;
}
export function isCategoryComplete(event) {
    return event.type === "category_complete";
}
export function isFinding(event) {
    return typeof event.severity === "string" && typeof event.title === "string";
}
