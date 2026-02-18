"""Tests for confidence score calculation."""

from app.services.confidence import calculate_confidence
from app.services.invoice_parser import ParseResult


class TestConfidenceCalculation:
    def test_empty_result_is_zero(self):
        result = ParseResult()
        score = calculate_confidence(result)
        assert score == 0.0

    def test_full_result_is_high(self):
        result = ParseResult(
            invoice_number="RE-001",
            invoice_date="2024-03-15",
            due_date="2024-04-15",
            supplier_name="Test GmbH",
            total_amount=2380.0,
            subtotal=2000.0,
            tax_amount=380.0,
            items=[],  # no items but other fields present
        )
        score = calculate_confidence(result)
        # All fields except items = 0.90, plus cross-validation bonus 0.05 = 0.95
        assert score >= 0.90

    def test_cross_validation_bonus(self):
        result = ParseResult(
            total_amount=119.0,
            subtotal=100.0,
            tax_amount=19.0,
        )
        score = calculate_confidence(result)
        # subtotal(0.10) + tax(0.10) + total(0.20) + bonus(0.05) = 0.45
        assert score == 0.45

    def test_ocr_penalty(self):
        result = ParseResult(
            invoice_number="RE-001",
            supplier_name="Test GmbH",
            total_amount=100.0,
        )
        score_normal = calculate_confidence(result, ocr_applied=False)
        score_ocr = calculate_confidence(result, ocr_applied=True)
        assert score_ocr < score_normal
        assert abs((score_normal - score_ocr) - 0.10) < 0.01

    def test_partial_result(self):
        result = ParseResult(
            total_amount=500.0,
            supplier_name="Firma ABC",
        )
        score = calculate_confidence(result)
        # total(0.20) + supplier(0.15) = 0.35
        assert score == 0.35

    def test_score_capped_at_one(self):
        result = ParseResult(
            invoice_number="RE-001",
            invoice_date="2024-03-15",
            due_date="2024-04-15",
            supplier_name="Test GmbH",
            total_amount=119.0,
            subtotal=100.0,
            tax_amount=19.0,
        )
        # With cross-validation bonus this could exceed 1.0
        score = calculate_confidence(result)
        assert score <= 1.0

    def test_ocr_score_not_negative(self):
        result = ParseResult()
        score = calculate_confidence(result, ocr_applied=True)
        assert score >= 0.0
