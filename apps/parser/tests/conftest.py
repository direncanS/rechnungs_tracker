import os
import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def fixtures_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "fixtures")


@pytest.fixture
def sample_invoice_text() -> str:
    """Sample German invoice text for regex testing."""
    return """Mustermann GmbH
Musterstraße 42
12345 Berlin

Rechnungsnummer: RE-2024-001
Rechnungsdatum: 15.03.2024
Fälligkeitsdatum: 15.04.2024

USt-IdNr.: DE123456789

Pos  Beschreibung          Menge  Einheit  Einzelpreis  Gesamtpreis
1    Beratungsleistung     10     Std.     150,00       1.500,00
2    Softwarelizenz        1      Stk.     500,00       500,00

Nettobetrag: 2.000,00 €
MwSt. 19%: 380,00 €
Gesamtbetrag: 2.380,00 €

Zahlbar innerhalb von 30 Tagen.
"""


@pytest.fixture
def minimal_invoice_text() -> str:
    """Minimal invoice text with just a total."""
    return """Firma XYZ
Rechnung

Gesamtbetrag: 119,00 €
"""


@pytest.fixture
def empty_text() -> str:
    return ""
