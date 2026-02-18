"""Tests for invoice text parsing and regex extraction."""

from app.services.invoice_parser import (
    parse_invoice_text,
    parse_german_number,
    parse_german_date,
)


class TestGermanNumberParsing:
    def test_simple_decimal(self):
        assert parse_german_number("150,00") == 150.0

    def test_thousands_separator(self):
        assert parse_german_number("1.500,00") == 1500.0

    def test_large_number(self):
        assert parse_german_number("1.234.567,89") == 1234567.89

    def test_integer(self):
        assert parse_german_number("42") == 42.0

    def test_with_euro_symbol(self):
        assert parse_german_number("€ 2.380,00") == 2380.0

    def test_empty_string(self):
        assert parse_german_number("") is None

    def test_whitespace(self):
        assert parse_german_number("  1.500,00  ") == 1500.0


class TestGermanDateParsing:
    def test_dot_separated(self):
        assert parse_german_date("15.03.2024") == "2024-03-15"

    def test_slash_separated(self):
        assert parse_german_date("15/03/2024") == "2024-03-15"

    def test_within_text(self):
        assert parse_german_date("Datum: 01.12.2023 blah") == "2023-12-01"

    def test_invalid_month(self):
        assert parse_german_date("15.13.2024") is None

    def test_no_date(self):
        assert parse_german_date("no date here") is None


class TestInvoiceNumberExtraction:
    def test_rechnungsnummer(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.invoice_number == "RE-2024-001"

    def test_invoice_number_english(self):
        text = "Invoice No.: INV-9876\nSome other text"
        result = parse_invoice_text(text)
        assert result.invoice_number == "INV-9876"

    def test_rechnungs_nr(self):
        text = "Rechnungs-Nr.: 2024/0042\nMore text"
        result = parse_invoice_text(text)
        assert result.invoice_number == "2024/0042"


class TestDateExtraction:
    def test_invoice_date(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.invoice_date == "2024-03-15"

    def test_due_date(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.due_date == "2024-04-15"


class TestAmountExtraction:
    def test_total_amount(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.total_amount == 2380.0

    def test_subtotal(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.subtotal == 2000.0

    def test_tax_amount(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.tax_amount == 380.0

    def test_simple_total(self, minimal_invoice_text):
        result = parse_invoice_text(minimal_invoice_text)
        assert result.total_amount == 119.0


class TestSupplierExtraction:
    def test_supplier_name(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.supplier_name == "Mustermann GmbH"

    def test_supplier_address(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.supplier_address is not None
        assert "12345" in result.supplier_address
        assert "Berlin" in result.supplier_address

    def test_tax_id(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.tax_id == "DE123456789"


class TestCurrencyDetection:
    def test_eur_default(self, sample_invoice_text):
        result = parse_invoice_text(sample_invoice_text)
        assert result.currency == "EUR"

    def test_usd(self):
        text = "Total: $500.00 USD\nInvoice Number: 123"
        result = parse_invoice_text(text)
        assert result.currency == "USD"

    def test_chf(self):
        text = "Gesamtbetrag: CHF 1.000,00\nRechnungsnummer: 123"
        result = parse_invoice_text(text)
        assert result.currency == "CHF"


class TestEmptyInput:
    def test_empty_text(self, empty_text):
        result = parse_invoice_text(empty_text)
        assert result.invoice_number is None
        assert result.total_amount is None
        assert result.supplier_name is None
        assert result.items == []
