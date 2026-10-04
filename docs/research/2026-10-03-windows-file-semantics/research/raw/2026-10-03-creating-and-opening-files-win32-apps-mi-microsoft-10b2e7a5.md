---
url: https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Creating and Opening Files - Win32 apps | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/FileIO/creating-and-opening-files.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# Creating and opening files

Feedback

Summarize this article for me


The [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function can create a new file or open an existing file. You must specify the file name, creation instructions, and other attributes. When an application creates a new file, the operating system adds it to the specified directory.

[Section titled: Choosing the right file API](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#choosing-the-right-file-api)

## Choosing the right file API

Expand table

| Scenario | Recommended API | Notes |
| --- | --- | --- |
| Simple file read/write in C/C++ | `fopen`/`fread`/`fwrite` (CRT) or C++ `std::ifstream`/`std::ofstream` | Portable, handles buffering automatically. Sufficient for most application-level file I/O. |
| File path manipulation and enumeration | C++17 `std::filesystem` | Portable, modern C++. Use for directory traversal, path operations, and basic file metadata. |
| Overlapped (asynchronous) I/O | **CreateFile** with `FILE_FLAG_OVERLAPPED` | Required for I/O completion ports, high-performance servers, and non-blocking file operations. |
| Fine-grained sharing or locking | **CreateFile** with _dwShareMode_ | Only CreateFile provides control over concurrent file access between processes. |
| Memory-mapped files | **CreateFile** \+ [CreateFileMapping](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createfilemappinga) | Required for shared memory, large file random access, and inter-process communication. |
| Devices, pipes, mailslots, or consoles | **CreateFile** | CRT and standard library APIs don't support these Win32 object types. |
| .NET managed applications | `System.IO.File` / `System.IO.FileStream` | Preferred for .NET code. Uses CreateFile internally but provides exception-based error handling and async/await. |

Important

**Error handling**: Always check the return value of **CreateFile**. On failure it returns `INVALID_HANDLE_VALUE` (not `NULL`). Call [GetLastError](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror) immediately after the call fails to obtain the specific error code. Common errors include `ERROR_FILE_NOT_FOUND`, `ERROR_ACCESS_DENIED`, and `ERROR_SHARING_VIOLATION`.

Note

**Common pitfall — dwShareMode**: Setting _dwShareMode_ to `0` (exclusive access) is safe but may cause `ERROR_SHARING_VIOLATION` if another process already has the file open. For log files or files that other processes may read concurrently, use `FILE_SHARE_READ`. Avoid `FILE_SHARE_WRITE` unless you have a coordination mechanism — concurrent uncoordinated writes can corrupt file content.

[Section titled: Working with files in your application](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#working-with-files-in-your-application)

## Working with files in your application

The operating system assigns a unique identifier, called a _handle_, to each file that is opened or created using [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea). An application can use this handle with functions that read from, write to, and describe the file. It is valid until all references to that handle are closed. When an application starts, it inherits all open handles from the process that started it if the handles were created as inheritable.

An application should check the value of the handle returned by [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) before attempting to use the handle to access the file. If an error occurs, the handle value will be **INVALID\_HANDLE\_VALUE** and the application can use the [GetLastError](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror) function for extended error information.

When an application uses [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea), it must use the _dwDesiredAccess_ parameter to specify whether it intends to read from the file, write to the file, both read and write, or neither. This is known as requesting an _access mode_. The application must also use the _dwCreationDisposition_ parameter to specify what action to take if the file already exists, known as the _creation disposition_. For example, an application can call [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) with _dwCreationDisposition_ set to **CREATE\_ALWAYS** to always create a new file, even if a file of the same name already exists (thus overwriting the existing file). Whether this succeeds or not depends on factors such as the previous file's attributes and security settings (see the following sections for more information).

An application also uses [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) to specify whether it wants to share the file for reading, writing, both, or neither. This is known as the _sharing mode_. An open file that is not shared ( _dwShareMode_ set to zero) cannot be opened again, either by the application that opened it or by another application, until its handle has been closed. This is also referred to as exclusive access.

When a process uses [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) to attempt to open a file that has already been opened in a sharing mode ( _dwShareMode_ set to a valid nonzero value), the system compares the requested access and sharing modes to those specified when the file was opened. If you specify an access or sharing mode that conflicts with the modes specified in the previous call, **CreateFile** fails.

The following table illustrates the valid combinations of two calls to [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) using various access modes and sharing modes ( _dwDesiredAccess_, _dwShareMode_ respectively). It does not matter in which order the **CreateFile** calls are made. However, any subsequent file I/O operations on each file handle will still be constrained by the current access and sharing modes associated with that particular file handle.

Expand table

| First call to CreateFile | Valid second calls to CreateFile |
| --- | --- |
| **GENERIC\_READ**, **FILE\_SHARE\_READ** | \- **GENERIC\_READ**, **FILE\_SHARE\_READ**<br>\- **GENERIC\_READ**, **FILE\_SHARE\_READ** **FILE\_SHARE\_WRITE** |
| **GENERIC\_READ**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ** **FILE\_SHARE\_WRITE** |
| **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_READ**, **FILE\_SHARE\_READ**<br>\- **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ** **GENERIC\_WRITE**, **FILE\_SHARE\_READ**<br>\- **GENERIC\_READ** **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_WRITE**, **FILE\_SHARE\_READ** | \- **GENERIC\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_WRITE**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_WRITE**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_READ** | \- **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |
| **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** | \- **GENERIC\_READ**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE**<br>\- **GENERIC\_READ**, **GENERIC\_WRITE**, **FILE\_SHARE\_READ**, **FILE\_SHARE\_WRITE** |

In addition to the standard file attributes, you can also specify security attributes by including a pointer to a [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa379560(v=vs.85)) structure as the fourth parameter of [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea). However, the underlying file system must support security for this to have any effect (for example, the NTFS file system supports it but the various FAT file systems do not). For more information about security attributes, see [Access Control](https://learn.microsoft.com/en-us/windows/win32/SecAuthZ/access-control).

An application creating a new file can supply an optional handle to a template file, from which [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) takes file attributes and extended attributes for creation of the new file.

[Section titled: CreateFile Scenarios](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#createfile-scenarios)

## CreateFile Scenarios

There are several fundamental scenarios for initiating access to a file using the [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function. These are summarized as:

- Creating a new file when a file with that name does not already exist.
- Creating a new file even if a file of the same name already exists, clearing its data and starting empty.
- Opening an existing file only if it exists, and only intact.
- Opening an existing file only if it exists, truncating it to be empty.
- Opening a file always: as-is if it exists, creating a new one if it does not exist.

These scenarios are controlled by the proper use of the _dwCreationDisposition_ parameter. Below is a breakdown of how these scenarios map to values for this parameter and what happens when they are used.

When creating or opening a new file when a file with that name does not already exist ( _dwCreationDisposition_ set to either **CREATE\_NEW**, **CREATE\_ALWAYS**, or **OPEN\_ALWAYS**), the [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function performs the following actions:

- Combines the file attributes and flags specified by _dwFlagsAndAttributes_ with **FILE\_ATTRIBUTE\_ARCHIVE**.
- Sets the file length to zero.
- Copies the extended attributes supplied by the template file to the new file if the _hTemplateFile_ parameter is specified (this overrides all **FILE\_ATTRIBUTE\_\*** flags specified earlier).
- Sets the inherit flag specified by the **bInheritHandle** member and the security descriptor specified by the **lpSecurityDescriptor** member of the _lpSecurityAttributes_ parameter ( [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa379560(v=vs.85)) structure), if supplied.

When creating a new file even if a file of the same name already exists ( _dwCreationDisposition_ set to **CREATE\_ALWAYS**), the [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function performs the following actions:

- Checks current file attributes and security settings for write access, failing if denied.
- Combines the file attributes and flags specified by _dwFlagsAndAttributes_ with **FILE\_ATTRIBUTE\_ARCHIVE** and the existing file attributes.
- Sets the file length to zero (that is, any data that was in the file is no longer available and the file is empty).
- Copies the extended attributes supplied by the template file to the new file if the _hTemplateFile_ parameter is specified (this overrides all **FILE\_ATTRIBUTE\_\*** flags specified earlier).
- Sets the inherit flag specified by the **bInheritHandle** member of the _lpSecurityAttributes_ parameter ( [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa379560(v=vs.85)) structure) if supplied, but ignores the **lpSecurityDescriptor** member of the **SECURITY\_ATTRIBUTES** structure.
- If otherwise successful (that is, [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) returns a valid handle), calling [GetLastError](https://learn.microsoft.com/en-us/windows/win32/api/errhandlingapi/nf-errhandlingapi-getlasterror) will yield the code **ERROR\_ALREADY\_EXISTS**, even though for this particular use-case it is not actually an error as such (if you intended to create a "new" (empty) file in place of the existing one).

When opening an existing file ( _dwCreationDisposition_ set to either **OPEN\_EXISTING**, **OPEN\_ALWAYS**, or **TRUNCATE\_EXISTING**), the [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function performs the following actions:

- Checks current file attributes and security settings for requested access, failing if denied.
- Combines the file flags ( **FILE\_FLAG\_\***) specified by _dwFlagsAndAttributes_ with existing file attributes, and ignores any file attributes ( **FILE\_ATTRIBUTE\_\***) specified by _dwFlagsAndAttributes_.
- Sets the file length to zero only if _dwCreationDisposition_ is set to **TRUNCATE\_EXISTING**, otherwise the current file length is maintained and the file is opened as-is.
- Ignores the _hTemplateFile_ parameter.
- Sets the inherit flag specified by the **bInheritHandle** member of the _lpSecurityAttributes_ parameter ( [SECURITY\_ATTRIBUTES](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/legacy/aa379560(v=vs.85)) structure) if supplied, but ignores the **lpSecurityDescriptor** member of the **SECURITY\_ATTRIBUTES** structure.

[Section titled: File Attributes and Directories](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#file-attributes-and-directories)

## File Attributes and Directories

File attributes are part of the metadata associated with a file or directory, each with its own purpose and rules on how it can be set and changed. Some of these attributes apply only to files, and some only to directories. For example, the **FILE\_ATTRIBUTE\_DIRECTORY** attribute applies only to directories: It is used by the file system to determine whether an object on disk is a directory, but it cannot be changed for an existing file system object.

Some file attributes can be set for a directory but have meaning only for files created in that directory, acting as default attributes. For example, **FILE\_ATTRIBUTE\_COMPRESSED** can be set on a directory object, but because the directory object itself contains no actual data, it is not truly compressed; however, directories marked with this attribute tell the file system to compress any new files added to that directory. Any file attribute that can be set on a directory and will also be set for new files added to that directory is referred to as an _inherited attribute_.

The [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) function provides a parameter for setting certain file attributes when a file is created. In general, these attributes are the most common for an application to use at file creation time, but not all possible file attributes are available to **CreateFile**. Some file attributes require the use of other functions, such as [SetFileAttributes](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-setfileattributesa), [DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol), or [DecryptFile](https://learn.microsoft.com/en-us/windows/win32/api/WinBase/nf-winbase-decryptfilea) after the file already exists. In the case of **FILE\_ATTRIBUTE\_DIRECTORY**, the [CreateDirectory](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createdirectorya) function is required at creation time because **CreateFile** cannot create directories. The other file attributes that require special handling are **FILE\_ATTRIBUTE\_REPARSE\_POINT** and **FILE\_ATTRIBUTE\_SPARSE\_FILE**, which require **DeviceIoControl**. For more information, see [SetFileAttributes](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-setfileattributesa).

As stated previously, file attribute inheritance occurs when a file is created with file attributes read from the directory attributes where the file will be located. The following table summarizes these inherited attributes and how they relate to [CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea) capabilities.

Expand table

| Directory attribute state | CreateFile inheritance override capability for new files |
| --- | --- |
| **FILE\_ATTRIBUTE\_COMPRESSED** set. | No control. Use [DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) to clear. |
| **FILE\_ATTRIBUTE\_COMPRESSED** not set. | No control. Use [DeviceIoControl](https://learn.microsoft.com/en-us/windows/desktop/api/ioapiset/nf-ioapiset-deviceiocontrol) to set. |
| **FILE\_ATTRIBUTE\_ENCRYPTED** set. | No control. Use [DecryptFile](https://learn.microsoft.com/en-us/windows/desktop/api/WinBase/nf-winbase-decryptfilea). |
| **FILE\_ATTRIBUTE\_ENCRYPTED** not set. | Can be set using [CreateFile](https://learn.microsoft.com/en-us/windows/desktop/api/FileAPI/nf-fileapi-createfilea). |
| **FILE\_ATTRIBUTE\_NOT\_CONTENT\_INDEXED** set. | No control. Use [SetFileAttributes](https://learn.microsoft.com/en-us/windows/desktop/api/FileAPI/nf-fileapi-setfileattributesa) to clear. |
| **FILE\_ATTRIBUTE\_NOT\_CONTENT\_INDEXED** not set. | No control. Use [SetFileAttributes](https://learn.microsoft.com/en-us/windows/desktop/api/FileAPI/nf-fileapi-setfileattributesa) to set. |

[Section titled: Related content](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#related-content)

## Related content

[Access Control](https://learn.microsoft.com/en-us/windows/win32/SecAuthZ/access-control)

[CreateFile](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-createfilea)

[DeviceIoControl](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-deviceiocontrol)

[File Attribute Constants](https://learn.microsoft.com/en-us/windows/win32/fileio/file-attribute-constants)

[File Compression and Decompression](https://learn.microsoft.com/en-us/windows/win32/fileio/file-compression-and-decompression)

[File Encryption](https://learn.microsoft.com/en-us/windows/win32/fileio/file-encryption)

[File Management Functions](https://learn.microsoft.com/en-us/windows/win32/fileio/file-management-functions)

[Handles and Objects](https://learn.microsoft.com/en-us/windows/win32/SysInfo/handles-and-objects)

[Handle Inheritance](https://learn.microsoft.com/en-us/windows/win32/SysInfo/handle-inheritance)

[Opening a File for Reading or Writing](https://learn.microsoft.com/en-us/windows/win32/fileio/opening-a-file-for-reading-or-writing)

[SetFileAttributes](https://learn.microsoft.com/en-us/windows/win32/api/FileAPI/nf-fileapi-setfileattributesa)

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

- Last updated on 07/17/2026

Ask Learn is an AI assistant that can answer questions, clarify concepts, and define terms using trusted Microsoft documentation.

Please sign in to use Ask Learn.

[Sign in](https://learn.microsoft.com/en-us/windows/win32/fileio/creating-and-opening-files#)
