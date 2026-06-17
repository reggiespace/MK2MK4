def test_app_imports():
    from app.main import app
    assert app.title == "Gastric IQ Media Worker"
