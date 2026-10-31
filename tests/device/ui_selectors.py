"""Pure helpers for Android accessibility dumps (no device or App data access)."""
import re

NUTRIENTS = ('能量', '蛋白质', '脂肪', '碳水化合物', '钠')


def keyboard_top(window_dump):
    """Visible IME screen boundary; Android may include a visibleFrame field."""
    frames = re.findall(r'type=ime frame=\[0,(\d+)\]\[\d+,\d+\][^\n]*\bvisible=true\b', window_dump)
    tops = [int(y) for y in frames if int(y) > 0]
    return min(tops) if tops else None


def bounds(node):
    values = tuple(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
    return values if len(values) == 4 else None


def visible(node, top=230, bottom=1810):
    box = bounds(node)
    return bool(box and 0 <= box[0] < box[2] <= 1080 and
                top <= box[1] < box[3] <= bottom)


def nutrient_unit(root, label, unit):
    """Select a radio in the target NRV field's row, never a later nutrient.

    Compressed React Native dumps flatten rows but preserve document order.
    Stop at the next amount/NRV EditText. TextView children and offscreen or
    inverted/clipped bounds are deliberately rejected.
    """
    nodes = list(root.iter('node'))
    anchors = [i for i, n in enumerate(nodes) if n.get('class') == 'android.widget.EditText'
               and n.get('content-desc') == label + ' NRV%']
    matches = []
    for index in anchors:
        anchor = nodes[index]
        for node in nodes[index + 1:]:
            if node.get('class') == 'android.widget.EditText':
                break
            if node.get('class') != 'android.widget.RadioButton' or node.get('content-desc') not in (unit, label + '单位 ' + unit):
                continue
            a, b = bounds(anchor), bounds(node)
            if a and b and a[3] <= b[1] and visible(node) and node.get('enabled', 'true') == 'true':
                matches.append(node)
    if len(matches) > 1:
        raise ValueError('Ambiguous nutrient unit (multiple columns): ' + label)
    return matches[0] if matches else None


def nutrient_scroll_towards_top(root, label):
    """Recover after IME or scrolling moved the requested row above viewport."""
    nodes = list(root.iter('node'))
    for node in nodes:
        if node.get('class') == 'android.widget.EditText' and node.get('content-desc') == label + ' NRV%':
            box = bounds(node)
            if box:
                return box[3] <= 400
    visible_rows = [NUTRIENTS.index(name) for name in NUTRIENTS if any(
        n.get('content-desc') == name + ' NRV%' and visible(n) for n in nodes)]
    return bool(visible_rows and min(visible_rows) > NUTRIENTS.index(label))
