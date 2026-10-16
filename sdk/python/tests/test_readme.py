"""Task 4.5 verification: every README python snippet runs as written."""

import re
from pathlib import Path

README = Path(__file__).parent.parent / "README.md"


def snippets():
    text = README.read_text()
    blocks = re.findall(r"```python\n(.*?)```", text, re.DOTALL)
    assert blocks, "no python snippets found in README"
    return blocks


def test_snippet_count():
    assert len(snippets()) == 7


def test_each_snippet_runs():
    for i, src in enumerate(snippets()):
        namespace = {"__name__": f"readme_snippet_{i}"}
        exec(compile(src, f"README snippet {i}", "exec"), namespace)
