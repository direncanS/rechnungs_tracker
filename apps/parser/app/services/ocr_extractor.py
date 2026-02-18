"""Scanned PDF text extraction using Tesseract OCR."""

import pytesseract
from pdf2image import convert_from_path


def extract_text_ocr(file_path: str, lang: str = "deu+eng") -> str:
    """Extract text from a scanned PDF using Tesseract OCR.

    Converts PDF pages to images, then runs OCR on each.
    Returns extracted text or empty string if OCR fails.
    """
    try:
        images = convert_from_path(file_path)
        pages_text: list[str] = []
        for image in images:
            page_text = pytesseract.image_to_string(image, lang=lang)
            pages_text.append(page_text)
        return "\n".join(pages_text).strip()
    except Exception:
        return ""
