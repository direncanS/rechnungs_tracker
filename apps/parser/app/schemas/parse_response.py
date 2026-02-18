from pydantic import BaseModel


class ParsedItem(BaseModel):
    line_number: int
    description: str
    quantity: float
    unit: str | None = None
    unit_price: float
    total_price: float
    tax_rate: float | None = None


class ParseResponse(BaseModel):
    success: bool
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    supplier_name: str | None = None
    supplier_address: str | None = None
    supplier_tax_id: str | None = None
    subtotal: float | None = None
    tax_amount: float | None = None
    total_amount: float | None = None
    currency: str = "EUR"
    items: list[ParsedItem] = []
    confidence: float = 0.0
    page_count: int = 0
    parser_version: str = ""
    ocr_applied: bool = False
    raw_text: str = ""
    warnings: list[str] = []
    error: str | None = None
