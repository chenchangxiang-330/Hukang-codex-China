import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('picker_selectors', Path(__file__).parent / 'device/picker_selectors.py')
picker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(picker)
DOCS = 'com.google.android.documentsui'
MEDIA = 'com.google.android.providers.media.module'


def node(package, description='', text='', resource=''):
    return f'<node package="{package}" content-desc="{description}" text="{text}" resource-id="{resource}" bounds="[64,100][366,300]" enabled="true" />'


def root(*nodes):
    return ET.fromstring('<hierarchy>' + ''.join(nodes) + '</hierarchy>')


class PickerSelectorsTest(unittest.TestCase):
    def test_documents_overflow_is_not_photo_picker_browse(self):
        # Same More options label caused the actual 0.3.3 failure.
        tree = root(node(DOCS, 'More options'), node(DOCS, 'Show roots'))
        self.assertEqual(picker.next_picker_action(tree, '00-barcode', 'browse')[0], 'roots')
        self.assertIsNone(picker.next_picker_action(root(node(DOCS, 'More options')), '00-barcode', 'browse'))

    def test_media_menu_is_opened_once_then_only_browse(self):
        tree = root(node(MEDIA, 'More options'))
        self.assertEqual(picker.next_picker_action(tree, '00-barcode', 'initial')[0], 'media_menu')
        self.assertIsNone(picker.next_picker_action(tree, '00-barcode', 'media_menu'))
        self.assertEqual(picker.next_picker_action(root(node(MEDIA, text='Browse…')), '00-barcode', 'media_menu')[0], 'browse')

    def test_documents_images_folder_and_exact_fixture(self):
        self.assertEqual(picker.next_picker_action(root(node(DOCS, text='Images')), '00-barcode', 'roots')[0], 'images')
        self.assertEqual(picker.next_picker_action(root(node(DOCS, 'HukangSimple, 2 items')), '00-barcode', 'images')[0], 'folder')
        self.assertEqual(picker.next_picker_action(root(node(DOCS, '00-barcode.png, 4.74 kB, 7:44 AM')), '00-barcode', 'folder')[0], 'fixture')

    def test_wrong_fixture_or_other_package_is_not_selected(self):
        for tree in (root(node(DOCS, 'copy-00-barcode.png')), root(node(DOCS, '00-barcode.png.exe')), root(node('com.hukang.china', '00-barcode.png')), root(node('com.google.android.googlequicksearchbox', 'More options'))):
            self.assertIsNone(picker.next_picker_action(tree, '00-barcode', 'initial'))

    def test_transient_empty_documents_does_not_send_back(self):
        self.assertIsNone(picker.next_picker_action(root(node(DOCS)), '01-milk', 'browse'))


if __name__ == '__main__':
    unittest.main()
