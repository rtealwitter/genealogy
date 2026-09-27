"""Small offline tests for separating direct MGP students from ancestors/descendants."""
import json
import tempfile
import unittest
from contextlib import redirect_stderr
from io import StringIO
from pathlib import Path
from unittest.mock import Mock, patch

from bs4 import BeautifulSoup

from fetch_genealogy import MGP, main


class StudentTableTests(unittest.TestCase):
    def parse(self, html):
        with tempfile.TemporaryDirectory() as cache:
            client = MGP(cache)
            with patch.object(client, 'get', return_value=BeautifulSoup(html, 'html.parser')):
                return client.students('1')

    def test_only_direct_student_rows_and_deduplicate_degrees(self):
        html = '''<h2>Selected faculty</h2>
            <p>Advisor: <a href="id.php?id=9">Ancestor</a></p>
            <p>Students: <a href="id.php?fChrono=1&amp;id=1">Chronological order</a></p>
            <table><tr><th>Name</th><th>School</th><th>Year</th><th>Descendants</th></tr>
              <tr><td><a href="id.php?id=2">Student, One</a></td><td>A</td><td>2020</td><td><a href="id.php?id=999">50</a></td></tr>
              <tr><td><a href="id.php?id=2">Student, One</a></td><td>B</td><td>2021</td><td>50</td></tr>
              <tr><td><a href="id.php?id=3">Student, Two</a></td><td>C</td><td>2022</td><td>0</td></tr>
            </table>'''
        self.assertEqual(self.parse(html), [
            {'id': 'mgp-2', 'name': 'Student, One'},
            {'id': 'mgp-3', 'name': 'Student, Two'}])

    def test_explicit_no_students(self):
        self.assertEqual(self.parse('<h2>Faculty</h2><p>No students known.</p>'), [])

    def test_unrecognized_table_does_not_silently_mean_no_students(self):
        with self.assertRaisesRegex(ValueError, 'Unrecognized student table'):
            self.parse('<h2>Faculty</h2><p>Students:</p><table><tr><td>Changed markup</td></tr></table>')


    def test_student_own_record_must_confirm_faculty_link(self):
        faculty = {'id': 'mgp-1', 'name': 'Faculty', 'year': 2000,
                   'institution': 'A', 'advisors': [], 'sources': []}
        student = {'id': 'mgp-2', 'name': 'Student', 'year': 2020,
                   'institution': 'B', 'advisors': ['mgp-3'], 'sources': []}
        client = Mock()
        client.students.return_value = [{'id': 'mgp-2', 'name': 'Student'}]
        client.person.side_effect = [(faculty, {}), (student, {'mgp-3': 'Someone else'})]
        with tempfile.TemporaryDirectory() as tmp, redirect_stderr(StringIO()):
            argv = ['fetch_genealogy.py', '1', '--include-students', '--output', str(Path(tmp) / 'out.json')]
            with patch('sys.argv', argv), patch('fetch_genealogy.MGP', return_value=client):
                with self.assertRaisesRegex(ValueError, 'does not confirm the faculty advisor link'):
                    main()
            saved = json.loads((Path(tmp) / 'out.json').read_text())
            self.assertEqual(saved['defaultStudents'], [])


if __name__ == '__main__':
    unittest.main()
