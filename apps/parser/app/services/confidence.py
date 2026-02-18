"""Confidence score calculation for parse results."""

from app.services.invoice_parser import ParseResult

# Weight for each field in the confidence score
_FIELD_WEIGHTS: dict[str, float] = {
    "invoice_number": 0.15,
    "invoice_date": 0.15,
    "supplier_name": 0.15,
    "total_amount": 0.20,
    "subtotal": 0.10,
    "tax_amount": 0.10,
    "items": 0.10,
    "due_date": 0.05,
}

# OCR penalty: reduce confidence when OCR was needed
_OCR_PENALTY = 0.10


def calculate_confidence(result: ParseResult, ocr_applied: bool = False) -> float:
    """Calculate confidence score (0.0 - 1.0) for parsed invoice data.

    Higher score = more fields successfully extracted.
    OCR results get a small penalty since OCR text is less reliable.
    """
    score = 0.0

    if result.invoice_number:
        score += _FIELD_WEIGHTS["invoice_number"]
    if result.invoice_date:
        score += _FIELD_WEIGHTS["invoice_date"]
    if result.supplier_name:
        score += _FIELD_WEIGHTS["supplier_name"]
    if result.total_amount is not None:
        score += _FIELD_WEIGHTS["total_amount"]
    if result.subtotal is not None:
        score += _FIELD_WEIGHTS["subtotal"]
    if result.tax_amount is not None:
        score += _FIELD_WEIGHTS["tax_amount"]
    if result.items:
        score += _FIELD_WEIGHTS["items"]
    if result.due_date:
        score += _FIELD_WEIGHTS["due_date"]

    # Cross-validation bonus: if subtotal + tax ≈ total, add confidence
    if (
        result.subtotal is not None
        and result.tax_amount is not None
        and result.total_amount is not None
    ):
        expected_total = result.subtotal + result.tax_amount
        if abs(expected_total - result.total_amount) < 0.02:
            score = min(1.0, score + 0.05)

    if ocr_applied:
        score = max(0.0, score - _OCR_PENALTY)

    return round(min(1.0, score), 2)
