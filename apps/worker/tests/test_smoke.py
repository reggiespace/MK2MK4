def test_app_imports():
    from app.main import app

    assert app.title == "ReggieSpace Studio Media Worker"


def test_render_routes_registered():
    from app.main import app

    paths = {route.path for route in app.routes}
    assert {"/health", "/render/slides", "/render/reel"} <= paths
