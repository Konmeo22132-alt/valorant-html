#!/usr/bin/python3
import os, sqlite3, pathlib, datetime
os.umask(0o077)
base=pathlib.Path('/var/lib/val-strike')
backups=base/'backups'; backups.mkdir(exist_ok=True)
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
target=backups/('val-strike-'+stamp+'.sqlite')
with sqlite3.connect('file:/var/lib/val-strike/val-strike.sqlite?mode=ro',uri=True) as source:
    with sqlite3.connect(target) as destination:
        source.backup(destination)
        if destination.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
            raise RuntimeError('Backup integrity check failed')
files=sorted(backups.glob('val-strike-????????-??????.sqlite'))
for old in files[:-14]:
    if old.resolve().parent==backups.resolve(): old.unlink()
print('SQLite backup:',target.name)
