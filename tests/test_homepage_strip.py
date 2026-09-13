"""Narrow regression checks for the stray decorative text above Local Growth."""
from html.parser import HTMLParser
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
BASE = '911072aad34f54e76d240592d1209cc29ad30f6a'
MARKER = '<section class="local-growth-bridge">'


class TextReader(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []

    def handle_data(self, data):
        self.text.append(data)


class HomepageStripTests(unittest.TestCase):
    def setUp(self):
        self.html = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.base = subprocess.check_output(
            ['git', 'show', f'{BASE}:index.html'], cwd=ROOT
        ).decode('utf-8').replace('\r\n', '\n')

    def bounds(self, source):
        anchor = source.index('<!-- Redundant Ecosystem section removed -->')
        start = source.index('    <!-- ', anchor + 43)
        end = source.index('    ' + MARKER, start)
        return start, end

    def test_only_decorative_comment_changed(self):
        before_start, before_end = self.bounds(self.base)
        after_start, after_end = self.bounds(self.html)
        self.assertEqual(self.base[:before_start], self.html[:after_start])
        self.assertEqual(self.base[before_end:], self.html[after_end:])

    def test_strip_has_no_visible_text(self):
        start, end = self.bounds(self.html)
        reader = TextReader()
        reader.feed(self.html[start:end])
        self.assertEqual(''.join(reader.text).strip(), '')
        self.assertEqual(self.html[start:end].count('<!--'), 1)
        self.assertEqual(self.html[start:end].count('-->'), 1)

    def test_regression_detects_original_defect(self):
        start, end = self.bounds(self.base)
        reader = TextReader()
        reader.feed(self.base[start:end])
        self.assertTrue(''.join(reader.text).strip())

    def test_links_and_section_count_preserved(self):
        self.assertEqual(re.findall(r'href="[^"]*"', self.base),
                         re.findall(r'href="[^"]*"', self.html))
        self.assertEqual(self.html.count(MARKER), 1)
        self.assertEqual(self.base.count('<section'), self.html.count('<section'))


if __name__ == '__main__':
    unittest.main()
