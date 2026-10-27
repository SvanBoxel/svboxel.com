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
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START = "<!-- VERSION NAV START -->"
END = "<!-- VERSION NAV END -->"


def navigation(versions, current, archived=False):
    prefix = "../" if archived else "./versions/"
    position = next(i for i, version in enumerate(versions) if version["id"] == current)
    latest = versions[-1]["id"]
    label = f"Version {current:02d}"

    def step(offset, text, relation, description):
        index = position + offset
        if 0 <= index < len(versions):
            target = versions[index]["id"]
            return (f'<a class="version-step" href="{prefix}{target}/index.html" '
                    f'rel="{relation}" aria-label="{description}, version {target:02d}">{text}</a>')
        return f'<span class="version-step" aria-disabled="true" aria-label="{description} unavailable">{text}</span>'

    entries = []
    for version in reversed(versions):
        number = version["id"]
        name = html.escape(version["name"])
        active = ' aria-current="page"' if number == current else ""
        newest = '<span class="version-latest">latest</span>' if number == latest else ""
        entries.append(
            f'              <li><a href="{prefix}{number}/index.html"{active}>'
            f'<span class="version-number">{number:02d}</span>'
            f'<span>{name}</span>{newest}</a></li>'
        )

    return "\n".join([
        START,
        '      <nav class="version-nav" aria-label="Website versions">',
        "        " + step(-1, "←", "prev", "Previous version"),
        '        <details class="version-picker">',
        f'          <summary aria-label="Choose a version, viewing {current:02d} of {len(versions):02d}">'
        f'{label}<span class="version-total">/ {len(versions):02d}</span></summary>',
        '          <ol class="version-list" reversed>',
        *entries,
        '          </ol>',
        '        </details>',
        "        " + step(1, "→", "next", "Next version"),
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
    document = (ROOT / "index.html").read_text()

    if args.add:
        if not args.add.strip():
            parser.error("The version name must not be blank")
        number = versions[-1]["id"] + 1 if versions else 1
        folder = ROOT / "versions" / str(number)
        folder.mkdir(parents=True, exist_ok=False)
        versions.append({"id": number, "name": args.add.strip()})
        archive = document.replace('href="./version-nav.css"', 'href="../../version-nav.css"')
        archive = archive.replace('src="./version-nav.js"', 'src="../../version-nav.js"')
        (folder / "index.html").write_text(archive)
        (folder / "styles.css").write_bytes((ROOT / "styles.css").read_bytes())

    if not versions:
        parser.error("Create the first version with --add")

    (ROOT / "index.html").write_text(render(document, versions, versions[-1]["id"]))
    for version in versions:
        page = ROOT / "versions" / str(version["id"]) / "index.html"
        page.write_text(render(page.read_text(), versions, version["id"], archived=True))
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f'{len(versions)} versions; latest is {versions[-1]["id"]:02d}')


if __name__ == "__main__":
    main()
