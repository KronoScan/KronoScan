export interface SSEEvent {
    [key: string]: unknown;
}
export declare function parseSSEStream(raw: string): SSEEvent[];
export interface AuditFinding {
    severity: string;
    title: string;
    line: number;
    description: string;
    category: string;
}
export interface CategoryComplete extends SSEEvent {
    type: "category_complete";
    category: string;
    findingCount: number;
    source?: string;
    scanMode?: string;
}
export declare function isCategoryComplete(event: SSEEvent): event is CategoryComplete;
export declare function isFinding(event: SSEEvent): event is AuditFinding & SSEEvent;
