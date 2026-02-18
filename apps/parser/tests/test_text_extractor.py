"""Tests for pdfplumber text extraction."""

import os
import pytest

from app.services.text_extractor import extract_text


def _create_text_pdf(path: str, text: str = "Rechnungsnummer: RE-TEST-001\nGesamtbetrag: 100,00 €") -> str:
    """Create a minimal PDF with embedded text using reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=A4)
    y = 750
    for line in text.split("\n"):
        c.drawString(72, y, line)
        y -= 20
    c.save()
    return path


def _create_empty_pdf(path: str) -> str:
    """Create a PDF with no text content."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=A4)
    c.showPage()
    c.save()
    return path


def _create_multipage_pdf(path: str, pages: int = 3) -> str:
    """Create a multi-page PDF."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=A4)
    for i in range(pages):
        c.drawString(72, 750, f"Page {i + 1} content")
        c.showPage()
    c.save()
    return path


class TestTextExtractor:
    def test_extracts_text_from_pdf(self, tmp_path):
        pdf_path = _create_text_pdf(str(tmp_path / "test.pdf"))
        result = extract_text(pdf_path)
        assert "RE-TEST-001" in result.text
        assert "100,00" in result.text

    def test_returns_page_count(self, tmp_path):
        pdf_path = _create_text_pdf(str(tmp_path / "test.pdf"))
        result = extract_text(pdf_path)
        assert result.page_count == 1

    def test_multipage_pdf(self, tmp_path):
        pdf_path = _create_multipage_pdf(str(tmp_path / "multi.pdf"), pages=3)
        result = extract_text(pdf_path)
        assert result.page_count == 3
        assert "Page 1" in result.text
        assert "Page 3" in result.text

    def test_empty_pdf_returns_empty_text(self, tmp_path):
        pdf_path = _create_empty_pdf(str(tmp_path / "empty.pdf"))
        result = extract_text(pdf_path)
        assert result.text == ""
        assert result.page_count == 1

    def test_nonexistent_file_raises(self, tmp_path):
        with pytest.raises(ValueError, match="Failed to extract"):
            extract_text(str(tmp_path / "nonexistent.pdf"))

    def test_corrupted_file_raises(self, tmp_path):
        bad_path = str(tmp_path / "bad.pdf")
        with open(bad_path, "w") as f:
            f.write("this is not a pdf")
        with pytest.raises(ValueError, match="Failed to extract"):
            extract_text(bad_path)
