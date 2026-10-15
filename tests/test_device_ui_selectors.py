"""Regressions for the unit-selection failure observed in Actions 38558980400."""
import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('ui_selectors', Path(__file__).parent / 'device/ui_selectors.py')
selectors = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selectors)


def row(label, y, unit='g', selected='false'):
    return (f'<node class="android.widget.EditText" content-desc="{label} NRV%" bounds="[556,{y}][966,{y+126}]" />'
            f'<node class="android.widget.RadioButton" content-desc="{unit}" selected="{selected}" bounds="[116,{y+152}][205,{y+255}]">'
            f'<node class="android.widget.TextView" text="{unit}" bounds="[150,{y+178}][171,{y+229}]" /></node>')


class DeviceUiSelectorsTest(unittest.TestCase):
    def tree(self, content):
        return ET.fromstring('<hierarchy>' + content + '</hierarchy>')

    def test_selects_only_matching_nutrient_radio_not_child_or_later_row(self):
        root = self.tree(row('蛋白质', 300) + row('脂肪', 800) + row('碳水化合物', 1300))
        self.assertEqual(selectors.bounds(selectors.nutrient_unit(root, '脂肪', 'g')), (116, 952, 205, 1055))

    def test_missing_unit_does_not_choose_next_nutrient(self):
        self.assertIsNone(selectors.nutrient_unit(self.tree(row('脂肪', 500, 'mg') + row('碳水化合物', 900)), '脂肪', 'g'))

    def test_semantic_unit_accessibility_label(self):
        root = self.tree(row('脂肪', 500).replace('content-desc="g"', 'content-desc="脂肪单位 g"'))
        self.assertEqual(selectors.nutrient_unit(root, '脂肪', 'g').get('content-desc'), '脂肪单位 g')

    def test_bottom_clipped_row_scrolls_down_without_tapping_wrong_control(self):
        root = self.tree(row('脂肪', 1731))
        self.assertIsNone(selectors.nutrient_unit(root, '脂肪', 'g'))
        self.assertFalse(selectors.nutrient_scroll_towards_top(root, '脂肪'))

    def test_overshot_target_recovers_towards_top(self):
        root = self.tree(row('碳水化合物', 300) + row('钠', 800, 'mg'))
        self.assertTrue(selectors.nutrient_scroll_towards_top(root, '脂肪'))
        self.assertIsNone(selectors.nutrient_unit(root, '脂肪', 'g'))

    def test_inverted_clipped_bounds_are_not_visible(self):
        root = self.tree('<node class="android.widget.EditText" content-desc="脂肪 NRV%" bounds="[556,215][966,42]" />' + row('钠', 556, 'mg'))
        self.assertTrue(selectors.nutrient_scroll_towards_top(root, '脂肪'))
        self.assertFalse(selectors.visible(next(root.iter('node'))))

    def test_ambiguous_columns_fail_instead_of_guessing(self):
        root = self.tree(row('脂肪', 300) + row('脂肪', 800))
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            selectors.nutrient_unit(root, '脂肪', 'g')


if __name__ == '__main__':
    unittest.main()
