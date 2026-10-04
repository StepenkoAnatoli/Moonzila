# Sources

Every page this project has fetched, and what it was used for. `P` primary/official
carries the design, `S` secondary is context, `L` lead-only is a hint and never proof.

| URL | Type | Title | Retrieved | Used for |
|---|---|---|---|---|
| https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew | P | CreateFileW function (fileapi.h) - Win32 apps \| Microsoft Learn | 2026-10-03 | U-01, U-02, U-03: dwShareMode values and what they block for later openers; opening a directory with FILE_FLAG_BACKUP_SEMANTICS |
| https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files | P | Creating and Opening Files - Win32 apps \| Microsoft Learn | 2026-10-03 | U-01: how the share mode of an open handle combines with the access requested by a later open |
| https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw | P | MoveFileExW function (winbase.h) - Win32 apps \| Microsoft Learn | 2026-10-03 | U-04: MOVEFILE_REPLACE_EXISTING semantics, directories, open targets |
| https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew | P | ReplaceFileW function (winbase.h) - Win32 apps \| Microsoft Learn | 2026-10-03 | U-05: ReplaceFileW semantics and errors when the replaced file is open |
| https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf | P | Alternatives to using Transactional NTFS - Win32 apps \| Microsoft Learn | 2026-10-03 | U-06: what Microsoft says about atomic single-file replacement (ReplaceFile) as an alternative to TxF |
| https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information | P | FILE_RENAME_INFORMATION (ntifs.h) - Windows drivers \| Microsoft Learn | 2026-10-03 | U-06: FILE_RENAME_REPLACE_IF_EXISTS and FILE_RENAME_POSIX_SEMANTICS for a rename over an open target |
| https://nodejs.org/api/fs.html | P | File system \| Node.js v26.10.0 Documentation | 2026-10-03 | U-07: Node fs.rename contract (overwrite of an existing newPath) and that fs is built on libuv |
| https://raw.githubusercontent.com/libuv/libuv/v1.x/src/win/fs.c | P | fs-c | 2026-10-03 | U-07: which Win32 call and flags uv_fs_rename uses on Windows |
