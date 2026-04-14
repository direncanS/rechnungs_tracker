// CSV formatting with injection prevention (code-quality rule 18)

const INJECTION_PREFIXES = ["=", "+", "-", "@"];

export function sanitizeCell(value: string): string {
  if (value.length > 0 && INJECTION_PREFIXES.includes(value[0])) {
    return "'" + value;
  }
  return value;
}

export function formatCsvRow(values: string[]): string {
  return (
    values
      .map((v) => {
        const sanitized = sanitizeCell(v);
        const escaped = sanitized.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(",") + "\r\n"
  );
}

export function formatCsvHeader(headers: string[]): string {
  return formatCsvRow(headers);
}
