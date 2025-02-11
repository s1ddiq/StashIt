'use server';

import { DeleteFileProps, FileType, GetFilesProps, RenameFileProps, UpdateFileUsersProps, UploadFileProps } from "@/types/index";
import { createAdminClient, createSessionClient } from "../appwrite";
import { InputFile } from "node-appwrite/file";
import { ID, Models, Query } from "node-appwrite";
import { appwriteConfig } from "../appwrite/config";
import { constructFileUrl, getFileType, parseStringify } from "../utils";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "./user.actions";

const handleError = (error: unknown, message: string) => {
  console.log(error, message);
  throw error;
}


const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk (adjust as needed)

export const uploadFile = async ({ file, ownerId, accountId, path }: UploadFileProps) => {
  const { storage, databases } = await createAdminClient();
  
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  let currentChunk = 0;
  const fileId = ID.unique(); // Unique ID for the whole file

  try {
    // Create the file metadata to store in the database
    const fileDocument = {
      type: getFileType(file.name).type,
      name: file.name,
      url: "", // Will be updated once file is uploaded
      extension: getFileType(file.name).extension,
      size: file.size,
      owner: ownerId,
      accountId,
      users: [],
      bucketFileId: fileId, // Save the unique file ID
    };

    // Create file document first (before upload)
    const newFileDoc = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      ID.unique(),
      fileDocument
    );
    
    // Function to handle chunk upload
    const uploadChunk = async (chunk: Blob, chunkIndex: number) => {
      const chunkFile = InputFile.fromBuffer(chunk, `${file.name}-chunk-${chunkIndex}`);
      const bucketFile = await storage.createFile(appwriteConfig.bucketId, fileId, chunkFile);

      console.log(`Uploaded chunk ${chunkIndex + 1}/${totalChunks}`);
      return bucketFile;
    };

    // Upload chunks sequentially or in parallel
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      await uploadChunk(chunk, i);  // You can parallelize this if necessary
    }

    // Update the file document URL with the file's location (after upload)
    const fileDocumentUrl = constructFileUrl(fileId); // Construct URL based on ID
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      newFileDoc.$id,
      { url: fileDocumentUrl }
    );

    // Revalidate the path
    revalidatePath(path);
    return parseStringify(newFileDoc);

  } catch (error) {
    handleError(error, 'Failed to upload files');
  }
};

const createQueries = (currentUser: Models.Document, types: string[], searchText: string, sort: string, limit: number) => {
  const queries = [
    Query.or([
      Query.equal('owner', [currentUser.$id]),
      Query.contains('users', [currentUser.email])
    ]),
  ];

  if(types.length > 0) queries.push(Query.equal('type', types))
  if(searchText) queries.push(Query.contains('name', searchText))
  if(limit) queries.push(Query.limit(limit))
  
    const [sortBy, orderBy] = sort.split('-');
    queries.push(orderBy === 'asc' ? Query.orderAsc(sortBy) : Query.orderDesc(sortBy));
  return queries;
}

export const getFiles = async ({types = [], searchText = '', sort = '$createdAt-desc', limit}: GetFilesProps) => {
  const {databases} = await createAdminClient();
  try {
    const currentUser = await getCurrentUser();
    if(!currentUser) throw new Error('User not found.');

    const queries = createQueries(currentUser, types, searchText, sort, limit ?? 0);

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      queries,
    );

    console.log({files})
    return parseStringify(files);
  } catch (error) {
    handleError(error, 'Failed to fetch files')
  }
}

export const renameFile = async ({fileId, name, extension, path}: RenameFileProps) => {
  const {databases} = await createAdminClient();

  console.log('renaming file...')
  try {
    const newName = `${name}.${extension}`;
    const updatedFile = await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId, {name: newName});

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, 'Failed to rename file')
  }
}

export const updateFileUsers = async ({fileId, emails, path}: UpdateFileUsersProps) => {
  const {databases} = await createAdminClient();

  console.log('sharing file...')
  try {
    const updatedFile = await databases.updateDocument(appwriteConfig.databaseId, appwriteConfig.filesCollectionId, fileId, {users: emails});

    revalidatePath(path);
    return parseStringify(updatedFile);
  } catch (error) {
    handleError(error, 'Failed to share file')
  }
}

export const deleteFile = async ({
  fileId,
  bucketFileId,
  path,
}: DeleteFileProps) => {
  const { databases, storage } = await createAdminClient();

  try {
    const deletedFile = await databases.deleteDocument(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      fileId,
    );

    if (deletedFile) {
      await storage.deleteFile(appwriteConfig.bucketId, bucketFileId);
    }

    revalidatePath(path);
    return parseStringify({ status: "success" });
  } catch (error) {
    handleError(error, "Failed to rename file");
  }
};

export async function getTotalSpaceUsed () {
  
  try {
    const {databases} = await createSessionClient();
    const currentUser = await getCurrentUser();
    if(!currentUser) throw new Error('User is not authenticated');

    const files = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.filesCollectionId,
      [Query.equal('owner', [currentUser.$id])],
    )

    const totalSpace = {
      image: {size: 0, latestDate: ""},
      document: {size: 0, latestDate: ""},
      video: {size: 0, latestDate: ""},
      audio: {size: 0, latestDate: ""},
      other: {size: 0, latestDate: ""},
      used: 0,
      all: 2 * 1024 * 1024 * 1024
    }

    files.documents.forEach((file) => {
      const fileType = file.type as FileType;
      totalSpace[fileType].size += file.size;
      totalSpace.used += file.size;

      if(!totalSpace[fileType].latestDate || new Date(file.$updatedAt) > new Date(totalSpace[fileType].latestDate)) {
        totalSpace[fileType].latestDate = file.$updatedAt;
      }

    })

    return parseStringify(totalSpace);
  } catch (error) {
    handleError(error, 'Failed to fetch all files')
  }
}


