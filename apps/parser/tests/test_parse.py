"""Tests for the POST /parse endpoint."""

import os
from unittest.mock import patch, MagicMock

import pytest

from app.services.text_extractor import ExtractionResult


def _create_test_pdf(path: str, text: str = "Rechnungsnummer: RE-2024-001\nGesamtbetrag: 100,00 €") -> str:
    """Create a minimal PDF with embedded text."""
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    c = canvas.Canvas(path, pagesize=A4)
    y = 750
    for line in text.split("\n"):
        c.drawString(72, y, line)
        y -= 20
    c.save()
    return path


class TestParseEndpointSecurity:
    def test_rejects_path_traversal(self, client, tmp_path):
        """Path outside upload dir is rejected."""
        response = client.post("/api/v1/parse", json={"file_path": "/etc/passwd"})
        assert response.status_code == 400
        assert "outside" in response.json()["detail"].lower()

    def test_rejects_relative_path_traversal(self, client, tmp_path):
        response = client.post(
            "/api/v1/parse",
            json={"file_path": "/app/storage/uploads/../../etc/passwd"},
        )
        assert response.status_code in (400, 404)

    def test_rejects_nonexistent_file(self, client):
        response = client.post(
            "/api/v1/parse",
            json={"file_path": "/app/storage/uploads/nonexistent.pdf"},
        )
        assert response.status_code == 404

    def test_rejects_non_pdf(self, client, tmp_path):
        """Non-PDF file extension is rejected."""
        # Create a file inside the mocked upload dir
        txt_file = str(tmp_path / "test.txt")
        with open(txt_file, "w") as f:
            f.write("not a pdf")

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            response = client.post(
                "/api/v1/parse", json={"file_path": txt_file}
            )
        assert response.status_code == 400
        assert "pdf" in response.json()["detail"].lower()


class TestParseEndpointPipeline:
    def test_successful_parse(self, client, tmp_path):
        """Full pipeline with a valid PDF."""
        invoice_text = """Mustermann GmbH
Musterstraße 42
12345 Berlin

Rechnungsnummer: RE-2024-001
Rechnungsdatum: 15.03.2024

Gesamtbetrag: 2.380,00 €"""

        pdf_path = _create_test_pdf(str(tmp_path / "invoice.pdf"), invoice_text)

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            response = client.post(
                "/api/v1/parse", json={"file_path": pdf_path}
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["parser_version"] == "1.0.0"
        assert data["page_count"] == 1

    def test_returns_extracted_fields(self, client, tmp_path):
        invoice_text = """Mustermann GmbH
12345 Berlin

Rechnungsnummer: RE-2024-999
Rechnungsdatum: 01.06.2024

Nettobetrag: 1.000,00 €
MwSt. 19%: 190,00 €
Gesamtbetrag: 1.190,00 €"""

        pdf_path = _create_test_pdf(str(tmp_path / "invoice2.pdf"), invoice_text)

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            response = client.post(
                "/api/v1/parse", json={"file_path": pdf_path}
            )

        data = response.json()
        assert data["success"] is True
        assert data["invoice_number"] == "RE-2024-999"
        assert data["invoice_date"] == "2024-06-01"
        assert data["total_amount"] == 1190.0
        assert data["subtotal"] == 1000.0
        assert data["tax_amount"] == 190.0
        assert data["confidence"] > 0.0

    def test_ocr_fallback_triggered(self, client, tmp_path):
        """When pdfplumber returns empty text, OCR fallback is attempted."""
        pdf_path = _create_test_pdf(str(tmp_path / "empty_text.pdf"), "")

        with (
            patch("app.routers.parse.settings") as mock_settings,
            patch("app.routers.parse.extract_text_ocr") as mock_ocr,
        ):
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            mock_ocr.return_value = "Rechnungsnummer: OCR-001\nGesamtbetrag: 50,00 €"

            response = client.post(
                "/api/v1/parse", json={"file_path": pdf_path}
            )

        data = response.json()
        assert data["success"] is True
        assert data["ocr_applied"] is True
        assert "OCR" in str(data["warnings"])

    def test_corrupted_pdf_returns_error(self, client, tmp_path):
        """Corrupted file returns success=false with error."""
        bad_path = str(tmp_path / "corrupt.pdf")
        with open(bad_path, "wb") as f:
            f.write(b"%PDF-1.4 corrupted content")

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            response = client.post(
                "/api/v1/parse", json={"file_path": bad_path}
            )

        data = response.json()
        assert data["success"] is False
        assert data["error"] is not None

    def test_parser_version_in_response(self, client, tmp_path):
        pdf_path = _create_test_pdf(str(tmp_path / "version_test.pdf"))

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            response = client.post(
                "/api/v1/parse", json={"file_path": pdf_path}
            )

        data = response.json()
        assert data["parser_version"] == "1.0.0"

    def test_currency_detection(self, client, tmp_path):
        invoice_text = "Firma ABC\nTotal: $500.00 USD\nInvoice No. INV-001"
        pdf_path = _create_test_pdf(str(tmp_path / "usd.pdf"), invoice_text)

        with patch("app.routers.parse.settings") as mock_settings:
            mock_settings.upload_dir = str(tmp_path)
            mock_settings.max_file_size_mb = 20
            mock_settings.tesseract_lang = "deu+eng"
            response = client.post(
                "/api/v1/parse", json={"file_path": pdf_path}
            )

        data = response.json()
        assert data["currency"] == "USD"
