"""Package-scoped Android picker actions. Never navigate using generic Back."""
import re

MEDIA = {'com.google.android.providers.media.module', 'com.android.providers.media.module'}
DOCUMENTS = {'com.google.android.documentsui', 'com.android.documentsui'}


def actionable_nodes(root, packages):
    for node in root.iter('node'):
        if node.get('package') not in packages or node.get('enabled', 'true') != 'true':
            continue
        box = tuple(map(int, re.findall(r'-?\d+', node.get('bounds', ''))))
        if len(box) == 4 and 0 <= box[0] < box[2] <= 1080 and box[3] > box[1] and 90 < (box[1] + box[3]) / 2 < 1850:
            yield node


def matching(nodes, pattern):
    return next((node for node in nodes if any(re.fullmatch(pattern, node.get(key, '')) for key in ('text', 'content-desc'))), None)


def next_picker_action(root, stem, stage):
    """Return (action, node) for the known media→DocumentsUI flow or wait.

    Each navigation action runs once per picker invocation. DocumentsUI's
    identically named overflow menu is intentionally never selected.
    """
    documents = list(actionable_nodes(root, DOCUMENTS))
    media = list(actionable_nodes(root, MEDIA))
    filename = re.escape(stem) + r'\.(?:png|jpg)(?:[,，].*)?'
    if documents:
        target = matching(documents, filename)
        if target is not None:
            return 'fixture', target
        if stage == 'roots':
            images = matching(documents, r'Images|图片|图像')
            if images is not None:
                return 'images', images
        if stage == 'images':
            folder = matching(documents, r'HukangSimple(?:[,，].*)?')
            if folder is not None:
                return 'folder', folder
        if stage not in ('roots', 'images', 'folder'):
            navigation = matching(documents, r'Show roots|Open navigation drawer|显示根目录|打开导航抽屉|导航抽屉')
            if navigation is not None:
                return 'roots', navigation
        return None
    if media:
        target = matching(media, filename)
        if target is not None:
            return 'fixture', target
        browse = matching(media, r'Browse(?:…|\.\.\.)?|浏览(?:…|\.\.\.)?')
        if browse is not None and stage != 'browse':
            return 'browse', browse
        if stage == 'initial':
            more = matching(media, r'More options|更多选项')
            if more is not None:
                return 'media_menu', more
    return None
