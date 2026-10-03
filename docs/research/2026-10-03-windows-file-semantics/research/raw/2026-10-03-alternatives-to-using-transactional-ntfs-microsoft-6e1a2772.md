---
url: https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf
retrieved: 2026-10-03
command: firecrawl scrape https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf --only-main-content --json
statusCode: 200
transport: firecrawl-cli
completeness: full
title: Alternatives to using Transactional NTFS - Win32 apps | Microsoft Learn
---
Table of contents Exit editor mode

Ask LearnAsk Learn

Reading modeTable of contents[Read in English](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf)Add to CollectionsAdd to Plans[Edit](https://github.com/MicrosoftDocs/win32/blob/docs/desktop-src/FileIO/deprecation-of-txf.md)

* * *

Copy MarkdownPrint

* * *

Note

Access to this page requires authorization. You can try [signing in](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#) or changing directories.


Access to this page requires authorization. You can try changing directories.


# Alternatives to using Transactional NTFS

Feedback

Summarize this article for me


- [Abstract](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#abstract)
- [Introduction](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#introduction)
- [Alternatives to TxF by Scenario](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#alternatives-to-txf-by-scenario)
- [Applications updating a single file with "document-like" data](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-updating-a-single-file-with-document-like-data)
- [Applications performing updates to multiple files and/or to the registry hive](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-performing-updates-to-multiple-files-andor-to-the-registry-hive)
- [Applications managing a set of structured data](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-managing-a-set-of-structured-data)
- [Applications with Transactions involving files on a local NTFS volume and Tables in an external SQL database](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-with-transactions-involving-files-on-a-local-ntfs-volume-and-tables-in-an-external-sql-database)
- [Closing & Recommended Action](https://learn.microsoft.com/en-us/windows)

[Section titled: Abstract](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#abstract)

## Abstract

Microsoft strongly recommends developers investigate utilizing the discussed alternatives (or in some cases, investigate other alternatives) rather than adopting an API platform which may not be available in future versions of Windows.

[Section titled: Introduction](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#introduction)

## Introduction

TxF was introduced with Windows Vista as a means to introduce atomic file transactions to Windows. It allows for Windows developers to have transactional atomicity for file operations in transactions with a single file, in transactions involving multiple files, and in transactions spanning multiple sources – such as the Registry (through TxR), and databases (such as SQL). While TxF is a powerful set of APIs, there has been extremely limited developer interest in this API platform since Windows Vista primarily due to its complexity and various nuances which developers need to consider as part of application development. As a result, Microsoft is considering deprecating TxF APIs in a future version of Windows to focus development and maintenance efforts on other features and APIs which have more value to a larger majority of customers. The next section describes sample alternative methods to achieve similar results as TxF would for several types of application scenarios.

[Section titled: Alternatives to TxF by Scenario](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#alternatives-to-txf-by-scenario)

## Alternatives to TxF by Scenario

With the limitations described above, developers should investigate alternatives to TxF to cover application scenarios which are not met by TxF. Discussed here are some suggested alternatives to common uses of TxF for developers to consider. Note that this list is neither exhaustive nor complete.

[Section titled: Applications updating a single file with "document-like" data](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-updating-a-single-file-with-document-like-data)

## Applications updating a single file with "document-like" data

Many applications which deal with "document-like" data tend to load the entire document into memory, operate on it, and then write it back out to save the changes. The needed atomicity here is that the changes either are completely applied or not applied at all, as an inconsistent state would render the file corrupt. A common approach is to write the document to a new file, then replace the original file with the new one. One method to do this is with the [**ReplaceFile**](https://learn.microsoft.com/en-us/windows/desktop/api/WinBase/nf-winbase-replacefilea) API.

[Section titled: Applications performing updates to multiple files and/or to the registry hive](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-performing-updates-to-multiple-files-andor-to-the-registry-hive)

## Applications performing updates to multiple files and/or to the registry hive

There are many applications which need to atomically perform an update to a set of files and to the registry. This scenario is most commonly achieved through an installer application, such as Windows Installer. For more information on Windows Installer, please refer to [Windows Installer](https://learn.microsoft.com/en-us/windows/desktop/Msi/windows-installer-portal).

[Section titled: Applications managing a set of structured data](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-managing-a-set-of-structured-data)

## Applications managing a set of structured data

Many applications manage some set of proprietary data structures of varying types as a means to store data. A significant challenge for these applications is the process of maintaining the integrity of internal pointers/references if a failure occurs during an update operation. Creating the mechanism for this is indeed a "hard problem", and therefore most applications will rely on a true database server to manage their dataset.

Two suggestions to help manage structured data are:

- Microsoft provides the Extensible Storage Engine (ESE) inbox in Windows to enable applications to perform transacted data update and retrieval operations. For more information on the Extensible Storage Engine (ESE), please see [https://msdn.microsoft.com/library/gg269259.aspx](https://msdn.microsoft.com/library/gg269259.aspx).
- For applications that require a more powerful, robust, and scalable database provider, it is recommended that customers consider using the Filestream feature available with Microsoft SQL Server. For more information on SQL Filestreams, please see [https://technet.microsoft.com/library/bb933993.aspx](https://technet.microsoft.com/library/bb933993.aspx).

[Section titled: Applications with Transactions involving files on a local NTFS volume and Tables in an external SQL database](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#applications-with-transactions-involving-files-on-a-local-ntfs-volume-and-tables-in-an-external-sql-database)

## Applications with Transactions involving files on a local NTFS volume and Tables in an external SQL database

There are classes of applications which either have large dataset needs, or need to have transactional atomicity in an operation involving an external database and local storage. For this scenario, it is highly recommended that developers consider using SQL Filestreams to perform transactional file operations. For more information on SQL Filestreams, please see [https://technet.microsoft.com/library/bb933993.aspx](https://technet.microsoft.com/library/bb933993.aspx).

[Section titled: Closing & Recommended Action](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#closing--recommended-action)

## Closing & Recommended Action

TxF is a complex and nuanced set of APIs which are not commonly used by 3rd party applications. With the possibility that these APIs may not be available in future versions of Windows, and the fact that there are simpler alternative means to achieve many of the scenarios which TxF was developed for, Microsoft strongly recommends developers to investigate those alternative means instead of creating a dependency on TxF in their applications.

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

Training

Learning path

[Program with Transact-SQL - Training](https://learn.microsoft.com/en-us/training/paths/program-transact-sql/?source=recommendations)

Program with Transact-SQL

* * *

- Last updated on 01/07/2021

Ask Learn is an AI assistant that can answer questions, clarify concepts, and define terms using trusted Microsoft documentation.

Please sign in to use Ask Learn.

[Sign in](https://learn.microsoft.com/en-us/windows/win32/fileio/deprecation-of-txf#)
