import json
from html.parser import HTMLParser
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from urllib.parse import unquote, urljoin, urlsplit


SOURCE = Path(__file__).resolve().parent.parent


class InternalLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attributes):
        href = dict(attributes).get("href", "")
        if tag == "a" and href and not urlsplit(href).scheme:
            self.links.append(href)


class VersionArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for name in ["index.html", "styles.css", "versions.json"]:
            shutil.copy2(SOURCE / name, self.root / name)
        for name in ["scripts", "versions"]:
            shutil.copytree(SOURCE / name, self.root / name)

    def run_archive(self, *arguments):
        return subprocess.run(
            [sys.executable, "-B", str(self.root / "scripts/versions.py"), *arguments],
            capture_output=True, text=True,
        )

    def snapshot(self):
        return {str(path.relative_to(self.root)): path.read_bytes()
                for path in self.root.rglob("*") if path.is_file()}

    def without_navigation(self, document):
        before, rest = document.split("<!-- VERSION NAV START -->", 1)
        _, after = rest.split("<!-- VERSION NAV END -->", 1)
        return before + after

    def test_refresh_does_not_change_any_files(self):
        before = self.snapshot()
        result = self.run_archive()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.snapshot(), before)

    def test_new_version_preserves_old_designs_and_updates_navigation(self):
        old_pages = {number: (self.root / f"versions/{number}/index.html").read_text()
                     for number in range(1, 7)}
        old_styles = {number: (self.root / f"versions/{number}/styles.css").read_bytes()
                      for number in range(1, 7)}
        stylesheet = self.root / "styles.css"
        stylesheet.write_text(stylesheet.read_text() + "\n/* The next small evolution. */\n")
        result = self.run_archive("--add", "A little <more> & less")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / "versions/7/styles.css").read_bytes(), stylesheet.read_bytes())
        for number in range(1, 7):
            page = (self.root / f"versions/{number}/index.html").read_text()
            self.assertEqual(self.without_navigation(page), self.without_navigation(old_pages[number]))
            self.assertEqual((self.root / f"versions/{number}/styles.css").read_bytes(), old_styles[number])
            self.assertIn('href="../7/index.html"', page)
            self.assertIn('href="../../version-nav.css"', page)
        newest = (self.root / "versions/7/index.html").read_text()
        self.assertIn("A little &lt;more&gt; &amp; less", newest)
        self.assertIn('aria-label="Next version unavailable"', newest)
        self.assertIn('href="./versions/7/index.html" aria-current="page"', (self.root / "index.html").read_text())
        self.assertEqual(len(json.loads((self.root / "versions.json").read_text())["versions"]), 7)

    def test_version_links_open_html_files_locally_and_when_hosted(self):
        pages = [self.root / "index.html", *sorted((self.root / "versions").glob("*/index.html"))]
        for page in pages:
            links = InternalLinks()
            links.feed(page.read_text())
            self.assertGreaterEqual(len(links.links), 6)
            for href in links.links:
                with self.subTest(page=page.relative_to(self.root), href=href):
                    self.assertTrue(href.endswith("/index.html"))
                    local = Path(unquote(urlsplit(urljoin(page.as_uri(), href)).path))
                    self.assertTrue(local.is_file())
                    hosted = urljoin("https://example.com/" + page.relative_to(self.root).as_posix(), href)
                    self.assertEqual(urlsplit(hosted).path, "/" + local.relative_to(self.root).as_posix())

    def test_existing_archive_is_never_overwritten(self):
        folder = self.root / "versions/7"
        folder.mkdir()
        (folder / "styles.css").write_text("preserve this archive")
        before = self.snapshot()
        result = self.run_archive("--add", "Another version")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.snapshot(), before)


if __name__ == "__main__":
    unittest.main()
