/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// external imports
import { fileTypeFromBuffer } from "file-type";
// plane imports
import type { TFileMetaDataLite, TFileSignedURLResponse } from "@plane/types";
import { DANGEROUS_EXTENSIONS } from "@plane/constants";

/**
 * @description Filename validation - checks for double extensions and dangerous patterns
 * @param {string} filename
 * @returns {string | null} Error message if invalid, null if valid
 */
const validateFilename = (filename: string): string | null => {
  if (!filename || filename.trim().length === 0) {
    return "Filename cannot be empty";
  }

  // Check for dot files (e.g., .htaccess, .env)
  if (filename.startsWith(".")) {
    return "Hidden files (starting with dot) are not allowed";
  }

  // Check for path separators
  if (filename.includes("/") || filename.includes("\\")) {
    return "Filename cannot contain path separators";
  }

  const parts = filename.split(".");

  // Check for double extensions with dangerous patterns
  if (parts.length >= 3) {
    const secondLastExt = parts[parts.length - 2]?.toLowerCase() || "";
    if (DANGEROUS_EXTENSIONS.includes(secondLastExt)) {
      return "File has suspicious double extension";
    }
  }

  // Check if the actual extension is dangerous
  const extension = parts[parts.length - 1]?.toLowerCase() || "";
  if (DANGEROUS_EXTENSIONS.includes(extension)) {
    return `File extension '${extension}' is not allowed`;
  }

  return null;
};

/**
 * @description from the provided signed URL response, generate a payload to be used to upload the file
 * @param {TFileSignedURLResponse} signedURLResponse
 * @param {File} file
 * @returns {FormData} file upload request payload
 */
export const generateFileUploadPayload = (signedURLResponse: TFileSignedURLResponse, file: File): FormData => {
  const formData = new FormData();
  Object.entries(signedURLResponse.upload_data.fields).forEach(([key, value]) => formData.append(key, value));
  formData.append("file", file);
  return formData;
};

/**
 * @description Detect MIME type from file signature using file-type library
 * @param {File} file
 * @returns {Promise<string>} detected MIME type or empty string if unknown
 */
const detectMimeTypeFromSignature = async (file: File): Promise<string> => {
  try {
    // Read first 4KB which is usually sufficient for most file type detection
    const chunk = file.slice(0, 4096);
    const buffer = await chunk.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    const fileType = await fileTypeFromBuffer(uint8Array);
    return fileType?.mime || "";
  } catch (_error) {
    return "";
  }
};

/**
 * Wrapper formats that carry no information about what the file actually is:
 * OLE2 compound files (.xls/.doc/.ppt/.msg) and zip archives (every OOXML document).
 */
const GENERIC_CONTAINER_TYPES = new Set(["application/x-cfb", "application/zip"]);

/**
 * @description Validate and detect the MIME type of a file using signature detection
 * Also performs basic security checks on filename
 * @param {File} file
 * @returns {Promise<string>} validated and detected MIME type
 */
const validateAndDetectFileType = async (file: File): Promise<string> => {
  // Basic filename validation
  const filenameError = validateFilename(file.name);
  if (filenameError) {
    console.warn(`File validation warning: ${filenameError}`);
  }

  try {
    const signatureType = await detectMimeTypeFromSignature(file);
    // A signature can only identify the *container*, which for Office documents says
    // almost nothing: every legacy .xls/.doc/.ppt is an OLE2 compound file, and every
    // .xlsx/.docx (or one whose header did not fit in the sampled bytes) is a zip. The
    // browser's own type, derived from the extension, is the more specific of the two
    // and the one worth storing — so let it win for those two wrapper formats only.
    if (signatureType && !(GENERIC_CONTAINER_TYPES.has(signatureType) && file.type)) {
      return signatureType;
    }
  } catch (_error) {
    console.warn("Error detecting file type from signature:", _error);
  }

  // Signature detection only recognises files with a distinctive magic-byte header, so it
  // returns nothing for text-based payloads — including the CSV/HTML exports that accounting
  // and ERP tools hand out under an .xlsx/.xls name. Returning "" here made the server reject
  // the upload with "Invalid file type", even for types that are on its allowlist. Fall back
  // to the browser's own MIME (derived from the extension) before giving up.
  if (file.type) {
    return file.type;
  }

  // an unnamed/extension-less file: let the server's allowlist decide
  return "application/octet-stream";
};

/**
 * @description returns the necessary file meta data to upload a file
 * @param {File} file
 * @returns {Promise<TFileMetaDataLite>} payload with file info
 */
export const getFileMetaDataForUpload = async (file: File): Promise<TFileMetaDataLite> => {
  const fileType = await validateAndDetectFileType(file);
  return {
    name: file.name,
    size: file.size,
    type: fileType,
  };
};

/**
 * @description this function returns the assetId from the asset source
 * @param {string} src
 * @returns {string} assetId
 */
export const getAssetIdFromUrl = (src: string): string => {
  const sourcePaths = src.split("/");
  const assetUrl = sourcePaths[sourcePaths.length - 1];
  return assetUrl ?? "";
};
