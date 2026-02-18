import os

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.schemas.parse_request import ParseRequest
from app.schemas.parse_response import ParseResponse, ParsedItem
from app.services.text_extractor import extract_text
from app.services.ocr_extractor import extract_text_ocr
from app.services.invoice_parser import parse_invoice_text
from app.services.confidence import calculate_confidence

router = APIRouter()

PARSER_VERSION = "1.0.0"
MIN_TEXT_LENGTH = 50


@router.post("/parse", response_model=ParseResponse)
async def parse_invoice(request: ParseRequest) -> ParseResponse:
    file_path = request.file_path

    # Security: reject paths outside upload root
    upload_root = os.path.realpath(settings.upload_dir)
    real_path = os.path.realpath(file_path)
    if not real_path.startswith(upload_root + os.sep) and real_path != upload_root:
        raise HTTPException(
            status_code=400, detail="File path outside allowed upload directory"
        )

    if not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="File not found")

    if not real_path.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_size = os.path.getsize(real_path)
    max_size = settings.max_file_size_mb * 1024 * 1024
    if file_size > max_size:
        raise HTTPException(status_code=413, detail="File exceeds maximum size")

    warnings: list[str] = []
    ocr_applied = False

    # Step 1: Extract text with pdfplumber
    try:
        extraction = extract_text(real_path)
        text = extraction.text
        page_count = extraction.page_count
    except ValueError as e:
        return ParseResponse(
            success=False,
            error=str(e),
            parser_version=PARSER_VERSION,
            warnings=["Failed to extract text from PDF"],
        )

    # Step 2: OCR fallback if text is too short
    if len(text) < MIN_TEXT_LENGTH:
        warnings.append("Insufficient text from pdfplumber, attempting OCR")
        ocr_text = extract_text_ocr(real_path, lang=settings.tesseract_lang)
        if ocr_text:
            text = ocr_text
            ocr_applied = True
        else:
            warnings.append("OCR also failed to extract text")

    if not text:
        return ParseResponse(
            success=False,
            page_count=page_count,
            parser_version=PARSER_VERSION,
            ocr_applied=ocr_applied,
            error="No text could be extracted from the PDF",
            warnings=warnings,
        )

    # Step 3: Parse extracted text
    result = parse_invoice_text(text)

    # Step 4: Calculate confidence
    confidence = calculate_confidence(result, ocr_applied=ocr_applied)

    # Build response
    items = [
        ParsedItem(
            line_number=item.line_number,
            description=item.description,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
            tax_rate=item.tax_rate,
        )
        for item in result.items
    ]

    return ParseResponse(
        success=True,
        invoice_number=result.invoice_number,
        invoice_date=result.invoice_date,
        due_date=result.due_date,
        supplier_name=result.supplier_name,
        supplier_address=result.supplier_address,
        supplier_tax_id=result.tax_id,
        subtotal=result.subtotal,
        tax_amount=result.tax_amount,
        total_amount=result.total_amount,
        currency=result.currency,
        items=items,
        confidence=confidence,
        page_count=page_count,
        parser_version=PARSER_VERSION,
        ocr_applied=ocr_applied,
        raw_text=text,
        warnings=warnings,
    )
