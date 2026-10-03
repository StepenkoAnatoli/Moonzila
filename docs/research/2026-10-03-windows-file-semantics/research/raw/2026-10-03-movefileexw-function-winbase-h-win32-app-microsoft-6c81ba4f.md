---
url: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: MoveFileExW function (winbase.h) - Win32 apps | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/winbase/nf-winbase-movefileexw.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# MoveFileExW function (winbase.h)

Feedback

Summarize this article for me


Moves an existing file or directory, including its children, with various move options.

The [MoveFileWithProgress](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefilewithprogressa) function is equivalent
to the **MoveFileEx** function, except that
**MoveFileWithProgress** allows you to provide a
callback function that receives progress notifications.

To perform this operation as a transacted operation, use the
[MoveFileTransacted](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefiletransacteda) function.

[Section titled: Syntax](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#syntax)

## Syntax

C++

Copy

```cpp
BOOL MoveFileExW(
  [in]           LPCWSTR lpExistingFileName,
  [in, optional] LPCWSTR lpNewFileName,
  [in]           DWORD   dwFlags
);
```

[Section titled: Parameters](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#parameters)

## Parameters

`[in] lpExistingFileName`

The current name of the file or directory on the local computer.

If _dwFlags_ specifies **MOVEFILE\_DELAY\_UNTIL\_REBOOT**, the
file cannot exist on a remote share, because delayed operations are performed before the network is
available.

By default, the name is limited to MAX\_PATH characters. To extend this limit to 32,767 wide characters, prepend "\\\?\\" to the path. For more information, see [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

`[in, optional] lpNewFileName`

The new name of the file or directory on the local computer.

When moving a file, the destination can be on a different file system or volume. If the destination is on
another drive, you must set the **MOVEFILE\_COPY\_ALLOWED** flag in
_dwFlags_.

When moving a directory, the destination must be on the same drive.

If _dwFlags_ specifies **MOVEFILE\_DELAY\_UNTIL\_REBOOT** and
_lpNewFileName_ is **NULL**,
**MoveFileEx** registers the
_lpExistingFileName_ file to be deleted when the system restarts. If
_lpExistingFileName_ refers to a directory, the system removes the directory at restart
only if the directory is empty.

In the ANSI version of this function, the name is limited to **MAX\_PATH** characters.
To extend this limit to 32,767 wide characters, call the Unicode version of the function and prepend
"\\?" to the path. For more information, see
[Naming a File](https://learn.microsoft.com/en-us/windows/desktop/FileIO/naming-a-file)

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

`[in] dwFlags`

This parameter can be one or more of the following values.

Expand table

| Value | Meaning |
| --- | --- |
| **MOVEFILE\_COPY\_ALLOWED**2 (0x2) | If the file is to be moved to a different volume, the function simulates the move by using the <br> [CopyFile](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-copyfile) and <br> [DeleteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-deletefilea) functions.<br>If the file is successfully copied to a different volume and the original file is unable to be deleted,<br>the function succeeds leaving the source file intact.<br>This value cannot be used with **MOVEFILE\_DELAY\_UNTIL\_REBOOT**. |
| **MOVEFILE\_CREATE\_HARDLINK**16 (0x10) | Reserved for future use. |
| **MOVEFILE\_DELAY\_UNTIL\_REBOOT**4 (0x4) | The system does not move the file until the operating system is restarted. The system moves the file <br> immediately after AUTOCHK is executed, but before creating any paging files. Consequently, this parameter <br> enables the function to delete paging files from previous startups.<br>This value can be used only if the process is in the context of a user who belongs to the administrators<br>group or the LocalSystem account.<br>This value cannot be used with **MOVEFILE\_COPY\_ALLOWED**. |
| **MOVEFILE\_FAIL\_IF\_NOT\_TRACKABLE**32 (0x20) | The function fails if the source file is a link source, but the file cannot be tracked after the move. <br> This situation can occur if the destination is a volume formatted with the FAT file system. |
| **MOVEFILE\_REPLACE\_EXISTING**1 (0x1) | If a file named _lpNewFileName_ exists, the function replaces its contents with <br> the contents of the _lpExistingFileName_ file, provided that security requirements <br> regarding access control lists (ACLs) are met. For more information, see the Remarks section of this <br> topic.<br>If _lpNewFileName_ names an existing directory, an error is reported. |
| **MOVEFILE\_WRITE\_THROUGH**8 (0x8) | The function does not return until the file is actually moved on the disk.<br>Setting this value guarantees that a move performed as a copy and delete operation is flushed to disk<br>before the function returns. The flush occurs at the end of the copy operation.<br>This value has no effect if **MOVEFILE\_DELAY\_UNTIL\_REBOOT** is set. |

[Section titled: Return value](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#return-value)

## Return value

If the function succeeds, the return value is nonzero.

If the function fails, the return value is zero (0). To get extended error information, call
[GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror).

[Section titled: Remarks](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#remarks)

## Remarks

If the _dwFlags_ parameter specifies
**MOVEFILE\_DELAY\_UNTIL\_REBOOT**,
**MoveFileEx** fails if it cannot access the registry. The
function stores the locations of the files to be renamed at restart in the following registry value:
**HKEY\_LOCAL\_MACHINE**\ **SYSTEM**\ **CurrentControlSet**\ **Control**\ **Session Manager**\ **PendingFileRenameOperations**

This registry value is of type **REG\_MULTI\_SZ**. Each rename operation stores one
of the following NULL-terminated strings, depending on whether the rename is a delete or not:

- _szSrcFile_\\0\\0

- _szSrcFile_\\0 _szDstFile_\\0


The string _szSrcFile_\\0\\0 indicates that the file
_szSrcFile_ is to be deleted on reboot. The string
_szSrcFile_\\0 _szDstFile_\\0 indicates that
_szSrcFile_ is to be renamed _szDstFile_ on reboot.

**Note**  Although \\0\\0 is technically not allowed in a **REG\_MULTI\_SZ** node, it can because
the file is considered to be renamed to a null name.

The system uses these registry entries to complete the operations at restart in the same order that they were
issued. For example, the following code fragment creates registry entries that delete
_szSrcFile_ and rename _szSrcFile_ to be
_szDstFile_ at restart:

C++

Copy

```cpp
MoveFileEx(szSrcFile, NULL, MOVEFILE_DELAY_UNTIL_REBOOT);
MoveFileEx(szSrcFile, szDstFile, MOVEFILE_DELAY_UNTIL_REBOOT);
```

Because the actual move and deletion operations specified with the
**MOVEFILE\_DELAY\_UNTIL\_REBOOT** flag take place after the calling application has ceased
running, the return value cannot reflect success or failure in moving or deleting the file. Rather, it reflects
success or failure in placing the appropriate entries into the registry.

The system deletes a directory that is tagged for deletion with the
**MOVEFILE\_DELAY\_UNTIL\_REBOOT** flag only if it is empty. To ensure deletion of directories,
move or delete all files from the directory before attempting to delete it. Files may be in the directory at boot
time, but they must be deleted or moved before the system can delete the directory.

The move and deletion operations are carried out at boot time in the same order that they are specified in the
calling application. To delete a directory that has files in it at boot time, first delete the files.

If a file is moved across volumes, **MoveFileEx** does not
move the security descriptor with the file. The file is assigned the default security descriptor in the
destination directory.

The **MoveFileEx** function coordinates its operation with
the [link tracking](https://learn.microsoft.com/en-us/windows/desktop/FileIO/distributed-link-tracking-and-object-identifiers) service,
so link sources can be tracked as they are moved.

To delete or rename a file, you must have either delete permission on the file or delete child permission in
the parent directory. If you set up a directory with all access except delete and delete child and the ACLs of
new files are inherited, then you should be able to create a file without being able to delete it. However, you
can then create a file, and get all the access you request on the handle that is returned to you at the time that
you create the file. If you request delete permission at the time you create the file, you can delete or rename
the file with that handle but not with any other handle. For more information, see
[File Security and Access Rights](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-security-and-access-rights).

In Windows 8 and Windows Server 2012, this function is supported by the following technologies.

Expand table

| Technology | Supported |
| --- | --- |
| Server Message Block (SMB) 3.0 protocol | Yes |
| SMB 3.0 Transparent Failover (TFO) | Yes |
| SMB 3.0 with Scale-out File Shares (SO) | Yes |
| Cluster Shared Volume File System (CsvFS) | Yes |
| Resilient File System (ReFS) | Yes |

[Section titled: Examples](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#examples)

#### Examples

For an example, see
[Creating and Using a Temporary File](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-using-a-temporary-file).

[Section titled: Requirements](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#requirements)

## Requirements

Expand table

| Requirement | Value |
| --- | --- |
| **Minimum supported client** | Windows XP \[desktop apps \| UWP apps\] |
| **Minimum supported server** | Windows Server 2003 \[desktop apps \| UWP apps\] |
| **Target Platform** | Windows |
| **Header** | winbase.h (include Windows.h) |
| **Library** | Kernel32.lib |
| **DLL** | Kernel32.dll |

[Section titled: See also](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#see-also)

## See also

[CopyFile](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-copyfile)

[DeleteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-deletefilea)

[File Management Functions](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-management-functions)

[File Security and Access Rights](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-security-and-access-rights)

[GetWindowsDirectory](https://learn.microsoft.com/en-us/windows/desktop/api/sysinfoapi/nf-sysinfoapi-getwindowsdirectorya)

[MoveFileTransacted](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefiletransacteda)

[MoveFileWithProgress](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefilewithprogressa)

[WritePrivateProfileString](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-writeprivateprofilestringa)

Reading mode disabled

* * *

## Feedback

Was this page helpful?


YesNoNo

Need help with this topic?


Want to try using Ask Learn to clarify or guide you through this topic?


Ask LearnAsk Learn

Suggest a fix?

* * *

## Additional resources

* * *

- Last updated on 06/01/2023

Ask Learn is an AI assistant that can answer questions, clarify concepts, and define terms using trusted Microsoft documentation.

Please sign in to use Ask Learn.

[Sign in](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw#)
