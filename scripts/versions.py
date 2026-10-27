#!/usr/bin/env python3
"""Archive the current design and refresh the static version navigation.

After one small edit to the root index.html or styles.css, run:
    python3 scripts/versions.py --add "A short description of the evolution"

Run without --add to refresh links only. Archived design stylesheets are never
rewritten; only their shared navigation links are updated as the archive grows.
"""

import argparse
import html
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START = "<!-- VERSION NAV START -->"
END = "<!-- VERSION NAV END -->"


def preview_script(document, archived=False):
    prefix = "../../" if archived else "./"
    script = f'    <script src="{prefix}version-previews.js" defer></script>\n'
    if script in document:
        return document
    target = f'    <script src="{prefix}version-nav.js" defer></script>'
    if target not in document:
        raise ValueError("The page is missing its shared navigation script")
    return document.replace(target, script + target, 1)


def without_navigation(document):
    before, remainder = document.split(START, 1)
    _, after = remainder.split(END, 1)
    return before + after


def navigation(versions, current, archived=False):
    prefix = "../" if archived else "./versions/"
    position = next(i for i, version in enumerate(versions) if version["id"] == current)
    entries = []
    for index, version in enumerate(versions):
        number = version["id"]
        name = html.escape(version["name"])
        active = ' aria-current="page" class="timeline-tick is-selected"' if number == current else ' class="timeline-tick"'
        proximity = math.exp(-abs(index - position) * .55)
        entries.append(
            f'          <li><a href="{prefix}{number}/index.html"{active}'
            f' data-version="{number}" aria-label="Version {number:02d}: {name}"'
            f' style="--tick-scale: {.24 + .76 * proximity:.4f}; --tick-opacity: {.38 + .54 * proximity:.4f}">'
            f'<span class="tick-label" aria-hidden="true"><span class="tick-number">{number:02d}</span>'
            f'<span class="tick-name">{name}</span></span>'
            f'<span class="tick-line" aria-hidden="true"></span></a></li>'
        )

    return "\n".join([
        START,
        f'      <nav class="version-nav version-timeline" aria-label="Website versions" data-current="{current}">',
        '        <span class="timeline-heading">Versions</span>',
        '        <ol class="timeline-track">',
        *entries,
        '        </ol>',
        f'        <output class="timeline-position" aria-live="polite" aria-atomic="true">{current:02d} / {len(versions):02d}</output>',
        '      </nav>',
        "      " + END,
    ])


def render(document, versions, current, archived=False):
    before, remainder = document.split(START, 1)
    _, after = remainder.split(END, 1)
    return before + navigation(versions, current, archived) + after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--add", metavar="NAME", help="Archive the current root design as the next version")
    args = parser.parse_args()
    manifest_path = ROOT / "versions.json"
    manifest = json.loads(manifest_path.read_text())
    versions = manifest["versions"]
    document = preview_script((ROOT / "index.html").read_text())

    if args.add:
        if not args.add.strip():
            parser.error("The version name must not be blank")
        number = versions[-1]["id"] + 1 if versions else 1
        folder = ROOT / "versions" / str(number)
        folder.mkdir(parents=True, exist_ok=False)
        versions.append({"id": number, "name": args.add.strip()})
        archive = document.replace('href="./version-nav.css"', 'href="../../version-nav.css"')
        archive = archive.replace('src="./version-nav.js"', 'src="../../version-nav.js"')
        archive = archive.replace('src="./version-previews.js"', 'src="../../version-previews.js"')
        (folder / "index.html").write_text(archive)
        (folder / "styles.css").write_bytes((ROOT / "styles.css").read_bytes())

    if not versions:
        parser.error("Create the first version with --add")

    (ROOT / "index.html").write_text(render(document, versions, versions[-1]["id"]))
    previews = {}
    for version in versions:
        page = ROOT / "versions" / str(version["id"]) / "index.html"
        result = render(preview_script(page.read_text(), archived=True), versions, version["id"], archived=True)
        page.write_text(result)
        previews[str(version["id"])] = without_navigation(result)
    # A static script also works under file://, where fetching HTML is restricted.
    payload = json.dumps(previews, ensure_ascii=False, separators=(",", ":"))
    payload = payload.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")
    (ROOT / "version-previews.js").write_text("window.websiteVersionPreviews = " + payload + ";\n")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f'{len(versions)} versions; latest is {versions[-1]["id"]:02d}')


if __name__ == "__main__":
    main()
