"""Invoice data extraction using regex and heuristics for German invoices."""

import re
from dataclasses import dataclass, field


@dataclass
class ParsedLineItem:
    line_number: int
    description: str
    quantity: float
    unit: str | None
    unit_price: float
    total_price: float
    tax_rate: float | None = None


@dataclass
class ParseResult:
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    supplier_name: str | None = None
    supplier_address: str | None = None
    tax_id: str | None = None
    subtotal: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    currency: str = "EUR"
    items: list[ParsedLineItem] = field(default_factory=list)


# --- German number parsing ---

def parse_german_number(text: str) -> float | None:
    """Parse German-format number: 1.234,56 → 1234.56"""
    text = text.strip()
    # Remove currency symbols and whitespace
    text = re.sub(r"[€$\s]", "", text)
    if not text:
        return None
    # German format: dots as thousands, comma as decimal
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


# --- Date parsing ---

_DATE_PATTERN = re.compile(
    r"(\d{1,2})[./](\d{1,2})[./](\d{4})"
)


def parse_german_date(text: str) -> str | None:
    """Parse DD.MM.YYYY or DD/MM/YYYY → YYYY-MM-DD ISO format."""
    m = _DATE_PATTERN.search(text)
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if 1 <= month <= 12 and 1 <= day <= 31 and 1900 <= year <= 2100:
        return f"{year:04d}-{month:02d}-{day:02d}"
    return None


# --- Field extraction patterns ---

_INVOICE_NUMBER_PATTERNS = [
    re.compile(r"(?:Rechnungs?(?:nummer|nr\.?|[-\s]Nr\.?))\s*[:\s]?\s*(\S+)", re.IGNORECASE),
    re.compile(r"(?:Invoice\s*(?:No\.?|Number|#))\s*[:\s]?\s*(\S+)", re.IGNORECASE),
    re.compile(r"(?:Beleg(?:nummer|nr\.?))\s*[:\s]?\s*(\S+)", re.IGNORECASE),
    re.compile(r"(?:Nr\.?|Nummer)\s*[:\s]?\s*(RE[-/]?\d[\w-]+)", re.IGNORECASE),
]

_INVOICE_DATE_PATTERNS = [
    re.compile(r"(?:Rechnungs?datum|Invoice\s*Date|Datum)\s*[:\s]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})", re.IGNORECASE),
    re.compile(r"(?:Datum|Date)\s*[:\s]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})", re.IGNORECASE),
]

_DUE_DATE_PATTERNS = [
    re.compile(r"(?:Fällig(?:keit(?:sdatum)?)?|Zahlungsziel|F[aä]llig\s*(?:am|bis)|Due\s*Date|Payment\s*Due)\s*[:\s]?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})", re.IGNORECASE),
]

_TOTAL_PATTERNS = [
    re.compile(r"(?:Gesamt(?:betrag)?|Bruttobetrag|Brutto|Endbetrag|Total|Rechnungsbetrag|Gesamtsumme)\s*[:\s]?\s*(?:€\s?)?([\d.,]+)\s*€?", re.IGNORECASE),
]

_SUBTOTAL_PATTERNS = [
    re.compile(r"(?:Nettobetrag|Netto|Zwischensumme|Subtotal|Summe\s*netto)\s*[:\s]?\s*(?:€\s?)?([\d.,]+)\s*€?", re.IGNORECASE),
]

_TAX_PATTERNS = [
    re.compile(r"(?:MwSt\.?|Mehrwertsteuer|USt\.?|Umsatzsteuer|VAT|Tax)\s*(?:\d+\s*%?\s*)?[:\s]?\s*(?:€\s?)?([\d.,]+)\s*€?", re.IGNORECASE),
]

_TAX_ID_PATTERNS = [
    re.compile(r"(?:USt-?IdNr\.?|USt\.?\s*ID|Steuernummer|Steuer-Nr\.?|Tax\s*ID|VAT\s*ID)\s*[:\s]?\s*(\S+)", re.IGNORECASE),
]

_CURRENCY_PATTERNS = [
    re.compile(r"\b(EUR|USD|CHF|GBP)\b"),
    re.compile(r"€"),
]

# Line item: Pos/Nr, description, qty, unit, unit price, total
_LINE_ITEM_PATTERN = re.compile(
    r"^\s*(\d+)\s+"  # position number
    r"(.+?)\s+"  # description (non-greedy)
    r"(\d+(?:[.,]\d+)?)\s+"  # quantity
    r"(?:(Stk\.?|Stück|Std\.?|Psch\.?|kg|m|l|Paar)\s+)?"  # optional unit
    r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,4}))\s+"  # unit price (German format)
    r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2}))"  # total price (German format)
    , re.MULTILINE
)


def _extract_first_match(patterns: list[re.Pattern[str]], text: str) -> str | None:
    """Try patterns in order, return first match group 1."""
    for pattern in patterns:
        m = pattern.search(text)
        if m:
            return m.group(1).strip()
    return None


def _extract_supplier_name(text: str) -> str | None:
    """Extract supplier name from the top portion of the invoice.

    Heuristic: first non-empty line that looks like a company name
    (before the invoice metadata section).
    """
    lines = text.split("\n")
    # Look in the first 10 lines for a company-like name
    for line in lines[:10]:
        line = line.strip()
        if not line or len(line) < 3:
            continue
        # Skip lines that are clearly metadata
        if re.match(r"^(Rechnung|Invoice|Datum|Date|Nr\.|Seite|Page|Tel|Fax|E-?Mail|www\.|http)", line, re.IGNORECASE):
            continue
        if re.match(r"^\d", line):
            continue
        # Skip address-like lines (postal codes, street numbers)
        if re.match(r"^(Str\.|Straße|\d{5}\s)", line, re.IGNORECASE):
            continue
        # This looks like a company name
        if len(line) > 2 and len(line) < 100:
            return line
    return None


def _extract_supplier_address(text: str) -> str | None:
    """Extract address from near the top of the invoice."""
    lines = text.split("\n")
    # Look for a line with a German postal code pattern (5 digits + city)
    for line in lines[:15]:
        line = line.strip()
        if re.search(r"\d{5}\s+\w+", line):
            return line
    return None


def _detect_currency(text: str) -> str:
    """Detect currency from text. Default EUR."""
    if "€" in text or re.search(r"\bEUR\b", text):
        return "EUR"
    if "$" in text or re.search(r"\bUSD\b", text):
        return "USD"
    if re.search(r"\bCHF\b", text):
        return "CHF"
    if "£" in text or re.search(r"\bGBP\b", text):
        return "GBP"
    return "EUR"


def _extract_line_items(text: str) -> list[ParsedLineItem]:
    """Best-effort line item extraction."""
    items: list[ParsedLineItem] = []
    for match in _LINE_ITEM_PATTERN.finditer(text):
        pos = int(match.group(1))
        desc = match.group(2).strip()
        qty = parse_german_number(match.group(3))
        unit = match.group(4)
        unit_price = parse_german_number(match.group(5))
        total_price = parse_german_number(match.group(6))
        if qty is not None and unit_price is not None and total_price is not None:
            items.append(ParsedLineItem(
                line_number=pos,
                description=desc,
                quantity=qty,
                unit=unit,
                unit_price=unit_price,
                total_price=total_price,
            ))
    return items


def parse_invoice_text(text: str) -> ParseResult:
    """Parse invoice text to extract structured data.

    Extracts: invoice number, dates, amounts, supplier, line items.
    Targets German invoice formats (MwSt, Brutto/Netto, DD.MM.YYYY).
    """
    result = ParseResult()

    result.invoice_number = _extract_first_match(_INVOICE_NUMBER_PATTERNS, text)

    # Dates
    date_str = _extract_first_match(_INVOICE_DATE_PATTERNS, text)
    if date_str:
        result.invoice_date = parse_german_date(date_str)

    due_str = _extract_first_match(_DUE_DATE_PATTERNS, text)
    if due_str:
        result.due_date = parse_german_date(due_str)

    # Supplier
    result.supplier_name = _extract_supplier_name(text)
    result.supplier_address = _extract_supplier_address(text)
    result.tax_id = _extract_first_match(_TAX_ID_PATTERNS, text)

    # Amounts
    total_str = _extract_first_match(_TOTAL_PATTERNS, text)
    if total_str:
        result.total_amount = parse_german_number(total_str)

    subtotal_str = _extract_first_match(_SUBTOTAL_PATTERNS, text)
    if subtotal_str:
        result.subtotal = parse_german_number(subtotal_str)

    tax_str = _extract_first_match(_TAX_PATTERNS, text)
    if tax_str:
        result.tax_amount = parse_german_number(tax_str)

    # Currency
    result.currency = _detect_currency(text)

    # Line items
    result.items = _extract_line_items(text)

    return result
