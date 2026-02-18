"""Digital PDF text extraction using pdfplumber."""

import pdfplumber


class ExtractionResult:
    def __init__(self, text: str, page_count: int):
        self.text = text
        self.page_count = page_count


def extract_text(file_path: str) -> ExtractionResult:
    """Extract text from a digital/text-based PDF using pdfplumber.

    Returns ExtractionResult with extracted text and page count.
    Raises ValueError for corrupted or unreadable PDFs.
    """
    try:
        with pdfplumber.open(file_path) as pdf:
            page_count = len(pdf.pages)
            pages_text: list[str] = []
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                pages_text.append(page_text)
            full_text = "\n".join(pages_text)
            return ExtractionResult(text=full_text.strip(), page_count=page_count)
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {e}") from e
