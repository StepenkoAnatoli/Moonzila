---
url: https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: ReplaceFileW function (winbase.h) - Win32 apps | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/winbase/nf-winbase-replacefilew.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# ReplaceFileW function (winbase.h)

Feedback

Summarize this article for me


Replaces one file with another file, with the option of creating a backup copy of the original
file. The replacement file assumes the name of the replaced file and its identity.

[Section titled: Syntax](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#syntax)

## Syntax

C++

Copy

```cpp
BOOL ReplaceFileW(
  [in]           LPCWSTR lpReplacedFileName,
  [in]           LPCWSTR lpReplacementFileName,
  [in, optional] LPCWSTR lpBackupFileName,
  [in]           DWORD   dwReplaceFlags,
                 LPVOID  lpExclude,
                 LPVOID  lpReserved
);
```

[Section titled: Parameters](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#parameters)

## Parameters

`[in] lpReplacedFileName`

The name of the file to be replaced.

By default, the name is limited to MAX\_PATH characters. To extend this limit to 32,767 wide characters, prepend "\\\?\\" to the path. For more information, see [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

This file is opened with the **GENERIC\_READ**, **DELETE**, and
**SYNCHRONIZE** access rights. The sharing mode is
**FILE\_SHARE\_READ** \| **FILE\_SHARE\_WRITE** \|
**FILE\_SHARE\_DELETE**.

The caller must have write access to the file to be replaced. For more information, see
[File Security and Access Rights](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-security-and-access-rights).

`[in] lpReplacementFileName`

The name of the file that will replace the _lpReplacedFileName_ file.

By default, the name is limited to MAX\_PATH characters. To extend this limit to 32,767 wide characters, prepend "\\\?\\" to the path. For more information, see [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

The function attempts to open this file with the **SYNCHRONIZE**,
**GENERIC\_READ**, **GENERIC\_WRITE**,
**DELETE**, and **WRITE\_DAC** access rights so that it can preserve
all attributes and ACLs. If this fails, the function attempts to open the file with the
**SYNCHRONIZE**, **GENERIC\_READ**,
**DELETE**, and **WRITE\_DAC** access rights. No sharing mode is
specified.

`[in, optional] lpBackupFileName`

The name of the file that will serve as a backup copy of the _lpReplacedFileName_
file. If this parameter is **NULL**, no backup file is created. See the Remarks section for implementation details on the backup file.

By default, the name is limited to MAX\_PATH characters. To extend this limit to 32,767 wide characters, prepend "\\\?\\" to the path. For more information, see [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

`[in] dwReplaceFlags`

The replacement options. This parameter can be one or more of the following values.

Expand table

| Value | Meaning |
| --- | --- |
| **REPLACEFILE\_WRITE\_THROUGH**0x00000001 | This value is not supported. |
| **REPLACEFILE\_IGNORE\_MERGE\_ERRORS**0x00000002 | Ignores errors that occur while merging information (such as attributes and ACLs) from the replaced file to <br> the replacement file. Therefore, if you specify this flag and do not have **WRITE\_DAC** <br> access, the function succeeds but the ACLs are not preserved. |
| **REPLACEFILE\_IGNORE\_ACL\_ERRORS**0x00000004 | Ignores errors that occur while merging ACL information from the replaced file to the replacement file. <br> Therefore, if you specify this flag and do not have **WRITE\_DAC** access, the function <br> succeeds but the ACLs are not preserved. To compile an application that uses this value, define the <br> **\_WIN32\_WINNT** macro as 0x0600 or later.<br>**Windows Server 2003 and Windows XP:** This value is not supported. |

`lpExclude`

Reserved for future use.

`lpReserved`

Reserved for future use.

[Section titled: Return value](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#return-value)

## Return value

If the function succeeds, the return value is nonzero.

If the function fails, the return value is zero. To get extended error information, call
[GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror). The following are possible error codes
for this function.

Expand table

| Return code/value | Description |
| --- | --- |
| **ERROR\_UNABLE\_TO\_MOVE\_REPLACEMENT**1176 (0x498) | The replacement file could not be renamed. If _lpBackupFileName_ was specified, <br> the replaced and replacement files retain their original file names. Otherwise, the replaced file no longer <br> exists and the replacement file exists under its original name. |
| **ERROR\_UNABLE\_TO\_MOVE\_REPLACEMENT\_2**1177 (0x499) | The replacement file could not be moved. The replacement file still exists under its original name; <br> however, it has inherited the file streams and attributes from the file it is replacing. The file to be <br> replaced still exists with a different name. If _lpBackupFileName_ is specified, it <br> will be the name of the replaced file. |
| **ERROR\_UNABLE\_TO\_REMOVE\_REPLACED**1175 (0x497) | The replaced file could not be deleted. The replaced and replacement files retain their original file <br> names. |

If any other error is returned, such as **ERROR\_INVALID\_PARAMETER**, the replaced and
replacement files will retain their original file names. In this scenario, a backup file
does not exist and it is not guaranteed that the
replacement file will have inherited all of the attributes and streams of the replaced file.

[Section titled: Remarks](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#remarks)

## Remarks

**Tip**  Starting with Windows 10, version 1607, for the unicode version of this function ( **ReplaceFileW**), you can opt-in to remove the **MAX\_PATH** limitation. See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/desktop/FileIO/naming-a-file) for details.

The **ReplaceFile** function combines several steps within a
single function. An application can call **ReplaceFile** instead
of calling separate functions to save the data to a new file, rename the original file using a temporary name,
rename the new file to have the same name as the original file, and delete the original file. Another advantage is
that **ReplaceFile** not only copies the new file data, but also
preserves the following attributes of the original file:

- Creation time
- Short file name
- Object identifier
- DACLs
- Security resource attributes
- Encryption
- Compression
- Named streams not already in the replacement file

For example, if the replacement file is encrypted, but the replaced file is not encrypted, the resulting file
is not encrypted.

**Windows 7, Windows Server 2008 R2, Windows Server 2008, Windows Vista, Windows Server 2003 and Windows XP:** Security resource attributes ( **ATTRIBUTE\_SECURITY\_INFORMATION**) for the original
file are not preserved until Windows 8 and Windows Server 2012.

**Note**

If the replacement file is protected using [Selective Wipe](https://learn.microsoft.com/en-us/previous-versions/windows/dn440592(v=win.10)), then the replaced file will be protected by the enterprise id of the replacement file.

The resulting file has the same file ID as the replacement file.

The backup file, replaced file, and replacement file must all reside on the same volume.

To delete or rename a file, you must have either delete permission on the file or delete child permission in
the parent directory. If you set up a directory with all access except delete and delete child and the DACLs of
new files are inherited, then you should be able to create a file without being able to delete it. However, you
can then create a file, and you will get all the access you request on the handle returned to you at the time you
create the file. If you requested delete permission at the time you created the file, you could delete or rename
the file with that handle but not with any other.

Note

The winbase.h header defines ReplaceFile as an alias that automatically selects the ANSI or Unicode version of this function based on the definition of the UNICODE preprocessor constant. Mixing usage of the encoding-neutral alias with code that is not encoding-neutral can lead to mismatches that result in compilation or runtime errors. For more information, see [Conventions for Function Prototypes](https://learn.microsoft.com/en-us/windows/win32/intl/conventions-for-function-prototypes).

[Section titled: Requirements](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#requirements)

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

[Section titled: See also](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#see-also)

## See also

[CopyFile](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-copyfile)

[CopyFileEx](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-copyfileexa)

[File Management Functions](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-management-functions)

[MoveFile](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefile)

[MoveFileEx](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefileexa)

[MoveFileWithProgress](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-movefilewithprogressa)

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

[Sign in](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew#)
