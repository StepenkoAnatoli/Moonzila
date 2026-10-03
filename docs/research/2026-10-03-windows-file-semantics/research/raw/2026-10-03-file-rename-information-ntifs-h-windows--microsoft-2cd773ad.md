---
url: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: FILE_RENAME_INFORMATION (ntifs.h) - Windows drivers | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/windows-driver-docs-ddi/blob/staging/wdk-ddi-src/content/ntifs/ns-ntifs-_file_rename_information.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# FILE\_RENAME\_INFORMATION structure (ntifs.h)

Feedback

Summarize this article for me


The **FILE\_RENAME\_INFORMATION** structure is used to rename a file.

[Section titled: Syntax](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#syntax)

## Syntax

C++

Copy

```cpp
typedef struct _FILE_RENAME_INFORMATION {
#if (_WIN32_WINNT >= _WIN32_WINNT_WIN10_RS1)
    union {
        BOOLEAN ReplaceIfExists;  // FileRenameInformation
        ULONG Flags;              // FileRenameInformationEx
    } DUMMYUNIONNAME;
#else
    BOOLEAN ReplaceIfExists;
#endif
    HANDLE RootDirectory;
    ULONG FileNameLength;
    WCHAR FileName[1];
} FILE_RENAME_INFORMATION, *PFILE_RENAME_INFORMATION;
```

[Section titled: Members](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#members)

## Members

`DUMMYUNIONNAME`

`DUMMYUNIONNAME.ReplaceIfExists`

Set to TRUE to specify that if a file with the given name already exists, it should be replaced with the given file. Set to FALSE if the rename operation should fail if a file with the given name already exists.

`DUMMYUNIONNAME.Flags`

Flags for the rename operation. This field is only applicable when used with the **FileRenameInformationEx** information class.

Here are the possible values:

Expand table

| Value | Meaning |
| --- | --- |
| **FILE\_RENAME\_REPLACE\_IF\_EXISTS** (0x00000001) | If a file with the given name already exists, it should be replaced with the given file. Equivalent to the ReplaceIfExists field used with the FileRenameInformation information class. |
| **FILE\_RENAME\_POSIX\_SEMANTICS** (0x00000002) | If FILE\_RENAME\_REPLACE\_IF\_EXISTS is also specified, allow replacing a file even if there are existing handles to it. Existing handles to the replaced file continue to be valid for operations such as read and write. Any subsequent opens of the target name will open the renamed file, not the replaced file. |
| **FILE\_RENAME\_SUPPRESS\_PIN\_STATE\_INHERITANCE** (0x00000004) | When renaming a file to a new directory, suppress any inheritance rules related to the FILE\_ATTRIBUTE\_PINNED and FILE\_ATTRIBUTE\_UNPINNED attributes of the file. |
| **FILE\_RENAME\_SUPPRESS\_STORAGE\_RESERVE\_INHERITANCE** (0x00000008) | When renaming a file to a new directory, suppress any inheritance rules related to the storage reserve ID property of the file. |
| **FILE\_RENAME\_NO\_INCREASE\_AVAILABLE\_SPACE** (0x00000010) | If FILE\_RENAME\_SUPPRESS\_STORAGE\_RESERVE\_INHERITANCE is not also specified, when renaming a file to a new directory, automatically resize affected storage reserve areas as needed to prevent the user visible free space on the volume from increasing. Requires manage volume access. |
| **FILE\_RENAME\_NO\_DECREASE\_AVAILABLE\_SPACE** (0x00000020) | If FILE\_RENAME\_SUPPRESS\_STORAGE\_RESERVE\_INHERITANCE is not also specified, when renaming a file to a new directory, automatically resize affected storage reserve areas as needed to prevent the user visible free space on the volume from decreasing. Requires manage volume access. |
| **FILE\_RENAME\_PRESERVE\_AVAILABLE\_SPACE** (0x00000030) | Equivalent to specifying both FILE\_RENAME\_NO\_INCREASE\_AVAILABLE\_SPACE and FILE\_RENAME\_NO\_DECREASE\_AVAILABLE\_SPACE. |
| **FILE\_RENAME\_IGNORE\_READONLY\_ATTRIBUTE** (0x00000040) | If FILE\_RENAME\_REPLACE\_IF\_EXISTS is also specified, allow replacing a file even if it is read-only. Requires WRITE\_ATTRIBUTES access to the replaced file. |
| **FILE\_RENAME\_FORCE\_RESIZE\_TARGET\_SR** (0x00000080) | If FILE\_RENAME\_SUPPRESS\_STORAGE\_RESERVE\_INHERITANCE is not also specified, when renaming a file to a new directory that is part of a different storage reserve area, always grow the target directory's storage reserve area by the full size of the file being renamed. Requires manage volume access. |
| **FILE\_RENAME\_FORCE\_RESIZE\_SOURCE\_SR** (0x00000100) | If FILE\_RENAME\_SUPPRESS\_STORAGE\_RESERVE\_INHERITANCE is not also specified, when renaming a file to a new directory that is part of a different storage reserve area, always shrink the source directory's storage reserve area by the full size of the file being renamed. Requires manage volume access. |
| **FILE\_RENAME\_FORCE\_RESIZE\_SR** (0x00000180) | Equivalent to specifying both FILE\_RENAME\_FORCE\_RESIZE\_TARGET\_SR and FILE\_RENAME\_FORCE\_RESIZE\_SOURCE\_SR. |

`ReplaceIfExists`

Set to TRUE to specify that if a file with the given name already exists, it should be replaced with the given file. Set to FALSE if the rename operation should fail if a file with the given name already exists.

`RootDirectory`

A handle that **IopOpenLinkOrRenameTarget** uses to open the target directory.

If the file is not being moved to a different directory, or if the **FileName** member contains the full pathname, this member is NULL. Otherwise, it is a handle for the root directory under which the file will reside after it is renamed.

To perform two open operations that won't cause a sharing conflict, you can open **RootDirectory** by requesting traverse \| read-attribute. **IopOpenLinkOrRenameTarget** can then perform a relative open by requesting FILE\_WRITE\_DATA \| SYNCHRONIZE. These two opens would not cause sharing conflict.

`FileNameLength`

Length, in bytes, of the new name for the file.

`FileName[1]`

The first character of a wide-character string containing the new name for the file. This is followed in memory by the remainder of the string. If the **RootDirectory** member is NULL, and the file is being moved to a different directory, this member specifies the full pathname to be assigned to the file. Otherwise, it specifies only the file name or a relative pathname.

[Section titled: Remarks](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#remarks)

## Remarks

The **FILE\_RENAME\_INFORMATION** structure is used to rename a file. This operation can be performed in either of the following ways:

- Call [**FltSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fltkernel/nf-fltkernel-fltsetinformationfile) or [**ZwSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile), passing **FileRenameInformation** as the value of **FileInformationClass** and passing a caller-allocated buffer formatted as a **FILE\_RENAME\_INFORMATION** structure for the value of **FileInformation**. The **FileHandle** parameter specifies the file to be renamed.

- Create an IRP with major function code [**IRP\_MJ\_SET\_INFORMATION**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/irp-mj-set-information).


File system minifilters must use [**FltSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fltkernel/nf-fltkernel-fltsetinformationfile), not [**ZwSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile), to rename a file.

Renaming a file requires DELETE access to the file so that the directory entry can be removed from the current parent directory, as well as the appropriate access to create the new entry in the new parent directory file.

The file name string in the **FileName** member must be specified in one of the following forms.

- A simple file name. (The **RootDirectory** member is NULL.) In this case, the file is simply renamed within the same directory. That is, the rename operation changes the name of the file but not its location.

- A fully qualified file name. (The **RootDirectory** member is NULL.) In this case, the rename operation changes the name and location of the file.

- A relative file name. In this case, the **RootDirectory** member contains a handle to the target directory for the rename operation. The file name itself must be a simple file name.


General rules for rename operations:

- A file or directory can only be renamed within a volume. In other words, a rename operation cannot cause a file or directory to be moved to a different volume.

- A volume's root directory cannot be renamed.

- If **ReplaceIfExists** is set to FALSE, and the target exists, the rename operation will fail.

- Even if **ReplaceIfExists** is set to TRUE, the rename operation will still fail if a file with the same name already exists and is a directory, a read-only file, or a currently executing file.

- A volume's files and directories cannot be renamed if the volume is a read-only volume, such as a CDFS volume or a read-only NTFS volume.


Special rules for renaming open files:

- A file cannot be renamed if it has any open handles, unless it is only open because of a batch opportunistic lock (oplock) and the batch oplock can be broken immediately.

- A file cannot be renamed if a file with the same name exists and has open handles (except in the batch-oplock case described earlier).

- A directory cannot be renamed if it or any of its subdirectories contains a file that has open handles (except in the batch-oplock case described earlier).


Special rules for renaming NTFS data streams:

- The default directory stream cannot be renamed.

- The new name for the stream must begin with a colon (:).

- A data stream can only be renamed _within_ the same file. In other words, a rename operation cannot cause a data stream to be moved to a different file.

- A data stream on a directory cannot be renamed to the default data stream.

- If **ReplaceIfExists** is set to TRUE, the rename operation will succeed only if a stream with the same name does not exist or is a zero-length data stream.

- "Renaming" the default data stream is allowed, but this is not a true rename, because it leaves behind a zero-length default data stream.


The size of the **FileInformation** buffer passed to [**ZwSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile) or [**FltSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fltkernel/nf-fltkernel-fltsetinformationfile) must be >= **sizeof**(FILE\_RENAME\_INFORMATION) plus the size in bytes of the **FileName** string.

[Section titled: Requirements](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#requirements)

## Requirements

Expand table

| Requirement | Value |
| --- | --- |
| **Header** | ntifs.h (include Ntifs.h, Fltkernel.h) |

[Section titled: See also](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#see-also)

## See also

[**FltSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/fltkernel/nf-fltkernel-fltsetinformationfile)

[**IRP\_MJ\_SET\_INFORMATION**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ifs/irp-mj-set-information)

[**ZwSetInformationFile**](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/nf-ntifs-ntsetinformationfile)

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

- Last updated on 09/01/2022

Ask Learn is an AI assistant that can answer questions, clarify concepts, and define terms using trusted Microsoft documentation.

Please sign in to use Ask Learn.

[Sign in](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information#)
