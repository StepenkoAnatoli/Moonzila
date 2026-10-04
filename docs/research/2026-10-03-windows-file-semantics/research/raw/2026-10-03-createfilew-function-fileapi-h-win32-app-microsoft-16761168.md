---
url: https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: CreateFileW function (fileapi.h) - Win32 apps | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/sdk-api/blob/docs/sdk-api-src/content/fileapi/nf-fileapi-createfilew.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# CreateFileW function (fileapi.h)

Feedback

Summarize this article for me


Creates or opens a file or I/O device. The most commonly used I/O devices are as follows: file, file
stream, directory, physical disk, volume, console buffer, tape drive, communications resource, mailslot, and
pipe. The function returns a handle that can be used to access the file or device for various types of
I/O depending on the file or device and the flags and attributes specified.

To perform this operation as a transacted operation, which results in a handle that can be used for transacted
I/O, use the [CreateFileTransacted](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createfiletransacteda) function.

[Section titled: Syntax](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#syntax)

## Syntax

C++

Copy

```cpp
HANDLE CreateFileW(
  [in]           LPCWSTR               lpFileName,
  [in]           DWORD                 dwDesiredAccess,
  [in]           DWORD                 dwShareMode,
  [in, optional] LPSECURITY_ATTRIBUTES lpSecurityAttributes,
  [in]           DWORD                 dwCreationDisposition,
  [in]           DWORD                 dwFlagsAndAttributes,
  [in, optional] HANDLE                hTemplateFile
);
```

[Section titled: Parameters](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#parameters)

## Parameters

`[in] lpFileName`

The name of the file or device to be created or opened. You may use either forward slashes (/) or backslashes (\\) in this name.

For information on special device names, see
[Defining an MS-DOS Device Name](https://learn.microsoft.com/en-us/windows/desktop/FileIO/defining-an-ms-dos-device-name).

To create a file stream, specify the name of the file, a colon, and then the name of the stream. For more
information, see [File Streams](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-streams).

By default, the name is limited to MAX\_PATH characters. To extend this limit to 32,767 wide characters, prepend "\\\?\\" to the path. For more information, see [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file).

Tip

Starting with Windows 10, Version 1607, you can opt-in to remove the MAX\_PATH limitation without prepending "\\\?\\". See the "Maximum Path Length Limitation" section of [Naming Files, Paths, and Namespaces](https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file) for details.

`[in] dwDesiredAccess`

The requested access to the file or device, which can be summarized as read, write, both or neither zero).

The most commonly used values are **GENERIC\_READ**,
**GENERIC\_WRITE**, or both
(`GENERIC_READ | GENERIC_WRITE`). For more information, see
[Generic Access Rights](https://learn.microsoft.com/en-us/windows/desktop/SecAuthZ/generic-access-rights),
[File Security and Access Rights](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-security-and-access-rights),
[File Access Rights Constants](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-access-rights-constants), and
[ACCESS\_MASK](https://learn.microsoft.com/en-us/windows/desktop/SecAuthZ/access-mask).

If this parameter is zero, the application can query certain metadata such as file, directory, or device
attributes without accessing that file or device, even if **GENERIC\_READ** access would
have been denied.

You cannot request an access mode that conflicts with the sharing mode that is specified by the
_dwShareMode_ parameter in an open request that already has an open handle.

For more information, see the Remarks section of this topic and
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files).

`[in] dwShareMode`

The requested sharing mode of the file or device, which can be read, write, both, delete, all of these, or
none (refer to the following table). Access requests to attributes or extended attributes are not affected by
this flag.

If this parameter is zero and **CreateFile** succeeds, the
file or device cannot be shared and cannot be opened again until the handle to the file or device is closed.
For more information, see the Remarks section.

You cannot request a sharing mode that conflicts with the access mode that is specified in an existing
request that has an open handle. **CreateFile** would fail and
the [GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror) function would return
**ERROR\_SHARING\_VIOLATION**.

To enable a process to share a file or device while another process has the file or device open, use a
compatible combination of one or more of the following values. For more information about valid combinations of
this parameter with the _dwDesiredAccess_ parameter, see
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files).

**Note** The sharing options for each open handle remain in effect until that handle is closed, regardless of
process context.

Expand table

| Value | Meaning |
| --- | --- |
| **0**0x00000000 | Prevents subsequent open operations on a file or device if they request delete, read, or write access. |
| **FILE\_SHARE\_DELETE**0x00000004 | Enables subsequent open operations on a file or device to request delete access.<br>Otherwise, no process can open the file or device if it requests delete access.<br>If this flag is not specified, but the file or device has been opened for delete access, the function<br>fails.<br>**Note** Delete access allows both delete and rename operations. |
| **FILE\_SHARE\_READ**0x00000001 | Enables subsequent open operations on a file or device to request read access.<br>Otherwise, no process can open the file or device if it requests read access.<br>If this flag is not specified, but the file or device has been opened for read access, the function<br>fails. |
| **FILE\_SHARE\_WRITE**0x00000002 | Enables subsequent open operations on a file or device to request write access.<br>Otherwise, no process can open the file or device if it requests write access.<br>If this flag is not specified, but the file or device has been opened for write access or has a file mapping<br>with write access, the function fails. |

`[in, optional] lpSecurityAttributes`

A pointer to a [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/wtypesbase/ns-wtypesbase-security_attributes)
structure that contains two separate but related data members: an optional security descriptor, and a Boolean
value that determines whether the returned handle can be inherited by child processes.

This parameter can be **NULL**.

If this parameter is **NULL**, the handle returned by
**CreateFile** cannot be inherited by any child processes the
application may create and the file or device associated with the returned handle gets a default security
descriptor.

The **lpSecurityDescriptor** member of the structure specifies a
[SECURITY\_DESCRIPTOR](https://learn.microsoft.com/en-us/windows/desktop/api/winnt/ns-winnt-security_descriptor) for a file or device. If
this member is **NULL**, the file or device associated with the returned handle is
assigned a default security descriptor.

**CreateFile** ignores the
**lpSecurityDescriptor** member when opening an existing file or device, but continues
to use the **bInheritHandle** member.

The **bInheritHandle** member of the structure specifies whether the returned handle
can be inherited.

For more information, see the Remarks section.

`[in] dwCreationDisposition`

An action to take on a file or device that exists or does not exist.

For devices other than files, this parameter is usually set to **OPEN\_EXISTING**.

For more information, see the Remarks section.

This parameter must be one of the following values, which cannot be combined:

Expand table

| Value | Meaning |
| --- | --- |
| **CREATE\_ALWAYS**2 | Creates a new file, always.<br>If the specified file exists and is writable, the function truncates the file, the function succeeds, and<br>last-error code is set to **ERROR\_ALREADY\_EXISTS** (183).<br>If the specified file does not exist and is a valid path, a new file is created, the function succeeds, and<br>the last-error code is set to zero.<br>For more information, see the Remarks section of this topic. |
| **CREATE\_NEW**1 | Creates a new file, only if it does not already exist.<br>If the specified file exists, the function fails and the last-error code is set to<br>**ERROR\_FILE\_EXISTS** (80).<br>If the specified file does not exist and is a valid path to a writable location, a new file is created. |
| **OPEN\_ALWAYS**4 | Opens a file, always.<br>If the specified file exists, the function succeeds and the last-error code is set to<br>**ERROR\_ALREADY\_EXISTS** (183).<br>If the specified file does not exist and is a valid path to a writable location, the function creates a<br>file and the last-error code is set to zero. |
| **OPEN\_EXISTING**3 | Opens a file or device, only if it exists.<br>If the specified file or device does not exist, the function fails and the last-error code is set to<br>**ERROR\_FILE\_NOT\_FOUND** (2).<br>For more information about devices, see the Remarks section. |
| **TRUNCATE\_EXISTING**5 | Opens a file and truncates it so that its size is zero bytes, only if it exists.<br>If the specified file does not exist, the function fails and the last-error code is set to<br>**ERROR\_FILE\_NOT\_FOUND** (2).<br>The calling process must open the file with the **GENERIC\_WRITE** bit set as part of<br>the _dwDesiredAccess_ parameter. |

`[in] dwFlagsAndAttributes`

The file or device attributes and flags, **FILE\_ATTRIBUTE\_NORMAL** being the most
common default value for files.

This parameter can include any combination of the available file attributes
( **FILE\_ATTRIBUTE\_\***). All other file attributes override
**FILE\_ATTRIBUTE\_NORMAL**.

This parameter can also contain combinations of flags ( **FILE\_FLAG\_** _) for control of_
_file or device caching behavior, access modes, and other special-purpose flags. These combine with any_
_**FILE\_ATTRIBUTE\_**_ values.

This parameter can also contain Security Quality of Service (SQOS) information by specifying the
**SECURITY\_SQOS\_PRESENT** flag. Additional SQOS-related flags information is presented in
the table following the attributes and flags tables.

**Note** When **CreateFile** opens an existing file, it generally
combines the file flags with the file attributes of the existing file, and ignores any file attributes supplied
as part of _dwFlagsAndAttributes_. Special cases are detailed in
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files).

Some of the following file attributes and flags may only apply to files and not necessarily all other types
of devices that **CreateFile** can open. For additional
information, see the Remarks section of this topic and
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files).

For more advanced access to file attributes, see
[SetFileAttributes](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-setfileattributesa). For a complete list
of all file attributes with their values and descriptions, see
[File Attribute Constants](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-attribute-constants).

Expand table

| Attribute | Meaning |
| --- | --- |
| **FILE\_ATTRIBUTE\_ARCHIVE**32 (0x20) | The file should be archived. Applications use this attribute to mark files for backup or removal. |
| **FILE\_ATTRIBUTE\_ENCRYPTED**16384 (0x4000) | The file or directory is encrypted. For a file, this means that all data in the file is encrypted. For a <br> directory, this means that encryption is the default for newly created files and subdirectories. For more <br> information, see [File Encryption](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-encryption).<br>This flag has no effect if **FILE\_ATTRIBUTE\_SYSTEM** is also specified.<br>This flag is not supported on Home, Home Premium, Starter, or ARM editions of Windows. |
| **FILE\_ATTRIBUTE\_HIDDEN**2 (0x2) | The file is hidden. Do not include it in an ordinary directory listing. |
| **FILE\_ATTRIBUTE\_NORMAL**128 (0x80) | The file does not have other attributes set. This attribute is valid only if used alone. |
| **FILE\_ATTRIBUTE\_OFFLINE**4096 (0x1000) | The data of a file is not immediately available. This attribute indicates that file data is physically <br> moved to offline storage. This attribute is used by Remote Storage, the hierarchical storage management <br> software. Applications should not arbitrarily change this attribute. |
| **FILE\_ATTRIBUTE\_READONLY**1 (0x1) | The file is read only. Applications can read the file, but cannot write to or delete it. |
| **FILE\_ATTRIBUTE\_SYSTEM**4 (0x4) | The file is part of or used exclusively by an operating system. |
| **FILE\_ATTRIBUTE\_TEMPORARY**256 (0x100) | The file is being used for temporary storage.<br>For more information, see the [Caching Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#caching_behavior) section of this<br>topic. |

Expand table

| Flag | Meaning |
| --- | --- |
| **FILE\_FLAG\_BACKUP\_SEMANTICS**0x02000000 | The file is being opened or created for a backup or restore operation. The system ensures that the calling <br> process overrides file security checks when the process has **SE\_BACKUP\_NAME** and <br> **SE\_RESTORE\_NAME** privileges. For more information, see <br> [Changing Privileges in a Token](https://learn.microsoft.com/en-us/windows/desktop/SecBP/changing-privileges-in-a-token).<br>You must set this flag to obtain a handle to a directory. A directory handle can be passed to some<br>functions instead of a file handle. For more information, see the Remarks section. |
| **FILE\_FLAG\_DELETE\_ON\_CLOSE**0x04000000 | The file is to be deleted immediately after all of its handles are closed, which includes the specified <br> handle and any other open or duplicated handles.<br>If there are existing open handles to a file, the call fails unless they were all opened with the<br>**FILE\_SHARE\_DELETE** share mode.<br>Subsequent open requests for the file fail, unless the **FILE\_SHARE\_DELETE** share<br>mode is specified. |
| **FILE\_FLAG\_NO\_BUFFERING**0x20000000 | The file or device is being opened with no system caching for data reads and writes. This flag does not <br> affect hard disk caching or memory mapped files.<br>There are strict requirements for successfully working with files opened with<br>**CreateFile** using the<br>**FILE\_FLAG\_NO\_BUFFERING** flag, for details see<br>[File Buffering](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-buffering). |
| **FILE\_FLAG\_OPEN\_NO\_RECALL**0x00100000 | The file data is requested, but it should continue to be located in remote storage. It should not be <br> transported back to local storage. This flag is for use by remote storage systems. |
| **FILE\_FLAG\_OPEN\_REPARSE\_POINT**0x00200000 | Normal [reparse point](https://learn.microsoft.com/en-us/windows/desktop/FileIO/reparse-points) processing will not <br> occur; **CreateFile** will attempt to open the reparse <br> point. When a file is opened, a file handle is returned, whether or not the filter that controls the reparse <br> point is operational.<br>This flag cannot be used with the **CREATE\_ALWAYS** flag.<br>If the file is not a reparse point, then this flag is ignored.<br>For more information, see the Remarks section. |
| **FILE\_FLAG\_OVERLAPPED**0x40000000 | The file or device is being opened or created for asynchronous I/O.<br>When subsequent I/O operations are completed on this handle, the event specified in the<br>[OVERLAPPED](https://learn.microsoft.com/en-us/windows/desktop/api/minwinbase/ns-minwinbase-overlapped) structure will be set to the<br>signaled state.<br>If this flag is specified, the file can be used for simultaneous read and write operations.<br>If this flag is not specified, then I/O operations are serialized, even if the calls to the read and write<br>functions specify an [OVERLAPPED](https://learn.microsoft.com/en-us/windows/desktop/api/minwinbase/ns-minwinbase-overlapped) structure.<br>For information about considerations when using a file handle created with this flag, see the<br>[Synchronous and Asynchronous I/O Handles](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#synchronous_and_asynchronous_i_o_handles)<br>section of this topic. |
| **FILE\_FLAG\_POSIX\_SEMANTICS**0x01000000 | Access will occur according to POSIX rules. This includes allowing multiple files with names, differing <br> only in case, for file systems that support that naming. Use care when using this option, because files <br> created with this flag may not be accessible by applications that are written for MS-DOS or 16-bit <br> Windows. |
| **FILE\_FLAG\_RANDOM\_ACCESS**0x10000000 | Access is intended to be random. The system can use this as a hint to optimize file caching.<br>This flag has no effect if the file system does not support cached I/O and<br>**FILE\_FLAG\_NO\_BUFFERING**.<br>For more information, see the [Caching Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#caching_behavior) section of this<br>topic. |
| **FILE\_FLAG\_SESSION\_AWARE**0x00800000 | The file or device is being opened with session awareness. If this flag is not specified, then per-session <br> devices (such as a device using RemoteFX USB Redirection) cannot be opened by processes running in session 0. <br> This flag has no effect for callers not in session 0. This flag is supported only on server editions of <br> Windows.<br>**Windows Server 2008 R2 and Windows Server 2008:** This flag is not supported before Windows Server 2012. |
| **FILE\_FLAG\_SEQUENTIAL\_SCAN**0x08000000 | Access is intended to be sequential from beginning to end. The system can use this as a hint to optimize <br> file caching.<br>This flag should not be used if read-behind (that is, reverse scans) will be used.<br>This flag has no effect if the file system does not support cached I/O and<br>**FILE\_FLAG\_NO\_BUFFERING**.<br>For more information, see the [Caching Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#caching_behavior) section of this<br>topic. |
| **FILE\_FLAG\_WRITE\_THROUGH**0x80000000 | Write operations will not go through any intermediate cache, they will go directly to disk.<br>For additional information, see the [Caching Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#caching_behavior) section of this<br>topic. |

The _dwFlagsAndAttributes_ parameter can also specify SQOS information. For more
information, see
[Impersonation Levels](https://learn.microsoft.com/en-us/windows/desktop/SecAuthZ/impersonation-levels). When the
calling application specifies the **SECURITY\_SQOS\_PRESENT** flag as part of
_dwFlagsAndAttributes_, it can also contain one or more of the following values.

Expand table

| Security flag | Meaning |
| --- | --- |
| **SECURITY\_ANONYMOUS** | Impersonates a client at the Anonymous impersonation level. |
| **SECURITY\_CONTEXT\_TRACKING** | The security tracking mode is dynamic. If this flag is not specified, the security tracking mode is <br> static. |
| **SECURITY\_DELEGATION** | Impersonates a client at the Delegation impersonation level. |
| **SECURITY\_EFFECTIVE\_ONLY** | Only the enabled aspects of the client's security context are available to the server. If you do not <br> specify this flag, all aspects of the client's security context are available.<br>This allows the client to limit the groups and privileges that a server can use while impersonating the<br>client. |
| **SECURITY\_IDENTIFICATION** | Impersonates a client at the Identification impersonation level. |
| **SECURITY\_IMPERSONATION** | Impersonate a client at the impersonation level. This is the default behavior if no other flags are <br> specified along with the **SECURITY\_SQOS\_PRESENT** flag. |

`[in, optional] hTemplateFile`

A valid handle to a template file with the **GENERIC\_READ** access right. The template
file supplies file attributes and extended attributes for the file that is being created.

This parameter can be **NULL**.

When opening an existing file, **CreateFile** ignores this
parameter.

When opening a new encrypted file, the file inherits the discretionary access control list from its parent
directory. For additional information, see
[File Encryption](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-encryption).

[Section titled: Return value](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#return-value)

## Return value

If the function succeeds, the return value is an open handle to the specified file, device, named pipe, or
mail slot.

If the function fails, the return value is **INVALID\_HANDLE\_VALUE**. To get extended
error information, call [GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror).

[Section titled: Remarks](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#remarks)

## Remarks

**CreateFile** was originally developed specifically for file
interaction but has since been expanded and enhanced to include most other types of I/O devices and mechanisms
available to Windows developers. This section attempts to cover the varied issues developers may experience when
using **CreateFile** in different contexts and with different I/O
types. The text attempts to use the word _file_ only when referring specifically to data stored in an
actual file on a file system. However, some uses of _file_ may be referring more generally to an I/O
object that supports file-like mechanisms. This liberal use of the term _file_ is particularly
prevalent in constant names and parameter names because of the previously mentioned historical reasons.

When an application is finished using the object handle returned by
**CreateFile**, use the
[CloseHandle](https://learn.microsoft.com/en-us/windows/desktop/api/handleapi/nf-handleapi-closehandle) function to close the handle. This not only
frees up system resources, but can have wider influence on things like sharing the file or device and committing
data to disk. Specifics are noted within this topic as appropriate.

**Windows Server 2003 and Windows XP:** A sharing violation occurs if an attempt is made to open a file or directory for deletion on a remote
computer when the value of the _dwDesiredAccess_ parameter is the
**DELETE** access flag (0x00010000) **OR**'ed with any other access flag, and the remote file
or directory has not been opened with **FILE\_SHARE\_DELETE**. To avoid the sharing violation
in this scenario, open the remote file or directory with the **DELETE** access right only,
or call [DeleteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-deletefilea) without first opening the file or
directory for deletion.

Some file systems, such as the NTFS file system, support compression or encryption for individual files and
directories. On volumes that have a mounted file system with this support, a new file inherits the compression
and encryption attributes of its directory.

You cannot use **CreateFile** to control compression,
decompression, or decryption on a file or directory. For more information, see
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files),
[File Compression and Decompression](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-compression-and-decompression),
and [File Encryption](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-encryption).

**Windows Server 2003 and Windows XP:** For backward compatibility purposes, **CreateFile** does
not apply inheritance rules when you specify a security descriptor in
_lpSecurityAttributes_. To support inheritance, functions that later query the security
descriptor of this file may heuristically determine and report that inheritance is in effect. For more
information, see
[Automatic Propagation of Inheritable ACEs](https://learn.microsoft.com/en-us/windows/desktop/SecAuthZ/automatic-propagation-of-inheritable-aces).

As stated previously, if the _lpSecurityAttributes_ parameter is
**NULL**, the handle returned by
**CreateFile** cannot be inherited by any child processes your
application may create. The following information regarding this parameter also applies:

- If the **bInheritHandle** member variable is not **FALSE**,
which is any nonzero value, then the handle can be inherited. Therefore it is critical this structure member be
properly initialized to **FALSE** if you do not intend the handle to be inheritable.
- The access control lists (ACL) in the default security descriptor for a file or directory are inherited
from its parent directory.
- The target file system must support security on files and directories for the
**lpSecurityDescriptor** member to have an effect on them, which can be determined by
using [GetVolumeInformation](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-getvolumeinformationa).

In Windows 8 and Windows Server 2012, this function is supported by the following technologies.

Expand table

| Technology | Supported |
| --- | --- |
| Server Message Block (SMB) 3.0 protocol | Yes |
| SMB 3.0 Transparent Failover (TFO) | See remarks |
| SMB 3.0 with Scale-out File Shares (SO) | See remarks |
| Cluster Shared Volume File System (CsvFS) | Yes |
| Resilient File System (ReFS) | Yes |

Note that **CreateFile** with supersede disposition will fail if performed on a file where there is already an open alternate data stream.

[Section titled: Symbolic Link Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#symbolic-link-behavior)

### Symbolic Link Behavior

If the call to this function creates a file, there is no change in behavior. Also, consider the following
information regarding **FILE\_FLAG\_OPEN\_REPARSE\_POINT**:

- If **FILE\_FLAG\_OPEN\_REPARSE\_POINT** is specified:

  - If an existing file is opened and it is a symbolic link, the handle returned is a handle to the
     symbolic link.
  - If **TRUNCATE\_EXISTING** or **FILE\_FLAG\_DELETE\_ON\_CLOSE**
     are specified, the file affected is a symbolic link.
- If **FILE\_FLAG\_OPEN\_REPARSE\_POINT** is not specified:

  - If an existing file is opened and it is a symbolic link, the handle returned is a handle to the
     target.
  - If **CREATE\_ALWAYS**, **TRUNCATE\_EXISTING**, or
     **FILE\_FLAG\_DELETE\_ON\_CLOSE** are specified, the file affected is the target.

[Section titled: Caching Behavior](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#caching-behavior)

### Caching Behavior

Several of the possible values for the _dwFlagsAndAttributes_ parameter are used by
**CreateFile** to control or affect how the data associated
with the handle is cached by the system. They are:

- **FILE\_FLAG\_NO\_BUFFERING**
- **FILE\_FLAG\_RANDOM\_ACCESS**
- **FILE\_FLAG\_SEQUENTIAL\_SCAN**
- **FILE\_FLAG\_WRITE\_THROUGH**
- **FILE\_ATTRIBUTE\_TEMPORARY**

If none of these flags is specified, the system uses a default general-purpose caching scheme. Otherwise, the
system caching behaves as specified for each flag.

Some of these flags should not be combined. For instance, combining
**FILE\_FLAG\_RANDOM\_ACCESS** with **FILE\_FLAG\_SEQUENTIAL\_SCAN** is
self-defeating.

Specifying the **FILE\_FLAG\_SEQUENTIAL\_SCAN** flag can increase performance for
applications that read large files using sequential access. Performance gains can be even more noticeable for
applications that read large files mostly sequentially, but occasionally skip forward over small ranges of
bytes. If an application moves the file pointer for random access, optimum caching performance most likely will
not occur. However, correct operation is still guaranteed.

The flags **FILE\_FLAG\_WRITE\_THROUGH** and
**FILE\_FLAG\_NO\_BUFFERING** are independent and may be combined.

If **FILE\_FLAG\_WRITE\_THROUGH** is used but
**FILE\_FLAG\_NO\_BUFFERING** is not also specified, so that system caching is in effect,
then the data is written to the system cache but is flushed to disk without delay.

If **FILE\_FLAG\_WRITE\_THROUGH** and **FILE\_FLAG\_NO\_BUFFERING** are
both specified, so that system caching is not in effect, then the data is immediately flushed to disk without
going through the Windows system cache. The operating system also requests a write-through of the hard disk's
local hardware cache to persistent media.

**Note** Not all hard disk hardware supports this write-through capability.

Proper use of the **FILE\_FLAG\_NO\_BUFFERING** flag requires special application
considerations. For more information, see
[File Buffering](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-buffering).

A write-through request via **FILE\_FLAG\_WRITE\_THROUGH** also causes NTFS to flush any
metadata changes, such as a time stamp update or a rename operation, that result from processing the request.
For this reason, the **FILE\_FLAG\_WRITE\_THROUGH** flag is often used with the
**FILE\_FLAG\_NO\_BUFFERING** flag as a replacement for calling the
[FlushFileBuffers](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-flushfilebuffers) function after each write, which can
cause unnecessary performance penalties. Using these flags together avoids those penalties. For general
information about the caching of files and metadata, see
[File Caching](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-caching).

When **FILE\_FLAG\_NO\_BUFFERING** is combined with
**FILE\_FLAG\_OVERLAPPED**, the flags give maximum asynchronous performance, because the I/O
does not rely on the synchronous operations of the memory manager. However, some I/O operations take more time,
because data is not being held in the cache. Also, the file metadata may still be cached (for example, when
creating an empty file). To ensure that the metadata is flushed to disk, use the
[FlushFileBuffers](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-flushfilebuffers) function.

Specifying the **FILE\_ATTRIBUTE\_TEMPORARY** attribute causes file systems to avoid
writing data back to mass storage if sufficient cache memory is available, because an application deletes a
temporary file after a handle is closed. In that case, the system can entirely avoid writing the data. Although
it does not directly control data caching in the same way as the previously mentioned flags, the
**FILE\_ATTRIBUTE\_TEMPORARY** attribute does tell the system to hold as much as possible in
the system cache without writing and therefore may be of concern for certain applications.

[Section titled: Files](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#files)

### Files

If you rename or delete a file and then restore it shortly afterward, the system searches the cache for file
information to restore. Cached information includes its short/long name pair and creation time.

If you call **CreateFile** on a file that is pending deletion
as a result of a previous call to [DeleteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-deletefilea), the function
fails. The operating system delays file deletion until all handles to the file are closed.
[GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror) returns
**ERROR\_ACCESS\_DENIED**.

The _dwDesiredAccess_ parameter can be zero, allowing the application to query file
attributes without accessing the file if the application is running with adequate security settings. This is
useful to test for the existence of a file without opening it for read and/or write access, or to obtain other
statistics about the file or directory. See
[Obtaining and Setting File Information](https://learn.microsoft.com/en-us/windows/desktop/FileIO/obtaining-and-setting-file-information)
and [GetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-getfileinformationbyhandle).

If **CREATE\_ALWAYS** and **FILE\_ATTRIBUTE\_NORMAL** are
specified, **CreateFile** fails and sets the last error to
**ERROR\_ACCESS\_DENIED** if the file exists and has the
**FILE\_ATTRIBUTE\_HIDDEN** or **FILE\_ATTRIBUTE\_SYSTEM** attribute.
To avoid the error, specify the same attributes as the existing file.

When an application creates a file across a network, it is better to use
`GENERIC_READ | GENERIC_WRITE` for
_dwDesiredAccess_ than to use **GENERIC\_WRITE** alone. The
resulting code is faster, because the redirector can use the cache manager and send fewer SMBs with more data.
This combination also avoids an issue where writing to a file across a network can occasionally return
**ERROR\_ACCESS\_DENIED**.

For more information, see
[Creating and Opening Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-opening-files).

[Section titled: Synchronous and Asynchronous I/O Handles](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#synchronous-and-asynchronous-i-o-handles)

### Synchronous and Asynchronous I/O Handles

**CreateFile** provides for creating a file or device handle
that is either synchronous or asynchronous. A synchronous handle behaves such that I/O function calls using that
handle are blocked until they complete, while an asynchronous file handle makes it possible for the system to
return immediately from I/O function calls, whether they completed the I/O operation or not. As stated
previously, this synchronous versus asynchronous behavior is determined by specifying
**FILE\_FLAG\_OVERLAPPED** within the _dwFlagsAndAttributes_
parameter. There are several complexities and potential pitfalls when using asynchronous I/O; for more
information, see
[Synchronous and Asynchronous I/O](https://learn.microsoft.com/en-us/windows/desktop/FileIO/synchronous-and-asynchronous-i-o).

[Section titled: File Streams](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#file-streams)

### File Streams

On NTFS file systems, you can use **CreateFile** to create
separate streams within a file. For more information, see
[File Streams](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-streams).

[Section titled: Directories](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#directories)

### Directories

An application cannot create a directory by using
**CreateFile**, therefore only the
**OPEN\_EXISTING** value is valid for
_dwCreationDisposition_ for this use case. To create a directory, the application must
call [CreateDirectory](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-createdirectorya) or
[CreateDirectoryEx](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createdirectoryexa).

To open a directory using **CreateFile**, specify the
**FILE\_FLAG\_BACKUP\_SEMANTICS** flag as part of
_dwFlagsAndAttributes_. Appropriate security checks still apply when this flag is used
without **SE\_BACKUP\_NAME** and **SE\_RESTORE\_NAME** privileges.

When using **CreateFile** to open a directory during
defragmentation of a FAT or FAT32 file system volume, do not specify the
**MAXIMUM\_ALLOWED** access right. Access to the directory is denied if this is done.
Specify the **GENERIC\_READ** access right instead.

For more information, see
[About Directory Management](https://learn.microsoft.com/en-us/windows/desktop/FileIO/about-directory-management).

[Section titled: Physical Disks and Volumes](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#physical-disks-and-volumes)

### Physical Disks and Volumes

Direct access to the disk or to a volume is restricted.

**Windows Server 2003 and Windows XP:** Direct access to the disk or to a volume is not restricted in this manner.

You can use the **CreateFile** function to open a physical
disk drive or a volume, which returns a direct access storage device (DASD) handle that can be used with the
[DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) function. This enables you to access
the disk or volume directly, for example such disk metadata as the partition table. However, this type of access
also exposes the disk drive or volume to potential data loss, because an incorrect write to a disk using this
mechanism could make its contents inaccessible to the operating system. To ensure data integrity, be sure to
become familiar with **DeviceIoControl** and how other
APIs behave differently with a direct access handle as opposed to a file system handle.

The following requirements must be met for such a call to succeed:

- The caller must have administrative privileges. For more information, see
[Running with Special Privileges](https://learn.microsoft.com/en-us/windows/desktop/SecBP/running-with-special-privileges).
- The _dwCreationDisposition_ parameter must have the
**OPEN\_EXISTING** flag.
- When opening a volume or floppy disk, the _dwShareMode_ parameter must have the
**FILE\_SHARE\_WRITE** flag.

**Note** The _dwDesiredAccess_ parameter can be zero, allowing the application to query
device attributes without accessing a device. This is useful for an application to determine the size of a
floppy disk drive and the formats it supports without requiring a floppy disk in a drive, for instance. It can
also be used for reading statistics without requiring higher-level data read/write permission.

When opening a physical drive _x_:, the
_lpFileName_ string should be the following form:
"\\\.\\PhysicalDrive _X_". Hard disk numbers
start at zero. The following table shows some examples of physical drive strings.

Expand table

| String | Meaning |
| --- | --- |
| "\\\.\\PhysicalDrive0" | Opens the first physical drive. |
| "\\\.\\PhysicalDrive2" | Opens the third physical drive. |

To obtain the physical drive identifier for a volume, open a handle to the volume and call the
[DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) function with
[IOCTL\_VOLUME\_GET\_VOLUME\_DISK\_EXTENTS](https://learn.microsoft.com/en-us/windows/desktop/api/winioctl/ni-winioctl-ioctl_volume_get_volume_disk_extents).
This control code returns the disk number and offset for each of the volume's one or more extents; a volume can
span multiple physical disks.

For an example of opening a physical drive, see
[Calling DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/DevIO/calling-deviceiocontrol).

When opening a volume or removable media drive (for example, a floppy disk drive or flash memory thumb drive),
the _lpFileName_ string should be the following form:
"\\\.\ _X_:". Do not use a trailing backslash
(\\), which indicates the root directory of a drive. The following table shows some examples of drive strings.

Expand table

| String | Meaning |
| --- | --- |
| "\\\.\\A:" | Opens floppy disk drive A. |
| "\\\.\\C:" | Opens the C: volume. |
| "\\\.\\C:\\" | Opens the file system of the C: volume. |

You can also open a volume by referring to its volume name. For more information, see
[Naming a Volume](https://learn.microsoft.com/en-us/windows/desktop/FileIO/naming-a-volume).

A volume contains one or more mounted file systems. Volume handles can be opened as noncached at the
discretion of the particular file system, even when the noncached option is not specified in
**CreateFile**. You should assume that all Microsoft file
systems open volume handles as noncached. The restrictions on noncached I/O for files also apply to volumes.

A file system may or may not require buffer alignment even though the data is noncached. However, if the
noncached option is specified when opening a volume, buffer alignment is enforced regardless of the file system
on the volume. It is recommended on all file systems that you open volume handles as noncached, and follow the
noncached I/O restrictions.

**Note** To read or write to the last few sectors of the volume, you must call
[DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) and specify
[FSCTL\_ALLOW\_EXTENDED\_DASD\_IO](https://learn.microsoft.com/en-us/windows/desktop/api/winioctl/ni-winioctl-fsctl_allow_extended_dasd_io). This signals
the file system driver not to perform any I/O boundary checks on partition read or write calls. Instead,
boundary checks are performed by the device driver.

[Section titled: Changer Device](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#changer-device)

### Changer Device

The **IOCTL\_CHANGER\_\*** control codes for
[DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) accept a handle to a changer device.
To open a changer device, use a file name of the following form:
"\\\.\\Changer _x_" where
_x_ is a number that indicates which device to open, starting with zero. To open
changer device zero in an application that is written in C or C++, use the following file name:
"\\\\\\.\\\Changer0".

[Section titled: Tape Drives](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#tape-drives)

### Tape Drives

You can open tape drives by using a file name of the following form:
"\\\.\\TAPE _x_" where
_x_ is a number that indicates which drive to open, starting with tape drive zero. To
open tape drive zero in an application that is written in C or C++, use the following file name:
"\\\\\\.\\\TAPE0".

For more information, see [Backup](https://learn.microsoft.com/en-us/windows/desktop/Backup/backup).

[Section titled: Communications Resources](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#communications-resources)

### Communications Resources

The **CreateFile** function can create a handle to a
communications resource, such as the serial port COM1. For communications resources,
the _dwCreationDisposition_ parameter must be
**OPEN\_EXISTING**, the _dwShareMode_ parameter must be zero
(exclusive access), and the _hTemplateFile_ parameter must be
**NULL**. Read, write, or read/write access can be specified, and the handle can be opened
for overlapped I/O.

To specify a COM port number greater than 9, use the following syntax:
"\\.\\COM10". This syntax works for all port numbers and hardware that
allows COM port numbers to be specified.

For more information about communications, see
[Communications](https://learn.microsoft.com/en-us/windows/desktop/DevIO/communications-resources).

[Section titled: Consoles](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#consoles)

### Consoles

The **CreateFile** function can create a handle to console
input (CONIN$). If the process has an open handle to it as a result of inheritance or
duplication, it can also create a handle to the active screen buffer (CONOUT$). The
calling process must be attached to an inherited console or one allocated by the
[AllocConsole](https://learn.microsoft.com/en-us/windows/console/allocconsole) function. For console handles, set the
**CreateFile** parameters as follows.

Expand table

| Parameters | Value |
| --- | --- |
| _lpFileName_ | Use the CONIN$ value to specify console input.<br>Use the CONOUT$ value to specify console output.<br>CONIN$ gets a handle to the console input buffer, even if the<br>[SetStdHandle](https://learn.microsoft.com/en-us/windows/console/setstdhandle) function redirects the standard input<br>handle. To get the standard input handle, use the<br>[GetStdHandle](https://learn.microsoft.com/en-us/windows/console/getstdhandle) function.<br>CONOUT$ gets a handle to the active screen buffer, even if<br>[SetStdHandle](https://learn.microsoft.com/en-us/windows/console/setstdhandle) redirects the standard output handle. To<br>get the standard output handle, use [GetStdHandle](https://learn.microsoft.com/en-us/windows/console/getstdhandle). |
| _dwDesiredAccess_ | `GENERIC_READ | GENERIC_WRITE` is preferred, but either one can <br> limit access. |
| _dwShareMode_ | When opening CONIN$, specify <br> **FILE\_SHARE\_READ**. When opening CONOUT$, specify <br> **FILE\_SHARE\_WRITE**.<br>If the calling process inherits the console, or if a child process should be able to access the console,<br>this parameter must be `FILE_SHARE_READ | FILE_SHARE_WRITE`. |
| _lpSecurityAttributes_ | If you want the console to be inherited, the **bInheritHandle** member of the <br> [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/windows/win32/api/wtypesbase/ns-wtypesbase-security_attributes) structure <br> must be **TRUE**. |
| _dwCreationDisposition_ | You should specify **OPEN\_EXISTING** when using <br> **CreateFile** to open the console. |
| _dwFlagsAndAttributes_ | Ignored. |
| _hTemplateFile_ | Ignored. |

The following table shows various settings of _dwDesiredAccess_ and
_lpFileName_.

Expand table

| _lpFileName_ | _dwDesiredAccess_ | Result |
| --- | --- | --- |
| "CON" | **GENERIC\_READ** | Opens console for input. |
| "CON" | **GENERIC\_WRITE** | Opens console for output. |
| "CON" | `GENERIC_READ | GENERIC_WRITE` | Causes **CreateFile** to fail; <br> [GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror) returns <br> **ERROR\_FILE\_NOT\_FOUND**. |

[Section titled: Mailslots](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#mailslots)

### Mailslots

If **CreateFile** opens the client end of a mailslot, the
function returns **INVALID\_HANDLE\_VALUE** if the mailslot client attempts to open a local
mailslot before the mailslot server has created it with the
[CreateMailSlot](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createmailslota) function.

For more information, see [Mailslots](https://learn.microsoft.com/en-us/windows/desktop/ipc/mailslots).

[Section titled: Pipes](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#pipes)

### Pipes

If **CreateFile** opens the client end of a named pipe, the
function uses any instance of the named pipe that is in the listening state. The opening process can duplicate
the handle as many times as required, but after it is opened, the named pipe instance cannot be opened by
another client. The access that is specified when a pipe is opened must be compatible with the access that is
specified in the _dwOpenMode_ parameter of the
[CreateNamedPipe](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createnamedpipea) function.

If the [CreateNamedPipe](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createnamedpipea) function was not
successfully called on the server prior to this operation, a pipe will not exist and
**CreateFile** will fail with
**ERROR\_FILE\_NOT\_FOUND**.

If there is at least one active pipe instance but there are no available listener pipes on the server, which
means all pipe instances are currently connected,
**CreateFile** fails with
**ERROR\_PIPE\_BUSY**.

For more information, see [Pipes](https://learn.microsoft.com/en-us/windows/desktop/ipc/pipes).

[Section titled: Examples](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#examples)

#### Examples

Example file operations are shown in the following topics:

- [Appending One File to Another File](https://learn.microsoft.com/en-us/windows/desktop/FileIO/appending-one-file-to-another-file)
- [Canceling Pending I/O Operations](https://learn.microsoft.com/en-us/windows/desktop/FileIO/canceling-pending-i-o-operations)
- [Creating a Child Process with Redirected Input and Output](https://learn.microsoft.com/en-us/windows/desktop/ProcThread/creating-a-child-process-with-redirected-input-and-output)
- [Creating and Using a Temporary File](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating-and-using-a-temporary-file)
- [FSCTL\_RECALL\_FILE](https://learn.microsoft.com/en-us/windows/desktop/api/winioctl/ni-winioctl-fsctl_recall_file)
- [GetFinalPathNameByHandle](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-getfinalpathnamebyhandlea)
- [Locking and Unlocking Byte Ranges in Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/locking-and-unlocking-byte-ranges-in-files)
- [Obtaining a File Name From a File Handle](https://learn.microsoft.com/en-us/windows/desktop/Memory/obtaining-a-file-name-from-a-file-handle)
- [Obtaining File System Recognition Information](https://learn.microsoft.com/en-us/windows/desktop/FileIO/obtaining-file-system-recognition-information)
- [Opening a File for Reading or Writing](https://learn.microsoft.com/en-us/windows/desktop/FileIO/opening-a-file-for-reading-or-writing)
- [Retrieving the Last-Write Time](https://learn.microsoft.com/en-us/windows/desktop/SysInfo/retrieving-the-last-write-time)
- [SetFileInformationByHandle](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-setfileinformationbyhandle)
- [Testing for the End of a File](https://learn.microsoft.com/en-us/windows/desktop/FileIO/testing-for-the-end-of-a-file)
- [Using Fibers](https://learn.microsoft.com/en-us/windows/desktop/ProcThread/using-fibers)
- [Using Streams](https://learn.microsoft.com/en-us/windows/desktop/FileIO/using-streams)
- [Walking a Buffer of Change Journal Records](https://learn.microsoft.com/en-us/windows/desktop/FileIO/walking-a-buffer-of-change-journal-records)
- [Wow64DisableWow64FsRedirection](https://learn.microsoft.com/en-us/windows/win32/api/wow64apiset/nf-wow64apiset-wow64disablewow64fsredirection)
- [Wow64EnableWow64FsRedirection](https://learn.microsoft.com/en-us/windows/win32/api/wow64apiset/nf-wow64apiset-wow64enablewow64fsredirection)

Physical device I/O is demonstrated in the following topics:

- [Calling DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/DevIO/calling-deviceiocontrol)
- [Configuring a Communications Resource](https://learn.microsoft.com/en-us/windows/desktop/DevIO/configuring-a-communications-resource)
- [Monitoring Communications Events](https://learn.microsoft.com/en-us/windows/desktop/DevIO/monitoring-communications-events)
- [Processing a Request to Remove a Device](https://learn.microsoft.com/en-us/windows/desktop/DevIO/processing-a-request-to-remove-a-device)

An example using named pipes is located at
[Named Pipe Client](https://learn.microsoft.com/en-us/windows/desktop/ipc/named-pipe-client).

Working with a mailslot is shown in
[Writing to a Mailslot](https://learn.microsoft.com/en-us/windows/desktop/ipc/writing-to-a-mailslot).

A tape backup code snippet can found at
[Creating a Backup Application](https://learn.microsoft.com/en-us/windows/desktop/Backup/creating-a-backup-application).

Note

The fileapi.h header defines CreateFile as an alias that automatically selects the ANSI or Unicode version of this function based on the definition of the UNICODE preprocessor constant. Mixing usage of the encoding-neutral alias with code that is not encoding-neutral can lead to mismatches that result in compilation or runtime errors. For more information, see [Conventions for Function Prototypes](https://learn.microsoft.com/en-us/windows/win32/intl/conventions-for-function-prototypes).

[Section titled: Requirements](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#requirements)

## Requirements

Expand table

| Requirement | Value |
| --- | --- |
| **Minimum supported client** | Windows XP \[desktop apps only\] |
| **Minimum supported server** | Windows Server 2003 \[desktop apps only\] |
| **Target Platform** | Windows |
| **Header** | fileapi.h (include Windows.h) |
| **Library** | Kernel32.lib |
| **DLL** | Kernel32.dll |

[Section titled: See also](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#see-also)

## See also

[About Directory Management](https://learn.microsoft.com/en-us/windows/desktop/FileIO/about-directory-management)

[About Volume Management](https://learn.microsoft.com/en-us/windows/desktop/FileIO/about-volume-management)

[Backup](https://learn.microsoft.com/en-us/windows/desktop/Backup/backup)

[CloseHandle](https://learn.microsoft.com/en-us/windows/desktop/api/handleapi/nf-handleapi-closehandle)

[Communications](https://learn.microsoft.com/en-us/windows/desktop/DevIO/communications-resources)

[CreateDirectory](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-createdirectorya)

[CreateDirectoryEx](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createdirectoryexa)

[CreateFileTransacted](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createfiletransacteda)

[CreateMailSlot](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createmailslota)

[CreateNamedPipe](https://learn.microsoft.com/en-us/windows/desktop/api/winbase/nf-winbase-createnamedpipea)

[Creating, Deleting, and Maintaining Files](https://learn.microsoft.com/en-us/windows/desktop/FileIO/creating--deleting--and-maintaining-files)

[DeleteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-deletefilea)

[Device Input and Output Control (IOCTL)](https://learn.microsoft.com/en-us/windows/desktop/DevIO/device-input-and-output-control-ioctl-)

[DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol)

[File Compression and Decompression](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-compression-and-decompression)

[File Encryption](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-encryption)

[File Management Functions](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-management-functions)

[File Security and Access Rights](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-security-and-access-rights)

[File Streams](https://learn.microsoft.com/en-us/windows/desktop/FileIO/file-streams)

**Functions**

[GetLastError](https://learn.microsoft.com/en-us/windows/desktop/api/errhandlingapi/nf-errhandlingapi-getlasterror)

[I/O Completion Ports](https://learn.microsoft.com/en-us/windows/desktop/FileIO/i-o-completion-ports)

[I/O Concepts](https://learn.microsoft.com/en-us/windows/desktop/FileIO/i-o-concepts)

[Mailslots](https://learn.microsoft.com/en-us/windows/desktop/ipc/mailslots)

[Obtaining and Setting File Information](https://learn.microsoft.com/en-us/windows/desktop/FileIO/obtaining-and-setting-file-information)

**Overview Topics**

[Pipes](https://learn.microsoft.com/en-us/windows/desktop/ipc/pipes)

[ReadFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-readfile)

[ReadFileEx](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-readfileex)

[Running with Special Privileges](https://learn.microsoft.com/en-us/windows/desktop/SecBP/running-with-special-privileges)

[SetFileAttributes](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-setfileattributesa)

[WriteFile](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-writefile)

[WriteFileEx](https://learn.microsoft.com/en-us/windows/desktop/api/fileapi/nf-fileapi-writefileex)

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

- Last updated on 02/08/2023

Ask Learn is an AI assistant that can answer questions, clarify concepts, and define terms using trusted Microsoft documentation.

Please sign in to use Ask Learn.

[Sign in](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew#)
