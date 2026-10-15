"""Checks for real Android export bytes; no image-generation dependency."""


def jpeg_has_exif(data):
    """Read JPEG marker segments, including markers after entropy-coded scans."""
    if not data.startswith(b'\xff\xd8'):
        raise ValueError('Exported catalogue photo is not JPEG')
    offset, in_scan, exif = 2, False, False
    while offset < len(data):
        if in_scan:
            offset = data.find(b'\xff', offset)
            if offset < 0:
                break
        if data[offset] != 255:
            raise ValueError('Invalid JPEG marker')
        while offset < len(data) and data[offset] == 255:
            offset += 1
        if offset >= len(data):
            break
        marker = data[offset]
        offset += 1
        if in_scan and (marker == 0 or 0xD0 <= marker <= 0xD7):
            continue
        if marker == 0xD9:
            return exif
        if marker == 0x01:
            continue
        if offset + 2 > len(data):
            break
        size = int.from_bytes(data[offset:offset + 2], 'big')
        if size < 2 or offset + size > len(data):
            raise ValueError('Truncated JPEG segment')
        segment = data[offset + 2:offset + size]
        exif = exif or (marker == 0xE1 and segment.startswith(b'Exif\x00\x00'))
        offset += size
        in_scan = marker == 0xDA
    raise ValueError('JPEG is missing its end marker')
