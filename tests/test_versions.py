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
        for name in ["index.html", "styles.css", "versions.json", "version-previews.js", "version-entry.js", "motion.js"]:
            shutil.copy2(SOURCE / name, self.root / name)
        for name in ["scripts", "versions"]:
            shutil.copytree(SOURCE / name, self.root / name)
        self.ids = [version["id"] for version in json.loads((self.root / "versions.json").read_text())["versions"]]
        self.next_id = self.ids[-1] + 1

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
                     for number in self.ids}
        old_styles = {number: (self.root / f"versions/{number}/styles.css").read_bytes()
                      for number in self.ids}
        stylesheet = self.root / "styles.css"
        stylesheet.write_text(stylesheet.read_text() + "\n/* The next small evolution. */\n")
        result = self.run_archive("--add", "A little <more> & less")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / f"versions/{self.next_id}/styles.css").read_bytes(), stylesheet.read_bytes())
        for number in self.ids:
            page = (self.root / f"versions/{number}/index.html").read_text()
            self.assertEqual(self.without_navigation(page), self.without_navigation(old_pages[number]))
            self.assertEqual((self.root / f"versions/{number}/styles.css").read_bytes(), old_styles[number])
            self.assertIn(f'href="../{self.next_id}/index.html"', page)
            self.assertIn('href="../../version-nav.css"', page)
        newest = (self.root / f"versions/{self.next_id}/index.html").read_text()
        self.assertNotIn("version-entry.js", newest)
        self.assertIn('src="../../motion.js"', newest)
        self.assertIn("A little &lt;more&gt; &amp; less", newest)
        self.assertIn(f'data-current="{self.next_id}"', newest)
        self.assertIn(f'href="./versions/{self.next_id}/index.html" aria-current="page"', (self.root / "index.html").read_text())
        self.assertEqual(len(json.loads((self.root / "versions.json").read_text())["versions"]), len(self.ids) + 1)
        self.assertIn(f", {self.next_id}];", (self.root / "version-entry.js").read_text())

    def test_only_homepage_randomizes_and_includes_the_complete_chronological_archive(self):
        entry = (self.root / "version-entry.js").read_text()
        ids = json.loads(entry.split("const versions = ", 1)[1].split(";", 1)[0])
        self.assertEqual(ids, self.ids)
        page = (self.root / "index.html").read_text()
        self.assertEqual(page.count('src="./version-entry.js"'), 1)
        self.assertLess(page.index('src="./version-entry.js"'), page.index('rel="stylesheet"'))
        self.assertLess(page.index('src="./version-nav.js"'), page.index('src="./motion.js"'))
        for number in self.ids:
            archive = (self.root / f"versions/{number}/index.html").read_text()
            self.assertNotIn("version-entry.js", archive)
            self.assertLess(archive.index('src="../../version-nav.js"'), archive.index('src="../../motion.js"'))
        self.assertTrue(any(number < 0 for number in ids))

    def test_version_links_open_html_files_locally_and_when_hosted(self):
        pages = [self.root / "index.html", *sorted((self.root / "versions").glob("*/index.html"))]
        for page in pages:
            links = InternalLinks()
            links.feed(page.read_text())
            self.assertEqual(len(links.links), len(self.ids))
            for href in links.links:
                with self.subTest(page=page.relative_to(self.root), href=href):
                    self.assertTrue(href.endswith("/index.html"))
                    local = Path(unquote(urlsplit(urljoin(page.as_uri(), href)).path))
                    self.assertTrue(local.is_file())
                    hosted = urljoin("https://example.com/" + page.relative_to(self.root).as_posix(), href)
                    self.assertEqual(urlsplit(hosted).path, "/" + local.relative_to(self.root).as_posix())

    def test_existing_archive_is_never_overwritten(self):
        folder = self.root / f"versions/{self.next_id}"
        folder.mkdir()
        (folder / "styles.css").write_text("preserve this archive")
        before = self.snapshot()
        result = self.run_archive("--add", "Another version")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.snapshot(), before)

    def test_preview_bundle_includes_archived_text_and_elements_without_navigation(self):
        source = (self.root / "version-previews.js").read_text()
        self.assertTrue(source.startswith("window.websiteVersionPreviews = "))
        previews = json.loads(source.split(" = ", 1)[1].removesuffix(";\n"))
        self.assertEqual(set(previews), {str(number) for number in self.ids})
        for number in self.ids:
            archived = (self.root / f"versions/{number}/index.html").read_text()
            self.assertEqual(previews[str(number)], self.without_navigation(archived))
            self.assertNotIn('class="version-nav', previews[str(number)])
            self.assertIn('src="../../version-previews.js"', archived)
            self.assertIn('src="../../motion.js"', archived)

    def test_new_copy_is_captured_in_the_next_preview(self):
        page = self.root / "index.html"
        page.write_text(page.read_text().replace("<h1 class=\"title\">", '<p class="fresh-note">A new perspective.</p><h1 class="title">'))
        result = self.run_archive("--add", "A new perspective")
        self.assertEqual(result.returncode, 0, result.stderr)
        source = (self.root / "version-previews.js").read_text()
        previews = json.loads(source.split(" = ", 1)[1].removesuffix(";\n"))
        self.assertIn('class="fresh-note"', previews[str(self.next_id)])
        self.assertNotIn('class="fresh-note"', previews[str(self.ids[-1])])


if __name__ == "__main__":
    unittest.main()
