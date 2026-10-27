"""Versioned explorer launch URLs; run through manage.py check."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("explorer_manage", ROOT / "manage.py")
manage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manage)


class LaunchTest(unittest.TestCase):
    def test_launch_version_changes_with_content_and_preserves_literal_directory(self):
        checks = ROOT / ".checks"
        checks.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=checks) as temporary:
            page = Path(temporary) / "index.html"
            page.write_text("first build")
            directory = Path("/folder #?% ü")
            first = manage.page_target(page, directory)
            self.assertEqual(first, manage.page_target(page, directory))
            query = parse_qs(urlsplit(first).query)
            self.assertEqual(query["path"], [str(directory)])
            page.write_text("other build")
            self.assertNotEqual(query["build"], parse_qs(urlsplit(manage.page_target(page, directory)).query)["build"])
