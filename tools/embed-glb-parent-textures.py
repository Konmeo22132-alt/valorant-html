"""Embed parent-relative GLB images without changing geometry or animation data."""
import argparse
import json
from pathlib import Path
import struct
from urllib.parse import unquote


def embed(path):
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from('<3I', raw)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise ValueError('Invalid GLB: ' + str(path))
    json_size, json_kind = struct.unpack_from('<2I', raw, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError('Missing JSON chunk')
    doc = json.loads(raw[20:20 + json_size])
    binary_start = 20 + json_size
    binary_size, binary_kind = struct.unpack_from('<2I', raw, binary_start)
    if binary_kind != 0x004E4942 or binary_start + 8 + binary_size != len(raw):
        raise ValueError('Unexpected binary chunk layout')
    binary = bytearray(raw[binary_start + 8:])
    count = 0
    asset_root = path.resolve().parent.parent
    for item in doc.get('images', []):
        uri = item.get('uri', '')
        if '..' not in Path(unquote(uri)).parts:
            continue
        source = (path.parent / unquote(uri)).resolve()
        if not source.is_relative_to(asset_root):
            raise ValueError('Texture is outside the asset tree: ' + uri)
        payload = source.read_bytes()
        if not payload.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('Expected PNG: ' + uri)
        binary.extend(b'\0' * (-len(binary) % 4))
        doc.setdefault('bufferViews', []).append({
            'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)})
        item.pop('uri')
        item['mimeType'] = 'image/png'
        item['bufferView'] = len(doc['bufferViews']) - 1
        binary.extend(payload)
        count += 1
    if count:
        binary.extend(b'\0' * (-len(binary) % 4))
        doc['buffers'][0]['byteLength'] = len(binary)
        encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
        encoded += b' ' * (-len(encoded) % 4)
        with path.open('wb') as stream:
            stream.write(struct.pack('<5I', magic, version, 28 + len(encoded) + len(binary), len(encoded), json_kind))
            stream.write(encoded)
            stream.write(struct.pack('<2I', len(binary), binary_kind))
            stream.write(binary)
    return {'file': str(path), 'embeddedImages': count, 'bytes': path.stat().st_size}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+', type=Path)
    args = parser.parse_args()
    for file in args.files:
        print(json.dumps(embed(file)))
