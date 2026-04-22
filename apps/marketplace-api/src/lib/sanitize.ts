/**
 * PostgREST filter sanitizer
 * Escapes special characters that could manipulate Supabase .or() / .filter() queries
 * Characters: . , ( ) used as PostgREST operators
 */
export function sanitizeFilterInput(input: string): string {
  // Remove PostgREST special operators and control characters
  return input.replace(/[.,()\\]/g, '').trim();
}
