"""Synchronize game assets/code over SSH without replacing the production database."""
import argparse
import concurrent.futures
import gzip
import hashlib
import json
import pathlib
import shlex
import shutil
import subprocess
import tarfile
import time
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / 'val-strike-html'
WORK = ROOT / 'tools' / '.artifacts' / 'upload'


def log(message):
    print(message, flush=True)


def digest(path):
    with path.open('rb') as file:
        return hashlib.file_digest(file, 'sha256').hexdigest()


def manifest(only=None, remove=None):
    files = sorted(p for folder in ('assets', 'js', 'css', 'screens', 'game')
                   for p in (WEB / folder).rglob('*') if p.is_file()
                   and 'assets/maps/raw' not in p.relative_to(WEB).as_posix()
                   and p.name != 'preload-manifest.json'
                   and p.suffix not in ('.py', '.bat', '.pyc')
                   and not (p.parent == WEB / 'game' and p.suffix == '.html'))
    entries = []
    previous = {}
    if only:
        saved = json.loads((WEB / 'assets' / 'preload-manifest.json').read_text(encoding='utf-8'))
        previous = {entry['url']: entry for entry in saved['entries']}
        files = [p for p in files if p.relative_to(ROOT).as_posix() in only]
    for index, file in enumerate(files, 1):
        entries.append({'url': '/' + urllib.parse.quote(file.relative_to(WEB).as_posix(), safe='/'),
                        'bytes': file.stat().st_size, 'revision': digest(file)})
        if index % 250 == 0 or index == len(files):
            log(f'Asset scan: {index}/{len(files)}')
    if only:
        previous.update({entry['url']: entry for entry in entries})
        for name in remove or []:
            relative = pathlib.PurePosixPath(name).relative_to('val-strike-html')
            previous.pop('/' + urllib.parse.quote(relative.as_posix(), safe='/'), None)
        entries = sorted(previous.values(), key=lambda entry: entry['url'])
    fingerprint = hashlib.sha256(json.dumps(entries, separators=(',', ':')).encode()).hexdigest()
    payload = json.dumps({'version': 42, 'revision': fingerprint,
                          'totalBytes': sum(e['bytes'] for e in entries),
                          'entries': entries}, ensure_ascii=False, separators=(',', ':')) + '\n'
    target = WEB / 'assets' / 'preload-manifest.json'
    if not target.exists() or target.read_text(encoding='utf-8') != payload:
        target.write_text(payload, encoding='utf-8', newline='\n')
    log(f'Preload manifest: {len(entries)} files, {sum(e["bytes"] for e in entries)/1024**2:.1f} MiB')


def run(args, **kwargs):
    result = subprocess.run(args, check=True, **kwargs)
    return result


def ssh(host, code):
    for attempt in range(3):
        result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, 'python3 -'],
                                input=code, text=True, capture_output=True)
        if result.returncode == 0:
            return result.stdout
        if attempt == 2:
            raise RuntimeError(result.stderr.strip() or 'SSH connection failed.')
        time.sleep(3)


def deploy(host, only=None, remove=None):
    remove = sorted(set(remove or []))
    for name in remove:
        item = pathlib.PurePosixPath(name)
        if item.is_absolute() or '..' in item.parts or len(item.parts) < 3 or item.parts[0] != 'val-strike-html' or item.parts[1] not in ('assets', 'game'):
            raise RuntimeError('Removal outside public game assets: ' + name)
        if item.suffix not in ('.js', '.css', '.glb', '.png'):
            raise RuntimeError('Unsupported removal: ' + name)
        if (ROOT / name).exists():
            raise RuntimeError('Archive the local file before publishing its removal: ' + name)
    if not shutil.which('ssh') or not shutil.which('scp'):
        raise RuntimeError('Install Windows OpenSSH Client before uploading.')
    WORK.mkdir(parents=True, exist_ok=True)
    files = sorted([p for p in WEB.rglob('*') if p.is_file() and p.suffix not in ('.py', '.bat', '.pyc')]
                   + list((ROOT / 'server').glob('*.cjs'))
                   + [ROOT / 'server' / 'bootstrap-admin.json', ROOT / 'tools' / 'package.json', ROOT / 'tools' / 'package-lock.json'])
    if only:
        selected = set(only) | {'val-strike-html/assets/preload-manifest.json'}
        files = [p for p in files if p.relative_to(ROOT).as_posix() in selected]
        missing = selected - {p.relative_to(ROOT).as_posix() for p in files}
        if missing:
            raise RuntimeError('Unknown deployment paths: ' + ', '.join(sorted(missing)))
    local = {p.relative_to(ROOT).as_posix(): digest(p) for p in files}
    log('Checking production inventory and checksums...')
    remote = json.loads(ssh(host, '''import pathlib,hashlib,json
base=pathlib.Path('/opt/val-strike/current').resolve()
assert base.parent==pathlib.Path('/opt/val-strike/releases')
result={}
for folder in ('val-strike-html','server'):
 for p in (base/folder).rglob('*'):
  if p.is_file():
   with p.open('rb') as f: result[p.relative_to(base).as_posix()]=hashlib.file_digest(f,'sha256').hexdigest()
for name in ('tools/package.json','tools/package-lock.json'):
 p=base/name
 if p.is_file():
  with p.open('rb') as f: result[name]=hashlib.file_digest(f,'sha256').hexdigest()
print(json.dumps(result))
'''))
    changed = [p for p in files if remote.get(p.relative_to(ROOT).as_posix()) != local[p.relative_to(ROOT).as_posix()]]
    log(f'Changed/missing: {len(changed)} files, {sum(p.stat().st_size for p in changed)/1024**2:.1f} MiB')
    if not changed and not remove:
        log('All models, assets and application files already match. No upload needed.')
        return
    archive = WORK / 'assets-upload.tar.gz'
    log('Packing changed files...')
    with archive.open('wb') as stream, gzip.GzipFile(filename='', fileobj=stream, mode='wb', compresslevel=3, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', dereference=True) as tar:
            for folder in sorted(p for p in (WEB / 'assets').rglob('*') if p.is_dir()):
                tar.add(folder, arcname=folder.relative_to(ROOT).as_posix(), recursive=False)
            for index, file in enumerate(changed, 1):
                tar.add(file, arcname=file.relative_to(ROOT).as_posix(), recursive=False)
                if index % 100 == 0 or index == len(changed):
                    log(f'Packed {index}/{len(changed)}: {file.relative_to(ROOT)}')
    checksum = digest(archive)
    remote_name = 'upload-' + checksum[:16] + '.tar.gz'
    size = archive.stat().st_size
    count = min(8, max(1, (size + 16*1024**2 - 1) // (16*1024**2)))
    parts = []
    with archive.open('rb') as source:
        for index in range(count):
            path = WORK / f'{remote_name}.part{index:02d}'
            with path.open('wb') as destination:
                left = (size + count - 1) // count
                while left:
                    data = source.read(min(left, 4*1024**2))
                    if not data:
                        break
                    destination.write(data)
                    left -= len(data)
            parts.append(path)
    ssh(host, "import pathlib\np=pathlib.Path('/opt/val-strike/incoming');p.mkdir(exist_ok=True);p.chmod(0o700)\n")
    present = json.loads(ssh(host, "import pathlib,hashlib,json\np=pathlib.Path('/opt/val-strike/incoming');d={}\nfor f in p.glob(" + repr(remote_name + '.part??') + "):\n with f.open('rb') as stream:d[f.name]={'size':f.stat().st_size,'hash':hashlib.file_digest(stream,'sha256').hexdigest()}\nprint(json.dumps(d))\n"))
    log(f'Uploading {size/1024**2:.1f} MiB in {count} parts. Interrupted parts resume on the next run.')

    def upload(path):
        remote_part = present.get(path.name)
        if remote_part and remote_part['size'] == path.stat().st_size and remote_part['hash'] == digest(path):
            log('Part already verified: ' + path.name)
            return
        command = 'put' if remote_part and remote_part['size'] >= path.stat().st_size else 'reput'
        for attempt in range(4):
            result = subprocess.run(['scp', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4', str(path), host + ':/opt/val-strike/incoming/' + path.name], capture_output=True, text=True)
            if result.returncode == 0:
                break
            if attempt == 3:
                raise RuntimeError(result.stderr.strip() or f'Upload failed: {path.name}')
            log(f'Reconnecting part {path.name} (attempt {attempt+2}/4)')
            time.sleep(5)
        log('Part complete: ' + path.name)

    with concurrent.futures.ThreadPoolExecutor(max_workers=count) as pool:
        futures = [pool.submit(upload, path) for path in parts]
        while True:
            _, pending = concurrent.futures.wait(futures, timeout=10)
            for future in futures:
                if future.done():
                    future.result()
            if not pending:
                break
            progress = int(ssh(host, "import pathlib\np=pathlib.Path('/opt/val-strike/incoming')\nprint(sum(x.stat().st_size for x in p.glob(" + repr(remote_name + '.part??') + ")))\n").strip())
            log(f'UPLOAD {min(100,100*progress/size):5.1f}%  {progress/1024**2:.1f}/{size/1024**2:.1f} MiB')
    log('UPLOAD 100%. Verifying and publishing...')
    patch_manifest = WORK / 'upload-checksums.json'
    patch_manifest.write_text(json.dumps({p.relative_to(ROOT).as_posix(): local[p.relative_to(ROOT).as_posix()] for p in changed}))
    run(['scp', '-o', 'BatchMode=yes', str(patch_manifest), host + ':/opt/val-strike/incoming/' + remote_name + '.json'])
    release = 'v42-' + time.strftime('%Y%m%d-%H%M%S')
    script = f'''set -eu
cd /opt/val-strike/incoming
cat {remote_name}.part?? > {remote_name}
echo '{checksum}  {remote_name}' | sha256sum -c -
python3 - '{remote_name}' '{release}' <<'PY'
import pathlib,tarfile,hashlib,json,subprocess,os,re,shutil
base=pathlib.Path('/opt/val-strike');old=(base/'current').resolve();new=base/'releases'/{release!r}
assert old.parent==(base/'releases').resolve() and not new.exists()
# Retain the running release and three recent deploys; immutable copies
# otherwise fill the VPS and prevent SQLite backups on the next release.
release_root=(base/'releases').resolve()
snapshots=sorted(p for p in release_root.iterdir() if p.is_dir() and not p.is_symlink() and re.fullmatch(r'v[0-9]+-[0-9]{{8}}-[0-9]{{6}}',p.name))
retained=set(snapshots[-3:])|{{old}}
for snapshot in snapshots:
 if snapshot in retained:continue
 assert snapshot.resolve().parent==release_root and snapshot!=old and not snapshot.is_symlink()
 shutil.rmtree(snapshot)
subprocess.run(['cp','-a','--reflink=auto',str(old),str(new)],check=True)
with tarfile.open({remote_name!r},'r:gz') as tar:
 for member in tar.getmembers():
  target=(new/member.name).resolve()
  assert target.is_relative_to(new) and not member.issym() and not member.islnk()
 tar.extractall(new,filter='data')
checks=json.loads(pathlib.Path({(remote_name+'.json')!r}).read_text())
for name,expected in checks.items():
 with (new/name).open('rb') as f: assert hashlib.file_digest(f,'sha256').hexdigest()==expected,name
for name in {remove!r}:
 target=(new/name).resolve()
 assert target.is_relative_to(new/'val-strike-html') and target.suffix in ('.js','.css','.glb','.png')
 assert not (new/name).is_symlink()
 target.unlink(missing_ok=True)
subprocess.run(['chmod','-R','u=rwX,go=rX',str(new/'val-strike-html'),str(new/'server')],check=True)
if (new/'tools/package-lock.json').read_bytes()!=(old/'tools/package-lock.json').read_bytes():
 subprocess.run(['npm','ci','--omit=dev','--no-audit','--no-fund'],cwd=new/'tools',check=True)
subprocess.run(['node','--check',str(new/'server/server.cjs')],check=True)
subprocess.run(['systemctl','start','val-strike-backup.service'],check=True)
link=base/'current-next';link.unlink(missing_ok=True);link.symlink_to(new);os.replace(link,base/'current')
try:
 subprocess.run(['systemctl','restart','val-strike'],check=True)
 import urllib.request,time
 for attempt in range(20):
  try:
   with urllib.request.urlopen('http://127.0.0.1:8455/api/health',timeout=3) as response:health=json.load(response)
   assert health['ok'] and health['version']==42
   break
  except Exception:
   if attempt==19:raise
   time.sleep(1)
except Exception:
 link.symlink_to(old);os.replace(link,base/'current');subprocess.run(['systemctl','restart','val-strike'],check=True);raise
print('Published {release}; SQLite preserved; health v42 OK')
for p in pathlib.Path('.').glob({(remote_name+'.part??')!r}):p.unlink()
pathlib.Path({remote_name!r}).unlink()
PY
'''
    # Send literal LF bytes: Windows text mode would convert them to CRLF for Bash.
    run(['ssh', '-o', 'BatchMode=yes', host, 'bash -s'], input=script.encode('utf-8'))
    for part in parts:
        part.unlink(missing_ok=True)
    log('DONE: https://val.konmeo22132.dev/ - all changed files verified.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='root@160.191.244.178')
    parser.add_argument('--manifest-only', action='store_true')
    parser.add_argument('--only', nargs='+', help='Publish only these repository paths and refresh their manifest entries.')
    parser.add_argument('--remove', nargs='+', help='Remove archived public asset files from the new release and preload manifest.')
    args = parser.parse_args()
    try:
        manifest(args.only, args.remove)
        if not args.manifest_only:
            deploy(args.host, args.only, args.remove)
    except (Exception, KeyboardInterrupt) as error:
        log('UPLOAD FAILED: ' + str(error))
        raise SystemExit(1)
