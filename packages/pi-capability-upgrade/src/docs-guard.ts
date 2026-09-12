const PRIVATE_MARKERS = [
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|token|password|secret)\s*[:=]/i,
  /\b(?:10|127|172\.(?:1[6-9]|2\d|3[0-1])|192\.168)\./,
  /\.ts\.net\b/i,
];

export function isSafeDocumentationQuestion(value: string): boolean {
  return value.length > 0 && value.length <= 1_500 && !PRIVATE_MARKERS.some((marker) => marker.test(value));
}

export function assertSafeDocumentationQuestion(value: string): void {
  if (!isSafeDocumentationQuestion(value)) {
    throw new Error("documentation lookup accepts only a bounded public package question");
  }
}
